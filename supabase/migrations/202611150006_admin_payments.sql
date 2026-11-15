create function public.raffle_admin_payments(p_search text default '',p_status text default 'all',p_include_tests boolean default true,p_offset int default 0) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 with filtered as (
  select o.id,o.buyer_name,o.buyer_phone,o.has_whatsapp,g.email,o.numbers,o.total_cents,o.status,o.is_test,o.txid,o.wallet_txid,o.created_at,o.received_at,o.reviewed_at,r.status as receipt_status
  from raffle_orders o left join raffle_guests g on g.token_hash=o.guest_session_hash left join raffle_receipts r on r.order_id=o.id
  where (p_status='all' or o.status=p_status) and (p_include_tests or not o.is_test)
  and (coalesce(p_search,'')='' or concat_ws(' ',o.buyer_name,o.buyer_phone,g.email,o.id::text,o.txid,o.numbers::text) ilike '%'||left(p_search,100)||'%')
 ), paged as (select * from filtered order by created_at desc,id desc limit 50 offset greatest(0,least(p_offset,100000)))
 select jsonb_build_object(
 'orders',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id desc) from paged),'[]'::jsonb),
 'total',(select count(*) from filtered),
 'summary',(select jsonb_build_object('paidCents',coalesce(sum(total_cents) filter(where status='paid'),0),'paidCount',count(*) filter(where status='paid'),'reviewCount',count(*) filter(where status='review'),'pendingCount',count(*) filter(where status='reserved'),'paidNumbers',coalesce(sum(cardinality(numbers)) filter(where status='paid' and not is_test),0)) from filtered)
 );
$$;
revoke all on function public.raffle_admin_payments(text,text,boolean,int) from public,anon,authenticated;
grant execute on function public.raffle_admin_payments(text,text,boolean,int) to service_role;
