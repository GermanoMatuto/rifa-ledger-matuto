import { it } from 'vitest';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
it('keeps exchange detections unassigned, preserves historical ambiguity and advances scans monotonically',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);');
  for(const name of ['202611140001_raffle.sql','202611150001_discount_tiers.sql','202611150002_guest_checkout.sql','202611150003_payment_detection.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  await db.query("insert into raffle_settings values(true,56,$1,$2,'USDT',18,clock_timestamp()+interval '1 day',false)",['0x'+'b'.repeat(40),'0x'+'c'.repeat(40)]);
  await db.exec("insert into raffle_test_access values('a@example.com',true),('b@example.com',true)");
  const create=async(hash,email)=>(await db.query("select to_json(raffle_create_guest_order($1,$2,'Comprador Teste','+5511999999999',true,'{}',true)) as item",[hash,email])).rows[0].item;
  const a=await create('a'.repeat(64),'a@example.com');
  const tx='0x'+'d'.repeat(64),block='0x'+'e'.repeat(64);
  const detect=async(id,time,hash=tx)=>(await db.query('select raffle_detect_payment($1,$2,0,$3,$4,$5) as item',[id,hash,block,time,'1000000000000000000'])).rows[0].item;
  const future=new Date(Date.now()+1000).toISOString();
  assert.equal((await detect(a.id,future)).state,'candidate');
  assert.equal((await db.query('select status from raffle_orders where id=$1',[a.id])).rows[0].status,'reserved');
  const b=await create('b'.repeat(64),'b@example.com');
  assert.equal((await detect(b.id,future)).state,'ambiguous');
  await db.query("update raffle_orders set created_at=clock_timestamp()-interval '10 minutes'");
  await db.query("update raffle_orders set expires_at=clock_timestamp()-interval '1 minute' where id=$1",[a.id]);
  const earlier=new Date(Date.now()-120000).toISOString();
  assert.equal((await detect(b.id,earlier,'0x'+'f'.repeat(64))).state,'ambiguous');
  assert.equal((await db.query('select txid from raffle_orders where id=$1',[b.id])).rows[0].txid,null);
  await db.query('select raffle_advance_scan($1,300)',[b.id]);await db.query('select raffle_advance_scan($1,200)',[b.id]);
  assert.equal(Number((await db.query('select monitor_next_block from raffle_orders where id=$1',[b.id])).rows[0].monitor_next_block),300);
  await db.exec('set role anon');await assert.rejects(()=>db.query('select * from raffle_payment_events'),/permission denied/);
 } finally { await db.close(); }
},20000);
