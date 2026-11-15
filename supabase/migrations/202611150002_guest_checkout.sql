-- Guest access uses a random HttpOnly cookie; only its hash is stored.
create table public.raffle_guests (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 email text not null check(length(email) between 3 and 254),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 days'
);
create table public.raffle_test_access(email text primary key, enabled boolean not null default false);
alter table public.raffle_guests enable row level security;
alter table public.raffle_test_access enable row level security;
revoke all on public.raffle_guests,public.raffle_test_access from public,anon,authenticated;
grant all on public.raffle_guests,public.raffle_test_access to service_role;
alter table public.raffle_orders alter column user_id drop not null;
alter table public.raffle_orders add column guest_session_hash text references public.raffle_guests(token_hash);
alter table public.raffle_orders add column is_test boolean not null default false;
alter table public.raffle_orders add constraint raffle_order_owner check(user_id is not null or guest_session_hash is not null);
create index raffle_guest_orders_owner on public.raffle_orders(guest_session_hash,created_at desc);
create index raffle_guests_email on public.raffle_guests(email);

create function public.raffle_create_guest_order(p_hash text,p_email text,p_name text,p_phone text,p_whatsapp boolean,p_numbers int[],p_test boolean default false) returns public.raffle_orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare s raffle_settings; o raffle_orders; n int; cents int;
begin
 perform raffle_expire();
 if p_hash !~ '^[0-9a-f]{64}$' or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_CONTACT'; end if;
 select * into s from raffle_settings where id=true;
 if not found then raise exception 'SALES_CLOSED'; end if;
 if p_test then
   if not exists(select 1 from raffle_test_access where email=lower(trim(p_email)) and enabled) then raise exception 'TEST_NOT_ALLOWED'; end if;
   if exists(select 1 from raffle_orders existing_order join raffle_guests g on g.token_hash=existing_order.guest_session_hash where g.email=lower(trim(p_email)) and existing_order.is_test and existing_order.status in ('reserved','review') and existing_order.expires_at>clock_timestamp()) then raise exception 'TOO_MANY_PENDING'; end if;
   if cardinality(p_numbers)<>0 then raise exception 'INVALID_NUMBERS'; end if;
   cents:=100;
 else
   if not s.sales_enabled or s.closes_at<=clock_timestamp() then raise exception 'SALES_CLOSED'; end if;
   n:=cardinality(p_numbers);
   if n is null or n<1 or n>50 or n<>(select count(distinct x) from unnest(p_numbers) x) or exists(select 1 from unnest(p_numbers) x where x is null or x<1 or x>1200) then raise exception 'INVALID_NUMBERS'; end if;
   if exists(select 1 from raffle_numbers where number=any(p_numbers) and order_id is not null) then raise exception 'NUMBERS_UNAVAILABLE'; end if;
   cents:=n*400; if n>=5 then cents:=cents*85/100; elsif n>=3 then cents:=cents*9/10; end if;
 end if;
 if (select count(*) from raffle_orders where guest_session_hash=p_hash and status in ('reserved','review') and (status='review' or expires_at>clock_timestamp()))>=3 then raise exception 'TOO_MANY_PENDING'; end if;
 insert into raffle_guests(token_hash,email) values(p_hash,lower(trim(p_email))) on conflict(token_hash) do nothing;
 if not exists(select 1 from raffle_guests where token_hash=p_hash and email=lower(trim(p_email)) and expires_at>clock_timestamp()) then raise exception 'GUEST_EMAIL_MISMATCH'; end if;
 insert into raffle_orders(guest_session_hash,buyer_name,buyer_phone,has_whatsapp,numbers,total_cents,expected_units,chain_id,token_address,recipient,symbol,decimals,expires_at,is_test)
 values(p_hash,trim(p_name),p_phone,p_whatsapp,p_numbers,cents,cents*power(10::numeric,s.decimals-2),s.chain_id,s.token_address,s.recipient,s.symbol,s.decimals,case when p_test then clock_timestamp()+interval '30 minutes' else least(clock_timestamp()+interval '30 minutes',s.closes_at) end,p_test) returning * into o;
 if not p_test then update raffle_numbers set order_id=o.id where number=any(p_numbers); end if;
 return o;
end $$;

create function public.raffle_claim_guest_orders(p_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=p_user and email_confirmed_at is not null;
 if verified_email is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
 update raffle_orders o set user_id=p_user from raffle_guests g where g.token_hash=o.guest_session_hash and g.email=verified_email and o.user_id is null;
end $$;

create function public.raffle_record_guest_transfer(p_order uuid,p_hash text,p_txid text,p_log int,p_block text,p_received timestamptz) returns public.raffle_orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare o raffle_orders;
begin
 perform raffle_expire();
 select r.* into o from raffle_orders r join raffle_guests g on g.token_hash=r.guest_session_hash where r.id=p_order and g.token_hash=p_hash and g.expires_at>clock_timestamp() for update of r;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status in ('paid','review') and o.txid=lower(p_txid) then return o; end if;
 if o.txid is not null then raise exception 'ALREADY_SUBMITTED'; end if;
 if p_txid !~ '^0x[0-9a-fA-F]{64}$' or p_log<0 then raise exception 'INVALID_TRANSFER'; end if;
 if p_received<o.created_at then raise exception 'TRANSFER_TOO_OLD'; end if;
 update raffle_orders set status='review',txid=lower(p_txid),transfer_log_index=p_log,block_hash=p_block,received_at=p_received,review_until=clock_timestamp()+interval '24 hours' where id=o.id returning * into o;
 return o;
end $$;
revoke all on function public.raffle_create_guest_order(text,text,text,text,boolean,int[],boolean),public.raffle_claim_guest_orders(uuid),public.raffle_record_guest_transfer(uuid,text,text,int,text,timestamptz) from public,anon,authenticated;
grant execute on function public.raffle_create_guest_order(text,text,text,text,boolean,int[],boolean),public.raffle_claim_guest_orders(uuid),public.raffle_record_guest_transfer(uuid,text,text,int,text,timestamptz) to service_role;

