import { it, expect, vi } from 'vitest';
import express from 'express';
import { createRaffleRouter } from './router';
it('requires a verified organizer session and denies guest and other buyer access',async()=>{
 const originalFetch=globalThis.fetch;
 const dbCalls:string[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user'){const token=(init.headers as Record<string,string>).Authorization;return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:token==='Bearer admin'?'owner@example.com':'buyer@example.com',email_confirmed_at:token==='Bearer unverified'?null:new Date().toISOString()}),{status:200});}
  dbCalls.push(path);return new Response(JSON.stringify(path.endsWith('raffle_rate_limit')?true:path.endsWith('raffle_admin_payments')?{orders:[{buyer_name:'Private Buyer',numbers:[42]}],summary:{},total:1}:null),{status:200});
 });
 const app=express();app.use('/api/raffle',createRaffleRouter({RAFFLE_SUPABASE_URL:'https://db.test',RAFFLE_SUPABASE_ANON_KEY:'anon',RAFFLE_SUPABASE_SERVICE_KEY:'service',RAFFLE_SITE_ORIGIN:'https://site.test',RAFFLE_RATE_SECRET:'rate-secret',RAFFLE_ADMIN_EMAILS:'owner@example.com'}));const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/api/raffle`;
 try{
  expect((await originalFetch(base+'/admin/payments')).status).toBe(401);
  expect((await originalFetch(base+'/admin/payments',{headers:{Cookie:'raffle-guest='+'a'.repeat(64)}})).status).toBe(401);
  expect((await originalFetch(base+'/admin/payments?email=owner@example.com',{headers:{Cookie:'raffle-session=buyer'}})).status).toBe(403);
  expect((await originalFetch(base+'/admin/payments',{headers:{Cookie:'raffle-session=unverified'}})).status).toBe(401);expect(dbCalls.some(p=>p.endsWith('raffle_admin_payments'))).toBe(false);
  const response=await originalFetch(base+'/admin/payments',{headers:{Cookie:'raffle-session=admin'}});expect(response.status).toBe(200);expect((await response.json()).orders[0].numbers).toEqual([42]);expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await originalFetch(base+'/internal/receipts',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:'{}'})).status).toBe(401);
 }finally{vi.unstubAllGlobals();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
