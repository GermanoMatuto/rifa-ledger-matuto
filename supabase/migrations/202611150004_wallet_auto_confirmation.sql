-- Called only by the server after independently checking a finalized token receipt.
-- A public txid or matching amount is insufficient; require the prior signed order intent.
alter table public.raffle_orders add column wallet_check_at timestamptz;
create function public.raffle_confirm_wallet_payment(p_order uuid,p_txid text,p_sender text,p_log int,p_block text,p_received timestamptz,p_units numeric) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o raffle_orders;
begin
 perform pg_advisory_xact_lock(7162401);
 perform raffle_expire();
 select * into o from raffle_orders where id=p_order for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status='paid' and o.txid=lower(p_txid) then return jsonb_build_object('state','paid'); end if;
 if o.status<>'review' or o.txid is distinct from lower(p_txid)
    or o.wallet_txid is distinct from lower(p_txid)
    or o.wallet_address is null or o.wallet_verified_at is null
    or o.wallet_address is distinct from lower(p_sender)
    or o.wallet_verified_at<o.created_at or o.wallet_verified_at>p_received
    or p_received<o.created_at or p_received>o.expires_at
    or p_units is distinct from o.expected_units
    or p_log is distinct from o.transfer_log_index or p_block is distinct from o.block_hash
    or p_received is distinct from o.received_at
    or o.review_until is null or o.review_until<clock_timestamp()
    or (not o.is_test and cardinality(o.numbers)=0)
    or (select count(*) from raffle_numbers where number=any(o.numbers) and order_id=o.id)<>cardinality(o.numbers)
 then return jsonb_build_object('state','review'); end if;
 update raffle_orders set status='paid',reviewed_by='automatic:wallet-proof',reviewed_at=clock_timestamp(),
 review_note=jsonb_build_object('method','signed-order-and-finalized-receipt','txid',lower(p_txid),'sender',lower(p_sender),'units',p_units::text,'block',p_block,'log',p_log,'received_at',p_received)::text
 where id=o.id;
 return jsonb_build_object('state','paid');
end $$;
revoke all on function public.raffle_confirm_wallet_payment(uuid,text,text,int,text,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.raffle_confirm_wallet_payment(uuid,text,text,int,text,timestamptz,numeric) to service_role;
