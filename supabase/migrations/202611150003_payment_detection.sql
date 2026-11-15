alter table public.raffle_orders add column wallet_challenge text;
alter table public.raffle_orders add column wallet_challenge_address text;
alter table public.raffle_orders add column wallet_challenge_expires_at timestamptz;
alter table public.raffle_orders add column wallet_address text;
alter table public.raffle_orders add column wallet_verified_at timestamptz;
alter table public.raffle_orders add column wallet_txid text;
alter table public.raffle_orders add column monitor_next_block bigint;

create table public.raffle_payment_events (
 chain_id bigint not null, txid text not null, token_address text not null,
 recipient text not null, units numeric(78,0) not null, log_index int not null,
 block_hash text not null, received_at timestamptz not null,
 primary key(chain_id,txid)
);
alter table public.raffle_payment_events enable row level security;
revoke all on public.raffle_payment_events from public,anon,authenticated;
grant all on public.raffle_payment_events to service_role;

-- Auto detection is a candidate match, never proof of payment ownership.
create function public.raffle_detect_payment(p_order uuid,p_txid text,p_log int,p_block text,p_received timestamptz,p_units numeric) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare target_order raffle_orders; matches int;
begin
 perform raffle_expire();
 select * into target_order from raffle_orders where id=p_order for update;
 if not found or target_order.txid is not null then return jsonb_build_object('state','already_recorded'); end if;
 if p_txid !~ '^0x[0-9a-f]{64}$' or p_log<0 or p_units<>target_order.expected_units or p_received<target_order.created_at then raise exception 'INVALID_TRANSFER'; end if;
 insert into raffle_payment_events values(target_order.chain_id,p_txid,target_order.token_address,target_order.recipient,p_units,p_log,p_block,p_received) on conflict do nothing;
 if exists(select 1 from raffle_orders where chain_id=target_order.chain_id and txid=p_txid) then return jsonb_build_object('state','already_recorded'); end if;
 -- Count the historical overlap too: expiration must not turn ambiguity into certainty.
 select count(*) into matches from raffle_orders where chain_id=target_order.chain_id and token_address=target_order.token_address and recipient=target_order.recipient and expected_units=p_units and created_at<=p_received and expires_at>=p_received;
 if matches<>1 or target_order.status<>'reserved' or target_order.expires_at<p_received then return jsonb_build_object('state',case when matches>1 then 'ambiguous' else 'unmatched' end); end if;
 -- External payments still require the buyer to supply the txid; never auto-claim a public deposit.
 return jsonb_build_object('state','candidate');
end $$;
create function public.raffle_advance_scan(p_order uuid,p_next bigint) returns void
language sql security definer set search_path=public,pg_temp as $$
 update raffle_orders set monitor_next_block=greatest(coalesce(monitor_next_block,0),p_next) where id=p_order;
$$;
revoke all on function public.raffle_detect_payment(uuid,text,int,text,timestamptz,numeric),public.raffle_advance_scan(uuid,bigint) from public,anon,authenticated;
grant execute on function public.raffle_detect_payment(uuid,text,int,text,timestamptz,numeric),public.raffle_advance_scan(uuid,bigint) to service_role;
