import { Component, lazy, Suspense, useCallback, useRef, useState } from "react";
import { Wallet as WalletIcon, ShieldCheck, CheckCircle2 } from "lucide-react";
import { connectWallet, sendWalletPayment, signWalletLink, type WalletProvider, type PaymentRequest } from "@/lib/wallet-payment";
class ConnectionBoundary extends Component<{children: import("react").ReactNode}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <p role="status">Não foi possível carregar as carteiras. Recarregue a página ou escolha transferir sem conectar.</p> : this.props.children;}
}
const RainbowWalletConnector = lazy(() => import("./RainbowWalletConnector"));

type Wallet = { id: string; name: string; provider: WalletProvider };
type Props = { order: PaymentRequest; capturedTxid?: string | null; api: (path: string, body?: object) => Promise<any>; onCaptured: (txid: string) => Promise<void> };
export default function WalletPayment({ order, capturedTxid, api, onCaptured }: Props) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [connectionRequest, setConnectionRequest] = useState(0);
  const [address, setAddress] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [localTxid, setLocalTxid] = useState<string | null>(() => {
    try { return localStorage.getItem(`matuto-payment-tx:${order.id}`); } catch { return null; }
  });
  const [uncertain, setUncertain] = useState(() => { try { return localStorage.getItem(`matuto-payment-attempt:${order.id}`) === "1"; } catch { return false; } });
  const [recoveryHash, setRecoveryHash] = useState("");
  const disconnectRemote = useRef<(() => Promise<void>) | null>(null);
  const hash = capturedTxid || localTxid;
  const onReady = useCallback((provider: WalletProvider, account: string, disconnect: () => Promise<void>) => {
    setWallet({id:"connected",name:"Carteira",provider});setAddress(account);disconnectRemote.current=disconnect;
  }, []);
  const onLost = useCallback(()=>{setWallet(null);setAddress("");},[]);
  const onError = useCallback((text: string)=>setMessage(text),[]);
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
      <button type="button" className="ledger-primary" disabled={busy} onClick={()=>{setMessage("");setConnectionRequest(value=>value+1);}}><WalletIcon size={18} aria-hidden="true"/>{busy ? "Conectando…" : "Conectar carteira"}</button>
      <p className="ledger-connect-support">WalletConnect e carteiras instaladas no navegador</p>
    </> : <>
      <p className="ledger-connected-account"><CheckCircle2 size={18} aria-hidden="true"/>Conectada <code title={address}>{address.slice(0,6)}…{address.slice(-4)}</code></p>
      <p><strong>{amount} USDT · BNB Smart Chain (BEP-20)</strong><br/>Destinatário: <code>{order.recipient}</code><br/>A taxa de rede em BNB é separada e aparece na carteira.</p>
      <p>Serão duas confirmações: primeiro uma assinatura para vincular a carteira ao pedido, sem transferir fundos; depois a transferência exata de USDT.</p>
      <button type="button" className="ledger-primary" disabled={busy} onClick={()=>void act(async()=>{
        if (!wallet) return;
        const currentAddress = await connectWallet(wallet.provider, Number(order.chain_id));
        if (currentAddress.toLowerCase() !== address.toLowerCase()) throw new Error("A conta da carteira mudou. Confira a conta conectada e tente novamente.");
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
      <button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void act(async()=>{await disconnectRemote.current?.();disconnectRemote.current=null;setWallet(null);setAddress("");})}>Escolher outra carteira</button>
    </>}
    <p className="ledger-wallet-security"><ShieldCheck size={16} aria-hidden="true"/><span>Sua carteira continua sob seu controle. Não temos acesso à sua seed ou chave privada.</span></p>
    <details className="ledger-wallet-permissions"><summary>O que a conexão permite?</summary><p>Consultar seu endereço público e solicitar a assinatura do vínculo com o pedido e a transferência exata de USDT. Você aprova cada solicitação na carteira. Não pedimos aprovação ilimitada de tokens.</p></details>
    {message && <p role="status" className="ledger-inline-feedback">{message}</p>}
    {connectionRequest > 0 && <ConnectionBoundary><Suspense fallback={<p role="status">Carregando carteiras…</p>}><RainbowWalletConnector request={connectionRequest} onReady={onReady} onLost={onLost} onError={onError}/></Suspense></ConnectionBoundary>}
  </div>;
}
