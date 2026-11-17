create table public.raffle_review_alerts (
 order_id uuid primary key references public.raffle_orders(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','sending','sent','failed','cancelled')),
 attempts int not null default 0,lease_until timestamptz,next_attempt_at timestamptz not null default clock_timestamp(),
 provider_id text,error_code text,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz
);
alter table public.raffle_review_alerts enable row level security;
revoke all on public.raffle_review_alerts from public,anon,authenticated;
grant all on public.raffle_review_alerts to service_role;
create function public.raffle_enqueue_review_alert() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='review' and old.status is distinct from 'review' and not new.is_test then
  insert into raffle_review_alerts(order_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger raffle_review_alert after update of status on public.raffle_orders for each row execute function public.raffle_enqueue_review_alert();
insert into public.raffle_review_alerts(order_id) select id from public.raffle_orders where status='review' and not is_test on conflict do nothing;
create function public.raffle_claim_review_alerts() returns table(order_id uuid,attempts int,payload jsonb) language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update raffle_review_alerts a set status='cancelled',lease_until=null where a.status in('pending','sending') and exists(select 1 from raffle_orders o where o.id=a.order_id and (o.status<>'review' or o.is_test));
 update raffle_review_alerts a set status='failed',error_code='RETRY_LIMIT',lease_until=null where a.attempts>=8 and a.status='sending' and a.lease_until<clock_timestamp();
 return query with candidates as (
  select a.order_id from raffle_review_alerts a join raffle_orders o on o.id=a.order_id
  where o.status='review' and not o.is_test and a.attempts<8 and ((a.status='pending' and a.next_attempt_at<=clock_timestamp()) or (a.status='sending' and a.lease_until<clock_timestamp()))
  order by a.created_at limit 3 for update of a skip locked
 ), claimed as (
  update raffle_review_alerts a set status='sending',attempts=a.attempts+1,lease_until=clock_timestamp()+interval '2 minutes' from candidates c where a.order_id=c.order_id returning a.order_id,a.attempts
 ) select c.order_id,c.attempts,jsonb_build_object('orderId',o.id,'numbers',o.numbers,'totalCents',o.total_cents,'symbol',o.symbol,'txid',coalesce(o.txid,o.wallet_txid)) from claimed c join raffle_orders o on o.id=c.order_id;
end $$;
create function public.raffle_review_alert_sent(p_order uuid,p_attempt int,p_provider text) returns void language sql security definer set search_path=public,pg_temp as $$
 update raffle_review_alerts set status='sent',provider_id=p_provider,sent_at=clock_timestamp(),lease_until=null,error_code=null where order_id=p_order and status='sending' and attempts=p_attempt;
$$;
create function public.raffle_review_alert_failed(p_order uuid,p_attempt int,p_error text,p_delay int default 0) returns void language sql security definer set search_path=public,pg_temp as $$
 update raffle_review_alerts set status=case when attempts>=8 then 'failed' else 'pending' end,error_code=left(p_error,80),lease_until=null,
 next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(60,least(86400,p_delay),least(3600,power(2,attempts)::int*60))) where order_id=p_order and status='sending' and attempts=p_attempt;
$$;
revoke all on function public.raffle_enqueue_review_alert(),public.raffle_claim_review_alerts(),public.raffle_review_alert_sent(uuid,int,text),public.raffle_review_alert_failed(uuid,int,text,int) from public,anon,authenticated;
grant execute on function public.raffle_claim_review_alerts(),public.raffle_review_alert_sent(uuid,int,text),public.raffle_review_alert_failed(uuid,int,text,int) to service_role;
