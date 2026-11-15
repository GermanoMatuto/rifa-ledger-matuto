import { it } from 'vitest';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
it('automatically approves only signed-wallet finalized evidence and preserves inventory and tx uniqueness',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);');
  for(const name of ['202611140001_raffle.sql','202611150001_discount_tiers.sql','202611150002_guest_checkout.sql','202611150003_payment_detection.sql','202611150004_wallet_auto_confirmation.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  await db.query("insert into raffle_settings values(true,56,$1,$2,'USDT',18,clock_timestamp()+interval '1 day',true)",['0x55d398326f99059ff775485246999027b3197955','0x'+'c'.repeat(40)]);
  const sender='0x'+'a'.repeat(40),block='0x'+'b'.repeat(64),units='4000000000000000000';let next=0;
  async function create(){const n=++next,hash=n.toString(16).padStart(64,'0'),tx='0x'+(n+100).toString(16).padStart(64,'0');const o=(await db.query("select to_json(raffle_create_guest_order($1,$2,'Comprador Teste','+5511999999999',true,$3,false)) as item",[hash,`qa${n}@example.com`,[n]])).rows[0].item;await db.query("update raffle_orders set created_at=clock_timestamp()-interval '10 minutes',wallet_address=$2,wallet_verified_at=clock_timestamp()-interval '5 minutes',wallet_txid=$3 where id=$1",[o.id,sender,tx]);const paidAt=new Date(Date.now()-60000).toISOString();await db.query('select raffle_record_guest_transfer($1,$2,$3,0,$4,$5)',[o.id,hash,tx,block,paidAt]);return{...o,hash,tx,paidAt};}
  const confirm=async(o,overrides={})=>(await db.query('select raffle_confirm_wallet_payment($1,$2,$3,$4,$5,$6,$7) as item',[o.id,o.tx,overrides.sender??sender,0,overrides.block??block,o.paidAt,overrides.units??units])).rows[0].item;
  const valid=await create();assert.equal((await confirm(valid)).state,'paid');assert.equal((await confirm(valid)).state,'paid');
  assert.equal((await db.query('select reviewed_by from raffle_orders where id=$1',[valid.id])).rows[0].reviewed_by,'automatic:wallet-proof');assert.equal((await db.query('select order_id from raffle_numbers where number=$1',[valid.numbers[0]])).rows[0].order_id,valid.id);
  const noProof=await create();await db.query('update raffle_orders set wallet_verified_at=null where id=$1',[noProof.id]);assert.equal((await confirm(noProof)).state,'review');
  const mismatch=await create();assert.equal((await confirm(mismatch,{sender:'0x'+'d'.repeat(40)})).state,'review');assert.equal((await confirm(mismatch,{units:'1'})).state,'review');assert.equal((await confirm(mismatch,{block:'0x'+'e'.repeat(64)})).state,'review');
  const late=await create();await db.query("update raffle_orders set expires_at=created_at+interval '1 minute' where id=$1",[late.id]);assert.equal((await confirm(late)).state,'review');
  const stolenNumber=await create();await db.query('update raffle_numbers set order_id=null where order_id=$1',[stolenNumber.id]);assert.equal((await confirm(stolenNumber)).state,'review');
  const duplicate=await create();await assert.rejects(()=>db.query('update raffle_orders set txid=$2 where id=$1',[duplicate.id,valid.tx]),/duplicate key/);
  await db.exec('set role anon');await assert.rejects(()=>confirm(valid),/permission denied/);
 }finally{await db.close();}
},20000);
