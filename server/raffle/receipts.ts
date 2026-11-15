type ReceiptPayload = {orderId:string;name:string;numbers:number[];totalCents:number;symbol:string;isTest:boolean;txid:string};
type Receipt = {order_id:string;recipient:string;payload:ReceiptPayload;attempts:number};
type Database = (name:string,body:object)=>Promise<any>;
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function buildReceipt(payload:ReceiptPayload,origin:string){
 const amount=(payload.totalCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const numbers=payload.isTest?'TESTE-0001 · sem participação na rifa':payload.numbers.map(n=>String(n).padStart(4,'0')).join(', ');
 const heading=payload.isTest?'Pagamento de teste confirmado':'Pagamento confirmado';
 const tracking=new URL('/meus-pedidos',origin).href;
 const text=[`Olá, ${payload.name}.`,heading,`Recebemos ${amount} ${payload.symbol} pela BNB Smart Chain (BEP-20).`,`Pedido: ${payload.orderId}`,`Seus números: ${numbers}`,payload.isTest?'Este pagamento é um teste e não gera participação na rifa.':'Sua participação está confirmada. Guarde este e-mail para consultar seus números.',`Transação: ${payload.txid}`,`Acompanhar pedido: ${tracking}`,'Em outro dispositivo, entre com este mesmo e-mail para recuperar o pedido.','Nunca pediremos sua seed ou chave privada.'].join('\n\n');
 const html=`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f4f8;font-family:Arial,sans-serif;color:#172337"><main style="max-width:560px;margin:24px auto;padding:28px;background:white;border-radius:12px"><p style="font-weight:bold;color:#2865c9">INVESTIDOR MATUTO</p><h1 style="font-size:25px">${heading}</h1><p>Olá, ${escapeHtml(payload.name)}. Recebemos seu pagamento.</p><p style="font-size:24px;font-weight:bold">${amount} ${escapeHtml(payload.symbol)}</p><p>BNB Smart Chain · BEP-20</p><h2 style="font-size:17px">${payload.isTest?'Número de teste':'Seus números'}</h2><p style="padding:16px;background:#eef4ff;border-radius:8px;font-size:18px;line-height:1.8;overflow-wrap:anywhere">${escapeHtml(numbers)}</p><p>${payload.isTest?'Este pagamento é um teste e não gera participação na rifa.':'Sua participação está confirmada. Guarde este e-mail para consultar seus números.'}</p><p style="font-size:12px;overflow-wrap:anywhere">Pedido: ${escapeHtml(payload.orderId)}</p><p style="font-size:12px;overflow-wrap:anywhere">Transação: ${escapeHtml(payload.txid)}</p><p><a style="display:inline-block;background:#2865c9;color:white;padding:14px 20px;border-radius:8px;text-decoration:none" href="${escapeHtml(tracking)}">Acompanhar meu pedido</a></p><p style="font-size:13px;color:#526177">Em outro dispositivo, entre com este mesmo e-mail. Nunca pediremos sua seed ou chave privada.</p></main></body></html>`;
 return {subject:payload.isTest?'Pagamento de teste confirmado · Investidor Matuto':'Pagamento confirmado · seus números',text,html};
}
export async function dispatchReceipts(env:NodeJS.ProcessEnv,db:Database,orderId?:string){
 if(!env.RESEND_API_KEY || !env.RAFFLE_SITE_ORIGIN)return{configured:false,sent:0,queued:0};
 const receipts:Receipt[]=await db('raffle_claim_receipts',{p_order:orderId||null});let sent=0;
 await Promise.allSettled(receipts.map(async receipt=>{
  try{
   const content=buildReceipt(receipt.payload,env.RAFFLE_SITE_ORIGIN!);
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`raffle-payment-confirmed/${receipt.order_id}`},body:JSON.stringify({from:'Investidor Matuto <pagamentos@mail.investidormatuto.com>',to:[receipt.recipient],...content})});
   if(!response.ok)throw new Error(`PROVIDER_HTTP_${response.status}`);
   const result=await response.json();if(typeof result.id!=='string')throw new Error('PROVIDER_INVALID_RESPONSE');
   await db('raffle_receipt_sent',{p_order:receipt.order_id,p_attempt:receipt.attempts,p_provider:result.id});sent++;
  }catch(error){const reason=error instanceof Error&&/^PROVIDER_[A-Z0-9_]+$/.test(error.message)?error.message:'DELIVERY_TEMPORARILY_UNAVAILABLE';await db('raffle_receipt_failed',{p_order:receipt.order_id,p_attempt:receipt.attempts,p_error:reason});}
 }));
 return {configured:true,sent,queued:receipts.length-sent};
}
