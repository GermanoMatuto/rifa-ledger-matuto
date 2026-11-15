create table public.raffle_navigation_metrics(day date not null default current_date,event text not null check(event in('landing','selection','checkout')),device text not null check(device in('mobile','desktop')),phase text not null check(phase in('preview','sales')),count bigint not null default 0,primary key(day,event,device,phase));
alter table public.raffle_navigation_metrics enable row level security;
revoke all on public.raffle_navigation_metrics from public,anon,authenticated;
grant all on public.raffle_navigation_metrics to service_role;
create function public.raffle_record_navigation(p_event text,p_device text,p_phase text) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into raffle_navigation_metrics(day,event,device,phase,count) values(current_date,p_event,p_device,p_phase,1) on conflict(day,event,device,phase) do update set count=raffle_navigation_metrics.count+1;
$$;
create function public.raffle_navigation_summary() returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select phase,event,device,sum(count) as count from raffle_navigation_metrics where day>=current_date-29 group by phase,event,device)t;
$$;
revoke all on function public.raffle_record_navigation(text,text,text),public.raffle_navigation_summary() from public,anon,authenticated;
grant execute on function public.raffle_record_navigation(text,text,text),public.raffle_navigation_summary() to service_role;
