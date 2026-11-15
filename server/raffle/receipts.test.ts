import { it, expect, vi } from 'vitest';
import { buildReceipt, dispatchReceipts } from './receipts';
it('includes purchased numbers and safely escapes buyer data in the receipt',()=>{
 const payload={orderId:'order-1',name:'<img src=x>',numbers:[3,42],totalCents:800,symbol:'USDT',isTest:false,txid:'0xabc'};
 const receipt=buildReceipt(payload,'https://rifa-ledger-matuto.vercel.app');
 expect(receipt.text).toContain('0003, 0042');expect(receipt.text).toContain('8,00 USDT');expect(receipt.html).not.toContain('<img src=x>');expect(receipt.html).toContain('&lt;img src=x&gt;');expect(receipt.text).toContain('/meus-pedidos');
 const test=buildReceipt({...payload,isTest:true,numbers:[],totalCents:100},'https://rifa-ledger-matuto.vercel.app');expect(test.text).toContain('TESTE-0001');expect(test.text).toContain('não gera participação');
});
it('uses an order idempotency key and only marks email sent after provider acceptance',async()=>{
 const receipt={order_id:'order-1',recipient:'buyer@example.com',attempts:1,payload:{orderId:'order-1',name:'Teste',numbers:[7],totalCents:400,symbol:'USDT',isTest:false,txid:'0xabc'}};
 const db=vi.fn(async(name:string)=>name==='raffle_claim_receipts'?[receipt]:null);
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'mail-1'}),{status:200}));vi.stubGlobal('fetch',fetch);
 try{const result=await dispatchReceipts({RESEND_API_KEY:'fake-key',RAFFLE_SITE_ORIGIN:'https://rifa-ledger-matuto.vercel.app'},db);expect(result.sent).toBe(1);expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('raffle-payment-confirmed/order-1');expect(JSON.parse(fetch.mock.calls[0][1].body).text).toContain('0007');expect(db).toHaveBeenCalledWith('raffle_receipt_sent',{p_order:'order-1',p_attempt:1,p_provider:'mail-1'});
 fetch.mockResolvedValue(new Response('{}',{status:503}));db.mockClear();await dispatchReceipts({RESEND_API_KEY:'fake-key',RAFFLE_SITE_ORIGIN:'https://rifa-ledger-matuto.vercel.app'},db);expect(db).toHaveBeenCalledWith('raffle_receipt_failed',{p_order:'order-1',p_attempt:1,p_error:'PROVIDER_HTTP_503'});expect(db.mock.calls.some(([name])=>name==='raffle_receipt_sent')).toBe(false);
 }finally{vi.unstubAllGlobals()}
});
