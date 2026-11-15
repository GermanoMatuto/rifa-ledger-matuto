import {it} from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createRaffleRouter} from './router.js';

it('isolates guest orders, enforces server prices and recovers only verified email',async()=>{
const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);');
for(const path of ['202611140001_raffle.sql','202611150001_discount_tiers.sql','202611150002_guest_checkout.sql','202611150003_payment_detection.sql'])await db.exec(readFileSync('supabase/migrations/'+path,'utf8'));
const uid='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1,$2,clock_timestamp())',[uid,'buyer@example.com']);
const token='0x'+'b'.repeat(40),recipient='0x'+'c'.repeat(40),txid='0x'+'a'.repeat(64),blockHash='0x'+'d'.repeat(64);
await db.query("insert into raffle_settings values(true,56,$1,$2,'USDT',18,clock_timestamp()+interval '1 day',true)",[token,recipient]);await db.exec("insert into raffle_test_access values('test@example.com',true)");
const realFetch=globalThis.fetch;const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,init={})=>{const url=String(input);if(url.startsWith('http://127.0.0.1:'))return realFetch(input,init);
if(url.endsWith('/auth/v1/verify'))return reply({access_token:'qa-auth',expires_in:3600,user:{id:uid,email:'buyer@example.com',email_confirmed_at:new Date().toISOString()}});
if(url.endsWith('/auth/v1/user'))return init.headers.Authorization==='Bearer qa-auth'?reply({id:uid,email:'buyer@example.com',email_confirmed_at:new Date().toISOString()}):reply({},401);
if(url.includes('/rest/v1/rpc/')){const name=url.split('/').pop(),args=JSON.parse(init.body||'{}');try{return reply((await db.query(`select to_json(public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')})) as result`,Object.values(args))).rows[0].result)}catch(e){return reply({message:e.message,code:e.code},400)}}
if(url.includes('/rest/v1/raffle_guests')){const q=new URL(url).searchParams;return reply((await db.query('select token_hash from raffle_guests where token_hash=$1 and expires_at>clock_timestamp()',[q.get('token_hash').slice(3)])).rows)}
if(url.includes('/rest/v1/raffle_orders')){const q=new URL(url).searchParams;let where=[],args=[];for(const key of ['id','user_id','guest_session_hash'])if(q.has(key)){args.push(q.get(key).slice(3));where.push(key+'=$'+args.length)}const fields=q.get('select')||'*';return reply((await db.query(`select ${fields} from raffle_orders where ${where.join(' and ')} order by created_at desc`,args)).rows)}
if(url==='https://rpc.test'){const {method,params}=JSON.parse(init.body);const results={eth_chainId:'0x38',eth_getTransactionReceipt:{transactionHash:txid,status:'0x1',blockNumber:'0x10',blockHash,logs:[{address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(64),'0x'+recipient.slice(2).padStart(64,'0')],data:'0x'+(10800000000000000000n).toString(16).padStart(64,'0'),logIndex:'0x0'}]},eth_getBlockByNumber:params[0]==='finalized'?{number:'0x20'}:{hash:blockHash,timestamp:'0x'+Math.ceil(Date.now()/1000).toString(16)}};return reply({jsonrpc:'2.0',id:1,result:results[method]})}throw Error('Unexpected upstream '+url)};
const env={RAFFLE_SUPABASE_URL:'https://db.test',RAFFLE_SUPABASE_ANON_KEY:'qa',RAFFLE_SUPABASE_SERVICE_KEY:'qa-service',RAFFLE_RATE_SECRET:'qa-rate',RAFFLE_SITE_ORIGIN:'https://site.test',RAFFLE_EVM_RPC_URL:'https://rpc.test',RAFFLE_SALES_ENABLED:'true',RAFFLE_TEST_ENABLED:'true'};
const app=express();app.use('/api/raffle',createRaffleRouter(env));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/raffle`;
async function call(path,body,cookie='',origin='https://site.test'){const r=await realFetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||'',headers:r.headers};}
const payload={name:'Comprador Teste',email:'buyer@example.com',phone:'+5511999999999',whatsapp:true,contactConsent:true,numbers:[1,2,3],total_cents:1};
try{
assert.equal((await call('/orders')).status,401);assert.equal((await call('/guest/orders',payload,'','https://bad.test')).status,403);
const a=await call('/guest/orders',payload);assert.equal(a.status,201,JSON.stringify(a.data));assert.equal(a.data.order.total_cents,1080);assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.ok(!('guest_session_hash' in a.data.order));
const id=a.data.order.id;assert.equal((await call('/orders',undefined,a.cookie)).data.orders[0].id,id);assert.equal((await call('/orders')).status,401);
const b=await call('/guest/orders',{...payload,email:'other@example.com',numbers:[4,5,6]});assert.equal(b.status,201);
assert.equal((await call(`/orders/${id}/transfer`,{txid},b.cookie)).status,404);
const paid=await call(`/orders/${id}/transfer`,{txid},a.cookie);assert.equal(paid.status,200,JSON.stringify(paid.data));assert.equal(paid.data.order.status,'review');assert.ok(!('guest_session_hash' in paid.data.order));assert.ok(!('guest_session_hash' in (await call(`/orders/${id}/transfer`,{txid},a.cookie)).data.order));
assert.equal((await call(`/orders/${b.data.order.id}/transfer`,{txid},b.cookie)).status,409);
await db.exec('update raffle_settings set sales_enabled=false');assert.equal((await call('/guest/orders',{...payload,numbers:[10]})).status,409);
assert.equal((await call('/guest/orders',{...payload,test:true,email:'unknown@example.com',numbers:[]})).status,403);
const inventoryBefore=(await db.query('select number,order_id from raffle_numbers order by number')).rows;const t=await call('/guest/orders',{...payload,email:'test@example.com',test:true,numbers:[]});assert.equal(t.status,201,JSON.stringify(t.data));assert.equal(t.data.order.total_cents,100);assert.equal(t.data.order.is_test,true);assert.deepEqual(t.data.order.numbers,[]);assert.deepEqual((await db.query('select number,order_id from raffle_numbers order by number')).rows,inventoryBefore);
const auth=await call('/auth/verify',{email:'buyer@example.com',code:'123456'});assert.equal(auth.status,200);assert.equal((await call('/orders',undefined,auth.cookie)).data.orders[0].id,id);assert.equal((await db.query('select user_id from raffle_orders where id=$1',[id])).rows[0].user_id,uid);
await db.query("update raffle_guests set expires_at=clock_timestamp()-interval '1 second' where token_hash=(select guest_session_hash from raffle_orders where id=$1)",[t.data.order.id]);assert.equal((await call('/orders',undefined,t.cookie)).status,401);
await db.exec('set role anon');await assert.rejects(()=>db.query('select * from raffle_guests'),/permission denied/);await assert.rejects(()=>db.query("select raffle_create_guest_order('a','b','c','d',true,'{}',true)"),/permission denied/);await db.exec('reset role');
console.log('PASS guest API+PostgreSQL: no OTP before payment; pricing; private cookies; separate buyers; tx review/replay; public sales closed; $1 test isolated; verified-email recovery; session expiry; RLS.');
}finally{await new Promise(r=>server.close(r));await db.close();globalThis.fetch=realFetch;}


},20000);

