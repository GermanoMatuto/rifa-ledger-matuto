import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Wallet as WalletIcon, Smartphone, ChevronRight, ShieldCheck, X, CheckCircle2 } from "lucide-react";
import { getWalletConnect, walletConnectAdapter, walletConnectNamespaces, walletConnectProjectId } from "@/lib/walletconnect";
import { connectWallet, sendWalletPayment, signWalletLink, type WalletProvider, type PaymentRequest } from "@/lib/wallet-payment";

type Wallet = { id: string; name: string; provider: WalletProvider };
type Props = { order: PaymentRequest; capturedTxid?: string | null; api: (path: string, body?: object) => Promise<any>; onCaptured: (txid: string) => Promise<void> };
export default function WalletPayment({ order, capturedTxid, api, onCaptured }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]), [selected, setSelected] = useState("");
  const [address, setAddress] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [localTxid, setLocalTxid] = useState<string | null>(() => {
    try { return localStorage.getItem(`matuto-payment-tx:${order.id}`); } catch { return null; }
  });
  const [uncertain, setUncertain] = useState(() => { try { return localStorage.getItem(`matuto-payment-attempt:${order.id}`) === "1"; } catch { return false; } });
  const [recoveryHash, setRecoveryHash] = useState("");
  const [remoteWallet, setRemoteWallet] = useState<Wallet | null>(null);
  const [pairingUri, setPairingUri] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const connectionEpoch = useRef(0);
  const cancelPairing = useRef<(() => void) | null>(null);
  const disconnectRemote = useRef<(() => Promise<void>) | null>(null);
  const hash = capturedTxid || localTxid;
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.info?.uuid || typeof detail.info.name !== "string" || typeof detail.provider?.request !== "function") return;
      setWallets(previous => previous.some(wallet => wallet.id === detail.info.uuid) ? previous : [...previous, { id: detail.info.uuid, name: detail.info.name.slice(0, 60), provider: detail.provider }]);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const legacy = (window as Window & { ethereum?: WalletProvider }).ethereum;
    if (legacy?.request) setWallets(previous => previous.length ? previous : [{ id: "browser", name: "Carteira do navegador", provider: legacy }]);
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  const wallet = remoteWallet || wallets.find(item => item.id === selected) || wallets[0];
  useEffect(() => () => cancelPairing.current?.(), []);
  useEffect(() => {
    const dialog = modal.current;
    if (modalOpen && dialog && !dialog.open) dialog.showModal();
    if (!modalOpen && dialog?.open) dialog.close();
  }, [modalOpen]);
  function closeModal() { connectionEpoch.current++; cancelPairing.current?.(); setModalOpen(false); }
  async function connectRemote() {
    const epoch = connectionEpoch.current;
    const provider = await getWalletConnect();
    if (epoch !== connectionEpoch.current) throw new Error("Conexão cancelada.");
    const showUri = (uri: string) => { setPairingUri(uri); setPairingMessage(""); };
    provider.on("display_uri", showUri);
    let cancelled = false;
    try {
      await new Promise<void>((resolve, reject) => {
        cancelPairing.current = () => {
          cancelled = true; provider.abortPairingAttempt();
          reject(new Error("Conexão cancelada. Você pode pagar sem conectar."));
        };
        const connection = provider.session ? Promise.resolve(provider.session) : provider.connect({ namespaces: walletConnectNamespaces });
        void connection.then(async () => {
          if (cancelled) { if (provider.session) await provider.disconnect(); return; }
          resolve();
        }, reject);
      });
      const adapter = walletConnectAdapter(provider);
      const account = await connectWallet(adapter, Number(order.chain_id));
      setRemoteWallet({ id: "walletconnect", name: "WalletConnect", provider: adapter });
      setAddress(account);
      setModalOpen(false);
      disconnectRemote.current = async () => { if (provider.session) await provider.disconnect(); };
    } finally {
      cancelPairing.current = null; provider.removeListener("display_uri", showUri); setPairingUri("");
    }
  }
  async function act(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { setMessage((error as { code?: number })?.code === 4001 ? "Solicitação cancelada na carteira. Nenhum novo pagamento foi solicitado pelo site." : error instanceof Error ? error.message : "Não foi possível concluir. Confira sua carteira antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  const amount = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(order.total_cents / 100);
  return <div className="ledger-wallet-payment">
    {hash ? <><p>Transação capturada. Aguarde a confirmação na rede; não pague novamente.</p><code>{hash}</code><button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void act(()=>onCaptured(hash))}>Atualizar transação capturada</button></> : uncertain ? <>
      <p>Uma solicitação de pagamento foi aberta, mas ainda não temos o resultado. Confira o histórico da carteira antes de tentar outro pagamento.</p>
      <label>Recuperar txid do histórico<input value={recoveryHash} maxLength={66} onChange={event=>setRecoveryHash(event.target.value.trim())}/></label>
      <button type="button" className="ledger-secondary" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash)} onClick={()=>void act(()=>onCaptured(recoveryHash))}>Acompanhar esta transação</button>
    </> : !address ? <>
      <div className="ledger-connect-intro"><span className="ledger-connect-symbol"><WalletIcon size={26} aria-hidden="true"/></span><h3>Pague pela sua carteira</h3><p>Conecte, confira o valor e aprove na carteira.<br/>O txid será preenchido automaticamente.</p></div>
      <button type="button" className="ledger-primary" disabled={busy} onClick={()=>{setMessage("");setModalOpen(true);}}><WalletIcon size={18} aria-hidden="true"/>{busy ? "Conectando…" : "Conectar carteira"}</button>
      <p className="ledger-connect-support">WalletConnect e carteiras instaladas no navegador</p>
    </> : <>
      <p className="ledger-connected-account"><CheckCircle2 size={18} aria-hidden="true"/>Conectada <code title={address}>{address.slice(0,6)}…{address.slice(-4)}</code></p>
      <p><strong>{amount} USDT · BNB Smart Chain (BEP-20)</strong><br/>Destinatário: <code>{order.recipient}</code><br/>A taxa de rede em BNB é separada e aparece na carteira.</p>
      <p>Serão duas confirmações: primeiro uma assinatura para vincular a carteira ao pedido, sem transferir fundos; depois a transferência exata de USDT.</p>
      <button type="button" className="ledger-primary" disabled={busy} onClick={()=>void act(async()=>{
        if (!wallet) return;
        const challenge = await api(`/orders/${order.id}/wallet/challenge`, { address });
        const signature = await signWalletLink(wallet.provider,address,challenge.message);
        await api(`/orders/${order.id}/wallet/verify`,{signature});
        let txid: string;
        try { txid = await sendWalletPayment(wallet.provider,address,order,()=>{
          setUncertain(true);
          try { localStorage.setItem(`matuto-payment-attempt:${order.id}`,"1"); } catch { /* Retain in component state. */ }
        }); }
        catch (error) {
          if ((error as { code?: number })?.code === 4001) { setUncertain(false); try { localStorage.removeItem(`matuto-payment-attempt:${order.id}`); } catch { /* Retain in component state. */ } }
          throw error;
        }
        setLocalTxid(txid);
        try { localStorage.setItem(`matuto-payment-tx:${order.id}`,txid); } catch { /* The hash remains visible for manual recovery. */ }
        try { localStorage.removeItem(`matuto-payment-attempt:${order.id}`); } catch { /* The captured hash takes priority. */ }
        setUncertain(false);
        await onCaptured(txid);
      })}>{busy ? "Confira as solicitações na carteira…" : `Confirmar vínculo e pagar ${amount} USDT`}</button>
      <button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void act(async()=>{await disconnectRemote.current?.();disconnectRemote.current=null;setRemoteWallet(null);setAddress("");})}>Escolher outra carteira</button>
    </>}
    <p className="ledger-wallet-security"><ShieldCheck size={16} aria-hidden="true"/><span>Sua carteira continua sob seu controle. Não temos acesso à sua seed ou chave privada.</span></p>
    <details className="ledger-wallet-permissions"><summary>O que a conexão permite?</summary><p>Consultar seu endereço público e solicitar a assinatura do vínculo com o pedido e a transferência exata de USDT. Você aprova cada solicitação na carteira. Não pedimos aprovação ilimitada de tokens.</p></details>
    {message && !modalOpen && <p role="status" className="ledger-inline-feedback">{message}</p>}
    <dialog ref={modal} className="ledger-wallet-modal" aria-labelledby={`wallet-title-${order.id}`} onKeyDown={event=>{
      if(event.key!=="Tab")return;
      const controls=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if(first && ((event.shiftKey && document.activeElement===first)||(!event.shiftKey && document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
    }} onCancel={event=>{event.preventDefault();closeModal();}} onClick={event=>{if(event.target===event.currentTarget) {const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeModal();}}}>
      <header className="ledger-wallet-modal-header"><div><h2 id={`wallet-title-${order.id}`}>{pairingUri ? "Conectar com WalletConnect" : "Conectar carteira"}</h2><p>{pairingUri ? "Aprove a conexão no app da sua carteira." : "Escolha como deseja conectar."}</p></div><button type="button" className="ledger-icon-button" aria-label="Fechar conexão" onClick={closeModal}><X size={20} aria-hidden="true"/></button></header>
      {pairingUri ? <section className="ledger-walletconnect-pairing" aria-label="Conectar pelo WalletConnect">
        <div className="ledger-pairing-qr"><QRCodeSVG value={pairingUri} size={250} marginSize={4} bgColor="#ffffff" fgColor="#000000" title="QR para conectar a carteira via WalletConnect"/></div>
        <p>Leia o QR pela opção <strong>WalletConnect</strong> da sua carteira. Este QR conecta; ele não transfere valores.</p>
        <button type="button" className="ledger-secondary" onClick={()=>void navigator.clipboard.writeText(pairingUri).then(()=>setPairingMessage("Código de conexão copiado."),()=>setPairingMessage("Não foi possível copiar. Use a leitura do QR."))}>Copiar código de conexão</button>
        <p className="ledger-modal-hint">No mesmo celular? Cole o código na opção WalletConnect da carteira.</p>
        <button type="button" className="ledger-text-button" onClick={()=>cancelPairing.current?.()}>Cancelar conexão</button>
        {pairingMessage && <p role="status">{pairingMessage}</p>}
      </section> : <div className="ledger-wallet-options">
        {walletConnectProjectId && <button type="button" className="ledger-wallet-option" disabled={busy} onClick={()=>void act(connectRemote)}><span className="ledger-wallet-option-icon"><Smartphone size={23} aria-hidden="true"/></span><span><strong>WalletConnect</strong><small>Conectar pelo app ou QR code</small></span><ChevronRight size={19} aria-hidden="true"/></button>}
        {wallets.map(item=><button type="button" className="ledger-wallet-option" key={item.id} disabled={busy} onClick={()=>void act(async()=>{setSelected(item.id);setRemoteWallet(null);setAddress(await connectWallet(item.provider,Number(order.chain_id)));setModalOpen(false);})}><span className="ledger-wallet-option-icon"><WalletIcon size={23} aria-hidden="true"/></span><span><strong>{item.name}</strong><small>Disponível neste navegador</small></span><ChevronRight size={19} aria-hidden="true"/></button>)}
        {busy && <p role="status">Preparando conexão… Confira sua carteira.</p>}
        {!wallets.length && !walletConnectProjectId && <p>Nenhuma carteira disponível. Use o pagamento sem conectar.</p>}
      </div>}
      {message && <p role="status" className="ledger-inline-feedback">{message}</p>}
      <footer className="ledger-wallet-modal-footer"><ShieldCheck size={16} aria-hidden="true"/>Conectar não movimenta seus fundos.</footer>
    </dialog>
  </div>;
}
