type Payload = {orderId:string;numbers:number[];totalCents:number;symbol:string;txid:string|null};
type Alert = {order_id:string;attempts:number;payload:Payload};
type Database = (name:string,body:object)=>Promise<any>;
export function reviewAlertMessage(payload:Payload,origin:string){
 const amount=(payload.totalCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const text=['⚠️ Pedido em análise · Investidor Matuto',`Pedido: ${payload.orderId}`,`Valor: ${amount} ${payload.symbol}`,`Números: ${payload.numbers.map(n=>String(n).padStart(4,'0')).join(', ')}`,payload.txid?`Txid: ${payload.txid}`:'Txid ainda não disponível.','Confira no painel. Este aviso não confirma o pagamento.'].join('\n');
 const buttons=[{text:'Abrir painel',url:new URL('/admin/pagamentos',origin).href}];
 if(payload.txid && /^0x[0-9a-fA-F]{64}$/.test(payload.txid))buttons.push({text:'Ver transação',url:`https://bscscan.com/tx/${payload.txid}`});
 return {text,reply_markup:{inline_keyboard:[buttons]},protect_content:true,link_preview_options:{is_disabled:true}};
}
export async function dispatchReviewAlerts(env:NodeJS.ProcessEnv,db:Database){
 const token=env.RAFFLE_TELEGRAM_BOT_TOKEN||'',chat=env.RAFFLE_TELEGRAM_CHAT_ID||'',origin=env.RAFFLE_SITE_ORIGIN;
 if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)||! /^-?\d+$/.test(chat)||!origin)return {configured:false,sent:0,queued:0};
 const alerts:Alert[]=await db('raffle_claim_review_alerts',{});let sent=0;
 // Sequential sends avoid exceeding the per-chat burst limit.
 for(const alert of alerts){
  let delay=0;
  try{
   const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,...reviewAlertMessage(alert.payload,origin)})});
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.ok!==true){delay=Number.isSafeInteger(data?.parameters?.retry_after)?Math.max(0,Math.min(86400,data.parameters.retry_after)):0;throw new Error(`TELEGRAM_HTTP_${response.status}`);}
   if(!Number.isSafeInteger(data.result?.message_id))throw new Error('TELEGRAM_INVALID_RESPONSE');
   await db('raffle_review_alert_sent',{p_order:alert.order_id,p_attempt:alert.attempts,p_provider:String(data.result.message_id)});sent++;
  }catch(error){
   // Never persist a fetch error or URL: Telegram embeds the secret in the URL.
   const reason=error instanceof Error && /^TELEGRAM_[A-Z0-9_]+$/.test(error.message)?error.message:'TELEGRAM_TEMPORARILY_UNAVAILABLE';
   await db('raffle_review_alert_failed',{p_order:alert.order_id,p_attempt:alert.attempts,p_error:reason,p_delay:delay});
  }
 }
 return {configured:true,sent,queued:alerts.length-sent};
}
