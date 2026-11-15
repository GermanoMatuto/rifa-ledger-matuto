create function public.raffle_inventory_states() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform raffle_expire();
 select jsonb_build_object(
 'sold',coalesce(array_agg(n.number order by n.number) filter(where o.status='paid'),'{}'::int[]),
 'reserved',coalesce(array_agg(n.number order by n.number) filter(where o.status<>'paid'),'{}'::int[]),
 'unavailable',coalesce(array_agg(n.number order by n.number),'{}'::int[])
 ) into result from raffle_numbers n join raffle_orders o on o.id=n.order_id where not o.is_test;
 return result;
end $$;
revoke all on function public.raffle_inventory_states() from public,anon,authenticated;
grant execute on function public.raffle_inventory_states() to service_role;
