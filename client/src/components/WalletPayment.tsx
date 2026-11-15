import { useEffect, useState } from "react";
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
  const wallet = wallets.find(item => item.id === selected) || wallets[0];
  async function act(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { setMessage((error as { code?: number })?.code === 4001 ? "Solicitação cancelada na carteira. Nenhum novo pagamento foi solicitado pelo site." : error instanceof Error ? error.message : "Não foi possível concluir. Confira sua carteira antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  const amount = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(order.total_cents / 100);
  return <div className="ledger-wallet-payment">
    <p className="ledger-wallet-security"><strong>Você mantém o controle da sua carteira.</strong><br/>Não temos acesso à sua seed ou chave privada. A conexão permite consultar seu endereço público e solicitar este pagamento. Você confirma cada solicitação na própria carteira. Não pedimos aprovação ilimitada de tokens.</p>
    {wallets.length > 1 && !address && <label>Escolha sua carteira<select value={selected || wallets[0]?.id} disabled={busy} onChange={event => {setSelected(event.target.value);setAddress("");}}>{wallets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {hash ? <><p>Transação capturada. Aguarde a confirmação na rede; não pague novamente.</p><code>{hash}</code><button type="button" className="ledger-secondary" disabled={busy} onClick={()=>void act(()=>onCaptured(hash))}>Atualizar transação capturada</button></> : uncertain ? <>
      <p>Uma solicitação de pagamento foi aberta, mas ainda não temos o resultado. Confira o histórico da carteira antes de tentar outro pagamento.</p>
      <label>Recuperar txid do histórico<input value={recoveryHash} maxLength={66} onChange={event=>setRecoveryHash(event.target.value.trim())}/></label>
      <button type="button" className="ledger-secondary" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash)} onClick={()=>void act(()=>onCaptured(recoveryHash))}>Acompanhar esta transação</button>
    </> : !address ? <>
      <button type="button" className="ledger-primary" disabled={busy || !wallet} onClick={()=>void act(async()=>{if(wallet)setAddress(await connectWallet(wallet.provider,Number(order.chain_id)));})}>{busy ? "Abra sua carteira…" : "Conectar carteira"}</button>
      {!wallet && <p>Nenhuma carteira foi encontrada neste navegador. Abra o site no navegador da sua carteira ou escolha pagar sem conectar.</p>}
    </> : <>
      <p>Carteira selecionada: <code>{address}</code></p>
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
      <button type="button" className="ledger-secondary" disabled={busy} onClick={()=>setAddress("")}>Escolher outra carteira</button>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
