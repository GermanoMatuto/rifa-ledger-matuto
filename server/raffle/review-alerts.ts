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
// Runs inside the server so the Secret never needs to be revealed in the dashboard.
export async function inspectTelegramBot(env:NodeJS.ProcessEnv){
 const token=env.RAFFLE_TELEGRAM_BOT_TOKEN||'';
 if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))return {configured:false,valid:false};
 try{
  const response=await fetch(`https://api.telegram.org/bot${token}/getMe`,{method:'POST',signal:AbortSignal.timeout(8000)});
  const data=await response.json();
  if(!response.ok||!data?.ok||data.result?.is_bot!==true)return {configured:true,valid:false,status:response.status};
  return {configured:true,valid:true,username:String(data.result.username||''),expectedBot:String(data.result.username||'').toLowerCase()==='germano08_bot',chatConfigured:/^-?\d+$/.test(env.RAFFLE_TELEGRAM_CHAT_ID||'')};
 }catch{return {configured:true,valid:false,temporarilyUnavailable:true};}
}
export async function sendTelegramTest(env:NodeJS.ProcessEnv){
 const identity=await inspectTelegramBot(env);
 if(!identity.valid||!identity.expectedBot)return {sent:false,reason:'BOT_IDENTITY_NOT_VERIFIED'};
 const chat=env.RAFFLE_TELEGRAM_CHAT_ID||'',token=env.RAFFLE_TELEGRAM_BOT_TOKEN||'';
 if(!/^\d+$/.test(chat))return {sent:false,reason:'PRIVATE_CHAT_NOT_CONFIGURED'};
 try{
  const infoResponse=await fetch(`https://api.telegram.org/bot${token}/getChat`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat})});
  const info=await infoResponse.json();
  if(!infoResponse.ok||!info.ok||info.result?.type!=='private'||String(info.result.id)!==chat)return {sent:false,reason:'START_PRIVATE_CHAT_WITH_BOT'};
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:'✅ Avisos da rifa conectados.\n\nQuando um pedido real entrar em análise, você receberá aqui o valor, os números, o txid e o link do painel.\n\nEsta é uma mensagem de teste. Nenhum pagamento foi feito ou aprovado.',protect_content:true,reply_markup:{inline_keyboard:[[{text:'Abrir painel',url:new URL('/admin/pagamentos',env.RAFFLE_SITE_ORIGIN!).href}]]}})});
  const data=await response.json();
  return response.ok&&data.ok&&Number.isSafeInteger(data.result?.message_id)?{sent:true,messageId:data.result.message_id,username:identity.username}:{sent:false,reason:'TELEGRAM_REJECTED_TEST'};
 }catch{return {sent:false,reason:'TEST_DELIVERY_UNCERTAIN_DO_NOT_RETRY_AUTOMATICALLY'};}
}
