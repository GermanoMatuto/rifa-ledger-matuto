import { expect,it,vi } from 'vitest';
import { reviewAlertMessage,dispatchReviewAlerts } from './review-alerts';
const alert={order_id:'order-1',attempts:1,payload:{orderId:'order-1',numbers:[3,42],totalCents:720,symbol:'USDT',txid:'0x'+'a'.repeat(64)}};
const env={RAFFLE_TELEGRAM_BOT_TOKEN:'123:'+ 'x'.repeat(30),RAFFLE_TELEGRAM_CHAT_ID:'12345',RAFFLE_SITE_ORIGIN:'https://rifa.investidormatuto.com'};
it('sends minimal review data and never changes the bot webhook or reads messages',async()=>{
 const db=vi.fn(async(name:string)=>name==='raffle_claim_review_alerts'?[alert]:null);const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,result:{message_id:42}})));vi.stubGlobal('fetch',fetch);
 try{expect(await dispatchReviewAlerts(env,db)).toEqual({configured:true,sent:1,queued:0});expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toMatch(/\/sendMessage$/);const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.chat_id).toBe('12345');expect(body.text).toContain('0003, 0042');expect(body.text).toContain('7,20 USDT');expect(body.text).toContain('não confirma');expect(body.text).not.toContain('@');expect(body.reply_markup.inline_keyboard[0][0].url).toBe('https://rifa.investidormatuto.com/admin/pagamentos');expect(db).toHaveBeenCalledWith('raffle_review_alert_sent',{p_order:'order-1',p_attempt:1,p_provider:'42'});}finally{vi.unstubAllGlobals();}
});
it('preserves pending alerts until configured and handles throttling without leaking the token',async()=>{
 const db=vi.fn(async(name:string)=>name==='raffle_claim_review_alerts'?[alert]:null);expect((await dispatchReviewAlerts({},db)).configured).toBe(false);expect(db).not.toHaveBeenCalled();
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false,parameters:{retry_after:120}}),{status:429}));vi.stubGlobal('fetch',fetch);
 try{expect((await dispatchReviewAlerts(env,db)).sent).toBe(0);expect(db).toHaveBeenCalledWith('raffle_review_alert_failed',{p_order:'order-1',p_attempt:1,p_error:'TELEGRAM_HTTP_429',p_delay:120});db.mockClear();fetch.mockRejectedValue(new Error('secret URL '+env.RAFFLE_TELEGRAM_BOT_TOKEN));await dispatchReviewAlerts(env,db);expect(db).toHaveBeenCalledWith('raffle_review_alert_failed',{p_order:'order-1',p_attempt:1,p_error:'TELEGRAM_TEMPORARILY_UNAVAILABLE',p_delay:0});expect(JSON.stringify(db.mock.calls)).not.toContain(env.RAFFLE_TELEGRAM_BOT_TOKEN);}finally{vi.unstubAllGlobals();}
});
it('validates bot identity server-side without returning its token or consuming updates',async()=>{
 const {inspectTelegramBot}=await import('./review-alerts');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,result:{is_bot:true,username:'Germano08_bot'}})));vi.stubGlobal('fetch',fetch);
 try{const result=await inspectTelegramBot(env);expect(result).toEqual({configured:true,valid:true,username:'Germano08_bot',expectedBot:true,chatConfigured:true});expect(JSON.stringify(result)).not.toContain(env.RAFFLE_TELEGRAM_BOT_TOKEN);expect(fetch.mock.calls[0][0]).toMatch(/\/getMe$/);}finally{vi.unstubAllGlobals();}
});
it('tests delivery only to the configured private chat after verifying bot and recipient',async()=>{
 const {sendTelegramTest}=await import('./review-alerts');const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ok:true,result:{is_bot:true,username:'Germano08_bot'}}))).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,result:{id:12345,type:'private'}}))).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,result:{message_id:43}})));vi.stubGlobal('fetch',fetch);
 try{expect((await sendTelegramTest(env)).sent).toBe(true);expect(fetch.mock.calls.map(c=>String(c[0]).split('/').pop())).toEqual(['getMe','getChat','sendMessage']);expect(JSON.parse(fetch.mock.calls[2][1].body).text).toContain('mensagem de teste');}finally{vi.unstubAllGlobals();}
});
