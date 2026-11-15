-- Apply once to a dedicated Supabase project. All writes go through the server.
create table public.raffle_settings (
 id boolean primary key default true check(id), chain_id bigint not null,
 token_address text not null check(token_address ~ '^0x[0-9a-f]{40}$'),
 recipient text not null check(recipient ~ '^0x[0-9a-f]{40}$'),
 symbol text not null check(symbol in ('USDC','USDT')), decimals int not null check(decimals between 2 and 18),
 closes_at timestamptz not null, sales_enabled boolean not null default false
);
create table public.raffle_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 buyer_name text not null check(length(buyer_name) between 2 and 100),
 buyer_phone text not null check(buyer_phone ~ '^\+[1-9][0-9]{7,14}$'), has_whatsapp boolean not null, contact_consent_at timestamptz not null default clock_timestamp(), numbers int[] not null, total_cents int not null check(total_cents>0),
 expected_units numeric(78,0) not null, chain_id bigint not null, token_address text not null,
 recipient text not null, symbol text not null, decimals int not null,
 status text not null default 'reserved' check(status in ('reserved','expired','review','paid')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 review_until timestamptz, txid text, transfer_log_index int, received_at timestamptz,
 block_hash text, review_note text, reviewed_by text, reviewed_at timestamptz
);
create unique index raffle_once_per_tx on public.raffle_orders(chain_id,txid) where txid is not null;
create index raffle_orders_owner on public.raffle_orders(user_id,created_at desc);
create table public.raffle_numbers (
 number int primary key check(number between 1 and 1200), order_id uuid references public.raffle_orders(id)
);
insert into public.raffle_numbers(number) select generate_series(1,1200);
create table public.raffle_rate_limits(key text primary key, started_at timestamptz not null, attempts int not null);
alter table public.raffle_settings enable row level security;
alter table public.raffle_orders enable row level security;
alter table public.raffle_numbers enable row level security;
alter table public.raffle_rate_limits enable row level security;
revoke all on public.raffle_settings,public.raffle_orders,public.raffle_numbers,public.raffle_rate_limits from anon,authenticated;

create function public.raffle_rate_limit(p_key text, p_limit int, p_seconds int) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v int;
begin
 insert into raffle_rate_limits values(p_key,clock_timestamp(),1)
 on conflict(key) do update set
 attempts=case when raffle_rate_limits.started_at < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else raffle_rate_limits.attempts+1 end,
 started_at=case when raffle_rate_limits.started_at < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else raffle_rate_limits.started_at end
 returning attempts into v;
 return v<=p_limit;
end $$;

-- One transaction lock serializes the small 1,200-number inventory across server instances.
create function public.raffle_expire() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(7162401);
 update raffle_orders set status='expired' where status='reserved' and expires_at<clock_timestamp();
 update raffle_numbers n set order_id=null from raffle_orders o where n.order_id=o.id and (o.status='expired' or (o.status='review' and o.review_until<clock_timestamp()));
end $$;
create function public.raffle_inventory() returns int[] language plpgsql security definer set search_path=public,pg_temp as $$
declare v int[];
begin
 perform raffle_expire();
 select coalesce(array_agg(number order by number),'{}') into v from raffle_numbers where order_id is not null;
 return v;
end $$;
create function public.raffle_create_order(p_user uuid,p_name text,p_phone text,p_whatsapp boolean,p_numbers int[]) returns public.raffle_orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare s raffle_settings; o raffle_orders; n int; cents int;
begin
 perform raffle_expire();
 select * into s from raffle_settings where id=true;
 if not found or not s.sales_enabled or s.closes_at<=clock_timestamp() then raise exception 'SALES_CLOSED'; end if;
 n:=cardinality(p_numbers);
 if n is null or n<1 or n>50 or n<>(select count(distinct x) from unnest(p_numbers) x) or exists(select 1 from unnest(p_numbers) x where x is null or x<1 or x>1200) then raise exception 'INVALID_NUMBERS'; end if;
 if (select count(*) from raffle_orders where user_id=p_user and status in ('reserved','review') and (status='review' or expires_at>clock_timestamp()))>=3 then raise exception 'TOO_MANY_PENDING'; end if;
 if exists(select 1 from raffle_numbers where number=any(p_numbers) and order_id is not null) then raise exception 'NUMBERS_UNAVAILABLE'; end if;
 cents:=n*400; if n>=4 then cents:=cents*9/10; end if;
 insert into raffle_orders(user_id,buyer_name,buyer_phone,has_whatsapp,numbers,total_cents,expected_units,chain_id,token_address,recipient,symbol,decimals,expires_at)
 values(p_user,trim(p_name),p_phone,p_whatsapp,p_numbers,cents,cents*power(10::numeric,s.decimals-2),s.chain_id,s.token_address,s.recipient,s.symbol,s.decimals,least(clock_timestamp()+interval '30 minutes',s.closes_at)) returning * into o;
 update raffle_numbers set order_id=o.id where number=any(p_numbers);
 return o;
end $$;

-- Funds verification is NOT ownership verification. Never mark paid here.
create function public.raffle_record_transfer(p_order uuid,p_user uuid,p_txid text,p_log int,p_block text,p_received timestamptz) returns public.raffle_orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare o raffle_orders;
begin
 perform raffle_expire();
 select * into o from raffle_orders where id=p_order and user_id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status in ('paid','review') and o.txid=lower(p_txid) then return o; end if;
 if o.txid is not null then raise exception 'ALREADY_SUBMITTED'; end if;
 if p_txid !~ '^0x[0-9a-fA-F]{64}$' or p_log<0 then raise exception 'INVALID_TRANSFER'; end if;
 if p_received<o.created_at then raise exception 'TRANSFER_TOO_OLD'; end if;
 update raffle_orders set status='review',txid=lower(p_txid),transfer_log_index=p_log,block_hash=p_block,received_at=p_received,
 review_until=clock_timestamp()+interval '24 hours' where id=o.id returning * into o;
 -- Expired reservations are never silently re-acquired; manual resolution is required.
 return o;
end $$;

-- Service-only administrative action, intentionally NOT exposed by the HTTP API.
-- Operator must establish ownership through independent evidence before invoking.
create function public.raffle_approve(p_order uuid,p_operator text,p_evidence text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o raffle_orders;
begin
 perform raffle_expire();
 select * into o from raffle_orders where id=p_order for update;
 if not found or o.status<>'review' or o.txid is null then raise exception 'NOT_IN_REVIEW'; end if;
 if length(trim(p_operator))<3 or length(trim(p_evidence))<20 then raise exception 'EVIDENCE_REQUIRED'; end if;
 if o.review_until<clock_timestamp() or (select count(*) from raffle_numbers where number=any(o.numbers) and order_id=o.id)<>cardinality(o.numbers) then raise exception 'MANUAL_REFUND_REQUIRED'; end if;
 update raffle_orders set status='paid',review_note=p_evidence,reviewed_by=p_operator,reviewed_at=clock_timestamp() where id=o.id;
end $$;
revoke all on function public.raffle_rate_limit(text,int,int),public.raffle_expire(),public.raffle_inventory(),public.raffle_create_order(uuid,text,text,boolean,int[]),public.raffle_record_transfer(uuid,uuid,text,int,text,timestamptz),public.raffle_approve(uuid,text,text) from public,anon,authenticated;
grant execute on function public.raffle_rate_limit(text,int,int),public.raffle_expire(),public.raffle_inventory(),public.raffle_create_order(uuid,text,text,boolean,int[]),public.raffle_record_transfer(uuid,uuid,text,int,text,timestamptz),public.raffle_approve(uuid,text,text) to service_role;

grant all on public.raffle_settings,public.raffle_orders,public.raffle_numbers,public.raffle_rate_limits to service_role;

