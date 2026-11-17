import {it,expect,vi} from 'vitest';
import express from 'express';
import {createRaffleRouter} from './router';
import {verifyTransfer} from './payment.js';
vi.mock('./payment.js',async original=>({...await original<typeof import('./payment.js')>(),verifyTransfer:vi.fn()}));
it('restricts manual approval, revalidates the transfer and records the verified operator once',async()=>{
 const networkFetch=globalThis.fetch,hash='0x'+'a'.repeat(64),id='11111111-1111-4111-8111-111111111111';let status='review';const approvals:any[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id,email:(init.headers as any).Authorization==='Bearer admin'?'owner@example.com':'buyer@example.com',email_confirmed_at:new Date().toISOString()});
  if(path.endsWith('raffle_rate_limit'))return Response.json(true);
  if(path.endsWith('/raffle_orders'))return Response.json([{id,status,txid:hash,chain_id:56,token_address:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),decimals:18,total_cents:400,expected_units:'4000000000000000000',created_at:new Date().toISOString()}]);
  if(path.endsWith('raffle_approve')){approvals.push(JSON.parse(init.body as string));status='paid';return Response.json(null)}
  throw Error('Unexpected request '+path);
 });
 const app=express();app.use('/api/raffle',createRaffleRouter({RAFFLE_SUPABASE_URL:'https://db.test',RAFFLE_SUPABASE_ANON_KEY:'anon',RAFFLE_SUPABASE_SERVICE_KEY:'service',RAFFLE_SITE_ORIGIN:'https://site.test',RAFFLE_RATE_SECRET:'rate',RAFFLE_ADMIN_EMAILS:'owner@example.com',RAFFLE_EVM_RPC_URL:'https://rpc.test'}));
 const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/api/raffle/admin/payments/${id}/approve`;
 const body={txid:hash,evidence:'Verified buyer withdrawal evidence through private contact.',ownershipConfirmed:true,p_operator:'attacker@example.com'};
 const post=(data:any=body,token='admin',origin='https://site.test')=>networkFetch(base,{method:'POST',headers:{Origin:origin,Cookie:'raffle-session='+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  expect((await post(body,'buyer')).status).toBe(403);expect((await post(body,'admin','https://evil.test')).status).toBe(403);
  expect((await post({...body,ownershipConfirmed:false})).status).toBe(400);
  expect((await post({...body,txid:'0x'+'b'.repeat(64)})).status).toBe(409);
  vi.mocked(verifyTransfer).mockRejectedValueOnce(Error('Invalid chain transfer'));expect((await post()).status).toBe(422);expect(approvals).toHaveLength(0);
  vi.mocked(verifyTransfer).mockResolvedValueOnce({txid:hash,logIndex:1,units:'4000000000000000000',blockHash:'0x'+'c'.repeat(64),paidAt:new Date().toISOString(),sender:'0x'+'3'.repeat(40)});
  expect((await post()).status).toBe(200);expect(approvals).toHaveLength(1);expect(approvals[0].p_operator).toBe('owner@example.com');expect(JSON.parse(approvals[0].p_evidence).txid).toBe(hash);
  expect((await (await post()).json()).alreadyConfirmed).toBe(true);expect(approvals).toHaveLength(1);
 }finally{vi.unstubAllGlobals();await new Promise<void>(r=>server.close(()=>r()))}
});
