-- Optional initial configuration AFTER the schema migration. Sales remain closed.
-- No overwrite if a campaign is already configured. Closing date must be set before opening.
insert into public.raffle_settings(id,chain_id,token_address,recipient,symbol,decimals,closes_at,sales_enabled)
values(true,56,'0x55d398326f99059ff775485246999027b3197955','0x6e578f4f5c137300fa256a01d2a36d2d109ee2a3','USDT',18,clock_timestamp(),false)
on conflict(id) do nothing;
