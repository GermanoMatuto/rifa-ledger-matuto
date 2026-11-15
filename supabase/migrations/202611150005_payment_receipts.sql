create table public.raffle_receipts (
 order_id uuid primary key references raffle_orders(id),recipient text not null,payload jsonb not null,
 status text not null default 'pending' check(status in('pending','sending','sent','failed')),
 attempts int not null default 0,first_attempt_at timestamptz,lease_until timestamptz,next_attempt_at timestamptz not null default clock_timestamp(),
 provider_id text,error_code text,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz
);
alter table public.raffle_receipts enable row level security;
revoke all on public.raffle_receipts from public,anon,authenticated;
grant all on public.raffle_receipts to service_role;
create function public.raffle_enqueue_receipt() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare email_to text;
begin
 if new.status='paid' and old.status is distinct from 'paid' then
  select coalesce(g.email,u.email) into email_to from raffle_orders o left join raffle_guests g on g.token_hash=o.guest_session_hash left join auth.users u on u.id=o.user_id and u.email_confirmed_at is not null where o.id=new.id;
  insert into raffle_receipts(order_id,recipient,payload,status,error_code)
  values(new.id,coalesce(email_to,''),jsonb_build_object('orderId',new.id,'name',new.buyer_name,'numbers',new.numbers,'totalCents',new.total_cents,'symbol',new.symbol,'isTest',new.is_test,'txid',new.txid),case when email_to is null then 'failed' else 'pending' end,case when email_to is null then 'NO_RECIPIENT' else null end)
  on conflict(order_id) do nothing;
 end if;
 return new;
end $$;
create trigger raffle_payment_receipt after update of status on raffle_orders for each row execute function raffle_enqueue_receipt();
create function public.raffle_claim_receipts(p_order uuid default null) returns setof public.raffle_receipts language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Avoid re-sending after the provider's 24-hour idempotency retention window.
 update raffle_receipts set status='failed',error_code='RETRY_WINDOW_EXPIRED',lease_until=null where status in('pending','sending') and first_attempt_at<clock_timestamp()-interval '23 hours' and (lease_until is null or lease_until<clock_timestamp());
 update raffle_receipts set status='failed',error_code='RETRY_LIMIT',lease_until=null where status in('pending','sending') and attempts>=6 and (lease_until is null or lease_until<clock_timestamp());
 return query with candidates as (select order_id from raffle_receipts where (p_order is null or order_id=p_order) and attempts<6 and ((status='pending' and next_attempt_at<=clock_timestamp()) or (status='sending' and lease_until<clock_timestamp())) order by created_at limit 5 for update skip locked)
 update raffle_receipts r set status='sending',attempts=r.attempts+1,first_attempt_at=coalesce(r.first_attempt_at,clock_timestamp()),lease_until=clock_timestamp()+interval '2 minutes' from candidates c where r.order_id=c.order_id returning r.*;
end $$;
create function public.raffle_receipt_sent(p_order uuid,p_attempt int,p_provider text) returns void language sql security definer set search_path=public,pg_temp as $$
 update raffle_receipts set status='sent',provider_id=p_provider,sent_at=clock_timestamp(),lease_until=null,error_code=null where order_id=p_order and status='sending' and attempts=p_attempt;
$$;
create function public.raffle_receipt_failed(p_order uuid,p_attempt int,p_error text) returns void language sql security definer set search_path=public,pg_temp as $$
 update raffle_receipts set status=case when attempts>=6 then 'failed' else 'pending' end,error_code=left(p_error,80),lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempts)::int*60)) where order_id=p_order and status='sending' and attempts=p_attempt;
$$;
revoke all on function public.raffle_enqueue_receipt(),public.raffle_claim_receipts(uuid),public.raffle_receipt_sent(uuid,int,text),public.raffle_receipt_failed(uuid,int,text) from public,anon,authenticated;
grant execute on function public.raffle_claim_receipts(uuid),public.raffle_receipt_sent(uuid,int,text),public.raffle_receipt_failed(uuid,int,text) to service_role;
