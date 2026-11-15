import { useEffect, useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  recipient: string;
  symbol: string;
  chainId: number;
  totalCents: number;
  expiresAt: string;
};

export default function PaymentQr({ recipient, symbol, chainId, totalCents, expiresAt }: Props) {
  const id = useId();
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline) || now >= deadline) {
    return <p role="status">Esta reserva venceu. Não envie valores; atualize seus pedidos.</p>;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    return <p role="alert">Endereço indisponível. Solicite suporte antes de enviar.</p>;
  }
  const amount = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalCents / 100);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(recipient);
      setFeedback("Endereço copiado.");
    } catch {
      setFeedback("Não foi possível copiar. Selecione o endereço abaixo e copie manualmente.");
    }
  }
  return (
    <div className="ledger-payment-qr">
      <figure>
        <QRCodeSVG value={recipient} size={220} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title="QR code do endereço de recebimento" role="img" aria-label="QR code do endereço de recebimento" />
        <figcaption>Escaneie no app da carteira ou exchange</figcaption>
      </figure>
      <div className="ledger-payment-details">
        <strong className="ledger-payment-amount">{amount} {symbol}</strong>
        <p>Rede: <strong>{Number(chainId) === 56 ? "BNB Smart Chain (BEP-20)" : `EVM · ID ${chainId}`}</strong></p>
        <p>Envie exatamente {amount} {symbol}. O QR preenche apenas o endereço; confira a moeda e a rede no app.</p>
        <label htmlFor={id}>Endereço de recebimento</label>
        <input id={id} readOnly value={recipient} onFocus={(event) => event.target.select()} spellCheck={false} />
        <button type="button" className="ledger-secondary" onClick={() => void copyAddress()}>Copiar endereço</button>
        <p role="status" className="ledger-copy-feedback">{feedback}</p>
      </div>
    </div>
  );
}
