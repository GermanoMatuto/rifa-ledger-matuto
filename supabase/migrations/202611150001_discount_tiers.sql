create or replace function public.raffle_create_order(p_user uuid,p_name text,p_phone text,p_whatsapp boolean,p_numbers int[]) returns public.raffle_orders
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
 cents:=n*400; if n>=5 then cents:=cents*85/100; elsif n>=3 then cents:=cents*9/10; end if;
 insert into raffle_orders(user_id,buyer_name,buyer_phone,has_whatsapp,numbers,total_cents,expected_units,chain_id,token_address,recipient,symbol,decimals,expires_at)
 values(p_user,trim(p_name),p_phone,p_whatsapp,p_numbers,cents,cents*power(10::numeric,s.decimals-2),s.chain_id,s.token_address,s.recipient,s.symbol,s.decimals,least(clock_timestamp()+interval '30 minutes',s.closes_at)) returning * into o;
 update raffle_numbers set order_id=o.id where number=any(p_numbers);
 return o;
end $$;


revoke all on function public.raffle_create_order(uuid,text,text,boolean,int[]) from public,anon,authenticated;
grant execute on function public.raffle_create_order(uuid,text,text,boolean,int[]) to service_role;

