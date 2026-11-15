import { useEffect, useId, useState } from "react";
import { Link } from "wouter";
import PaymentQr from "./PaymentQr";
import WalletPayment from "./WalletPayment";
import { Wallet, ArrowUpRight, Check, Clock3 } from "lucide-react";
import { displayPhone, normalizePhone, validPhone } from "@/lib/contact-phone";

type Order = { id: string; numbers: number[]; status: string; total_cents: number; symbol: string; recipient: string; chain_id: number; token_address: string; decimals: number; expires_at: string; txid: string | null; is_test?: boolean; wallet_txid?: string | null };
function savedWalletTx(id: string) { try { const hash = localStorage.getItem(`matuto-payment-tx:${id}`); return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : null; } catch { return null; } }
function hasWalletAttempt(id: string) { try { return localStorage.getItem(`matuto-payment-attempt:${id}`) === "1"; } catch { return false; } }
const money = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(c / 100);
const statuses: Record<string, string> = { reserved: "Aguardando transferência", expired: "Reserva vencida — não envie valores", review: "Recebimento detectado · em análise", paid: "Participação confirmada" };
async function api(path: string, body?: object) {
  const response = await fetch(`/api/raffle${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({ error: "Serviço ainda não disponível." }));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
export default function RaffleCheckout({ numbers, tracking = false, testMode = false }: { numbers: number[]; tracking?: boolean; testMode?: boolean }) {
  const [configured, setConfigured] = useState(false), [sales, setSales] = useState(false), [testEnabled, setTestEnabled] = useState(false);
  const [detectionEnabled, setDetectionEnabled] = useState(false), [methods, setMethods] = useState<Record<string, "wallet" | "external">>({});
  const [detection, setDetection] = useState<Record<string,string>>({}), [walletPending, setWalletPending] = useState<Record<string,string>>({});
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [phone, setPhone] = useState("+55"), [whatsapp, setWhatsapp] = useState(true);
  const [country,setCountry]=useState('55'),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const contactId=useId();
  const [code, setCode] = useState(""), [sent, setSent] = useState(false), [recovery, setRecovery] = useState(tracking), [orders, setOrders] = useState<Order[]>([]);
  const [txids, setTxids] = useState<Record<string, string>>({}), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([api("/config"), api("/orders")]).then(([config, saved]) => {
      if (!mounted) return;
      if (config.status === "fulfilled") { setConfigured(config.value.configured); setSales(config.value.salesEnabled); setTestEnabled(config.value.testEnabled); setDetectionEnabled(config.value.detectionEnabled); }
      if (saved.status === "fulfilled") { setOrders(saved.value.orders); if (saved.value.orders.length) setRecovery(false); }
      setRestoring(false);
    });
    return () => { mounted = false; };
  }, []);
  async function loadOrders() { const data = await api("/orders"); setOrders(data.orders); return data.orders as Order[]; }
  const hasPending = orders.some(order => order.status === "reserved" || order.status === "review");
  function detectionText(data: { state: string; caughtUp?: boolean; message?: string }) {
    if (data.state === "paid") return "Pagamento confirmado automaticamente. Seu pedido está atualizado.";
    if (data.state === "review") return "Recebimento localizado e verificado. A vinculação ao pedido está em análise.";
    if (data.state === "needs_txid" || data.state === "ambiguous") return "Há depósito compatível na carteira. Informe seu txid para identificar sua transferência; um valor igual não identifica o comprador.";
    if (data.state === "pending") return data.message || "Transação capturada. Aguardando confirmação na rede.";
    if (data.state === "expired") return "Prazo vencido. Não envie valores. Se já pagou, informe o txid para conferência.";
    return data.caughtUp === false ? "Consultando o histórico da rede…" : "Ainda não localizamos o recebimento. Se já enviou, aguarde a rede e não pague novamente.";
  }
  useEffect(() => {
    if (!hasPending) return;
    let mounted = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void api("/orders").then(async data => {
        if (!mounted) return;
        setOrders(data.orders);
        const pending: Order[] = data.orders.filter((order: Order) => (order.status === "reserved" && detectionEnabled) || (["reserved","review"].includes(order.status) && order.wallet_txid)).slice(0,3);
        await Promise.allSettled(pending.map(async order => {
          try {
            const result = await api(`/orders/${order.id}/detect`, {});
            if (mounted) setDetection(previous=>({...previous,[order.id]:detectionText(result)}));
            if (["review","paid"].includes(result.state) && mounted) { const updated = await api("/orders"); if (mounted) setOrders(updated.orders); }
          } catch { if (mounted) setDetection(previous=>({...previous,[order.id]:"Busca automática indisponível no momento. Você pode informar o txid; não reenvie o pagamento."})); }
        }));
      }).catch(() => {});
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [hasPending,detectionEnabled]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha temporária."); } finally { setBusy(false); }
  }
  const current = orders.find(order => Boolean(order.is_test) === testMode && ["reserved", "review", "paid"].includes(order.status) && (testMode || [...order.numbers].sort((a,b)=>a-b).join(",") === [...numbers].sort((a,b)=>a-b).join(",")));
  const shownOrders = tracking ? orders : current ? [current] : [];
  const canCreate = configured && (testMode ? testEnabled : sales) && (testMode || numbers.length > 0);
  return <section className="ledger-checkout" aria-label="Contato e pagamento" aria-busy={busy || restoring}>
    {!tracking && <ol className="ledger-checkout-steps" aria-label="Etapas da compra"><li aria-current={!current ? "step" : undefined}>1. Seus dados</li><li aria-current={current?.status === "reserved" ? "step" : undefined}>2. Pagamento</li><li aria-current={current && current.status !== "reserved" ? "step" : undefined}>3. Acompanhamento</li></ol>}
    {restoring ? <p role="status">Conferindo seus pedidos neste navegador…</p> : <>
      {!tracking&&!testMode&&!current&&!recovery&&!sales&&<div className="ledger-checkout-closed" role="status"><h2>As vendas ainda não abriram.</h2><p>Sua seleção está salva neste navegador. Não é uma reserva e nenhum pagamento será gerado agora.</p><p>Você não precisa preencher seus dados enquanto as vendas estiverem fechadas.</p><Link href="/" className="ledger-secondary">Voltar aos números</Link><button type="button" className="ledger-text-button" onClick={()=>setRecovery(true)}>Já fiz um pedido · recuperar</button></div>}
      {!tracking && !current && !recovery && (testMode||sales) && <>
        <h2>Seus dados para acompanhar o pedido</h2>
        <p>Sem criar senha. Seus números e comprovante chegarão por e-mail.</p>
        {testMode && <p className="ledger-test-notice"><strong>Teste do organizador · 1,00 USDT</strong><br/>Um número de teste, sem participação na rifa. Uma transferência nesta etapa usa USDT real.</p>}
        <form onSubmit={event => { event.preventDefault();const errors:Record<string,string>={};if(name.trim().length<2)errors.name='Informe seu nome.';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))errors.email='Confira o endereço de e-mail.';if(!validPhone(phone,country))errors.phone='Confira o telefone e o país selecionado.';setFieldErrors(errors);const first=Object.keys(errors)[0];if(first){event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();return;}void run(async () => {
          const data = await api("/guest/orders", { email, name, phone, whatsapp, contactConsent: true, numbers: testMode ? [] : numbers, test: testMode });
          setOrders(previous => [data.order, ...previous.filter(order => order.id !== data.order.id)]);
          setMessage("");
        }); }}>
          <label>Nome completo<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name?`${contactId}-name`:undefined} onChange={event=>{setName(event.target.value);setFieldErrors(old=>({...old,name:''}))}} disabled={busy}/></label>{fieldErrors.name&&<small id={`${contactId}-name`} className="ledger-field-error">{fieldErrors.name}</small>}
          <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} aria-invalid={!!fieldErrors.email} aria-describedby={`${contactId}-email`} onChange={event=>{setEmail(event.target.value);setFieldErrors(old=>({...old,email:''}))}} disabled={busy}/></label>
          <small id={`${contactId}-email`} className={fieldErrors.email?'ledger-field-error':''}>{fieldErrors.email||'Confira a escrita: enviaremos seus números para este e-mail.'}</small>
          <div className="ledger-phone-fields"><label>País<select value={country} disabled={busy} aria-label="País do telefone" onChange={event=>{setCountry(event.target.value);setPhone(event.target.value==='other'?'+':'+'+event.target.value);setFieldErrors(old=>({...old,phone:''}))}}><option value="55">Brasil +55</option><option value="351">Portugal +351</option><option value="1">EUA / Canadá +1</option><option value="other">Outro país</option></select></label><label>WhatsApp ou telefone<input name="phone" type="tel" inputMode="tel" autoComplete={country==='other'?'tel':'tel-national'} required maxLength={24} placeholder={country==='55'?'(11) 99999-9999':country==='other'?'+código e número':'Seu telefone'} value={displayPhone(phone,country)} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone?`${contactId}-phone`:undefined} onChange={event=>{const raw=event.target.value;if(raw.trim().startsWith('+')){const digits=raw.replace(/\D/g,'');setCountry(['351','55','1'].find(code=>digits.startsWith(code))||'other')}setPhone(normalizePhone(raw,country));setFieldErrors(old=>({...old,phone:''}))}} disabled={busy}/></label></div>{fieldErrors.phone&&<small id={`${contactId}-phone`} className="ledger-field-error">{fieldErrors.phone}</small>}
          <label className="ledger-check-label"><input type="checkbox" checked={whatsapp} onChange={event => setWhatsapp(event.target.checked)} disabled={busy}/>Este número tem WhatsApp</label>
          <p className="ledger-contact-notice">Seus contatos são privados e usados para o pedido e a entrega do prêmio. Ao continuar, você está ciente desse uso. O endereço só será solicitado ao vencedor.</p>
          <button className="ledger-primary" disabled={busy || !canCreate}>{busy ? "Preparando pagamento…" : testMode ? "Gerar pagamento de teste · 1 USDT" : "Reservar números e pagar"}</button>
          {!configured ? <p>Pagamento ainda não configurado. Não envie valores.</p> : !canCreate && <p>{testMode ? "O teste ainda não está disponível." : "As vendas estão fechadas. Você pode conferir os dados, mas ainda não criar um pagamento."}</p>}
        </form>
        <button type="button" className="ledger-secondary" onClick={() => setRecovery(true)}>Já fiz um pedido · recuperar por e-mail</button>
      </>}
      {(recovery || (tracking && !orders.length)) && <div className="ledger-recovery">
        <h2>Recuperar meus pedidos</h2><p>Enviaremos um código para o e-mail informado na compra. Nenhuma senha é necessária.</p>
        <form onSubmit={event => { event.preventDefault(); void run(async () => {
          if (!sent) { const data = await api("/auth/code",{email}); setSent(true); setMessage(data.message); }
          else { await api("/auth/verify",{email,code}); await loadOrders(); setRecovery(false); setSent(false); setCode(""); setMessage("E-mail confirmado. Seus pedidos estão disponíveis."); }
        }); }}>
          <label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy || sent} onChange={event => setEmail(event.target.value)}/></label>
          {sent && <label>Código recebido por e-mail<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,8}" minLength={6} maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g,""))}/></label>}
          <button className="ledger-secondary" disabled={busy || !configured}>{busy ? "Aguarde…" : sent ? "Confirmar código" : "Receber código"}</button>
          {sent && <button type="button" className="ledger-secondary" disabled={busy} onClick={() => {setSent(false);setCode("");}}>Alterar e-mail</button>}
        </form>
        {!tracking && <button type="button" className="ledger-secondary" onClick={() => setRecovery(false)}>Voltar ao pagamento</button>}
      </div>}
      {shownOrders.map(order => {
        const walletHash = order.wallet_txid || walletPending[order.id] || savedWalletTx(order.id);
        const method = walletHash || hasWalletAttempt(order.id) ? "wallet" : methods[order.id] || "wallet";
        return <article className="ledger-order" key={order.id}>
        <div className="ledger-order-heading"><div><span className="ledger-payment-status"><Clock3 size={14} aria-hidden="true"/>{order.is_test && order.status === "paid" ? "Teste confirmado" : statuses[order.status] || "Em acompanhamento"}</span><h2>{order.status === "reserved" ? "Escolha como pagar" : "Acompanhe seu pagamento"}</h2></div><div className="ledger-payable"><strong>{(order.total_cents/100).toLocaleString("pt-BR",{minimumFractionDigits:2})} {order.symbol}</strong><span>BNB Smart Chain · BEP-20</span></div></div>
        {order.is_test && <p className="ledger-test-inline">Teste com 1 USDT real · sem participação na rifa</p>}
        {order.status === "reserved" && <>
          {!walletHash && !hasWalletAttempt(order.id) && <fieldset className="ledger-payment-methods ledger-method-cards"><legend className="ledger-sr-only">Como deseja pagar?</legend><label className={method==="wallet" ? "is-active" : ""}><input type="radio" aria-label="Conectar carteira · txid automático" name={`method-${order.id}`} checked={method==="wallet"} onChange={()=>setMethods(previous=>({...previous,[order.id]:"wallet"}))}/><Wallet size={21} aria-hidden="true"/><span><strong>Carteira cripto</strong><small>WalletConnect ou navegador</small></span><Check size={16} className="ledger-method-check" aria-hidden="true"/></label><label className={method==="external" ? "is-active" : ""}><input type="radio" aria-label="Pagar sem conectar · informar txid" name={`method-${order.id}`} checked={method==="external"} onChange={()=>setMethods(previous=>({...previous,[order.id]:"external"}))}/><ArrowUpRight size={21} aria-hidden="true"/><span><strong>Transferir sem conectar</strong><small>Carteira ou saque de exchange</small></span><Check size={16} className="ledger-method-check" aria-hidden="true"/></label></fieldset>}
          {method === "wallet" ? <WalletPayment order={order} capturedTxid={walletHash} api={api} onCaptured={async hash=>{
            setWalletPending(previous=>({...previous,[order.id]:hash}));
            await api(`/orders/${order.id}/wallet/transaction`,{txid:hash});
            await loadOrders();
            setDetection(previous=>({...previous,[order.id]:"Txid capturado automaticamente. Aguardando confirmação na rede; não pague novamente."}));
          }}/> : <>
            <p className="ledger-external-intro">Envie USDT pela rede BEP-20. Depois, informe o txid para identificar e conferir sua transferência.</p>
            <PaymentQr recipient={order.recipient} symbol={order.symbol} chainId={order.chain_id} totalCents={order.total_cents} expiresAt={order.expires_at}/>
          </>}
          <p className="ledger-payment-deadline"><Clock3 size={15} aria-hidden="true"/>Pague até {new Date(order.expires_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} de {new Date(order.expires_at).toLocaleDateString("pt-BR")} · taxa de rede ou saque à parte.</p>
        </>}
        {order.txid ? <p>Txid: <code>{order.txid}</code></p> : !walletHash && method === "external" ? <form onSubmit={event => { event.preventDefault(); void run(async () => { const data = await api(`/orders/${order.id}/transfer`,{txid:txids[order.id]}); await loadOrders();setMessage(data.message); }); }}>
          <label>Já transferi · informar txid<input required pattern="0x[0-9a-fA-F]{64}" maxLength={66} value={txids[order.id] || ""} onChange={event => setTxids(previous=>({...previous,[order.id]:event.target.value.trim()}))}/></label>
          <button className="ledger-secondary" disabled={busy}>Verificar recebimento</button>
          <small>Obrigatório ao pagar sem conectar. Copie o hash da transação no histórico da carteira ou da exchange.</small>
        </form> : null}
        {!order.txid && (detectionEnabled || walletHash) && <div className="ledger-payment-tracking">{(detection[order.id] || walletHash) && <p role="status">{detection[order.id] || "Transação enviada. Aguarde a confirmação da rede; não pague novamente."}</p>}<button type="button" className="ledger-text-button" disabled={busy} onClick={()=>void run(async()=>{const result=await api(`/orders/${order.id}/detect`,{});setDetection(previous=>({...previous,[order.id]:detectionText(result)}));await loadOrders();})}>Já pagou? Conferir pagamento</button></div>}
        <details className="ledger-order-details"><summary>Detalhes e acompanhamento do pedido</summary><p>Pedido <code>{order.id}</code></p><p>{order.is_test ? "Número TESTE-0001 · não participa da rifa" : `Números: ${order.numbers.map(n => String(n).padStart(4,"0")).join(", ")}`}</p><p>Total: <strong>{money(order.total_cents)} em {order.symbol}</strong></p><p>Contrato USDT: <code>{order.token_address}</code></p><p>O pedido fica salvo neste navegador. Para recuperar em outro dispositivo, confirme seu e-mail.</p><p>A busca automática funciona enquanto esta página está aberta e ao voltar para ela. Pagamentos com carteira vinculada por assinatura são confirmados automaticamente após validar remetente, valor, rede e finalização. Divergências e pagamentos sem prova de titularidade ficam em análise. A participação só é confirmada quando o status indicar “Participação confirmada”.</p><p>Envie o valor líquido exato. Confira taxas e mínimo de saque na exchange. Guarde o registro da transferência.</p><button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void run(async()=>{await loadOrders();})}>Atualizar pagamento</button></details>
      </article>; })}
      {(orders.length>0 || current) && <div className="ledger-order-actions"><Link href="/meus-pedidos">Ver todos os meus pedidos</Link><button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void run(async()=>{await api("/auth/logout",{});setOrders([]);setRecovery(tracking);setSent(false);setCode("");})}>Sair deste dispositivo</button></div>}
      {tracking && !orders.length && !recovery && <p>Nenhum pedido encontrado para este e-mail.</p>}
    </>}
    {message && <p role="status" className="ledger-checkout-message">{message}</p>}
  </section>;
}
