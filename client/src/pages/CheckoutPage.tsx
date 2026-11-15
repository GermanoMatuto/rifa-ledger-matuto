import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Gift, ShieldCheck } from 'lucide-react';
import RaffleCheckout from '@/components/RaffleCheckout';
import { readSelection, formatUSD, discountPercent } from '@/lib/raffle-selection';
import { DRAW_RULE, DRAW_TIME_NOTE } from '@/lib/raffle-schedule';
import './rifa-ledger.css';
export default function CheckoutPage({ tracking = false }: { tracking?: boolean }) {
  const testMode = !tracking && new URLSearchParams(window.location.search).get('teste') === '1';
  const [numbers] = useState(() => testMode ? [] : readSelection());
  const subtotal = testMode ? 100 : numbers.length * 400, rate = testMode ? 0 : discountPercent(numbers.length), discount = Math.round(subtotal * rate / 100);
  useEffect(() => {
    window.scrollTo(0, 0); document.title = tracking ? 'Meus pedidos | Investidor Matuto' : 'Checkout | Investidor Matuto';
    return () => { document.title = 'Ledger | Investidor Matuto'; };
  }, [tracking]);
  return <div className="ledger-page ledger-checkout-page">
    <header className="ledger-header"><Link href="/" className="ledger-brand">INVESTIDOR <span>MATUTO</span></Link><Link href="/" className="ledger-back"><ArrowLeft size={16}/>Voltar aos números</Link></header>
    <main className="ledger-checkout-main">
      <span className="ledger-eyebrow">{tracking ? 'ACOMPANHE SEU PEDIDO' : testMode ? 'TESTE DO ORGANIZADOR' : 'FINALIZE SUA ESCOLHA'}</span>
      <h1>{tracking ? 'Meus pedidos' : testMode ? 'Teste de pagamento · 1 USDT' : 'Falta pouco para concluir.'}</h1>
      <p className="ledger-checkout-intro">{tracking ? 'Retome neste navegador ou confirme seu e-mail para recuperar seus pedidos.' : 'Confira o resumo, informe seu contato e siga direto para o QR code. Sem criar senha.'}</p>
      {!tracking && !testMode && !numbers.length ? <section className="ledger-number-panel"><h2>Escolha seus números primeiro.</h2><p>Nenhuma seleção foi encontrada neste navegador.</p><Link href="/" className="ledger-primary">Escolher números</Link><Link href="/meus-pedidos">Já fiz um pedido</Link></section> : <div className={tracking ? 'ledger-tracking-layout' : 'ledger-checkout-layout'}>
        {!tracking && <aside className="ledger-summary ledger-checkout-summary">
          <div className="ledger-summary-prize"><Gift size={26}/><div><strong>{testMode ? 'Teste de recebimento' : 'Ledger Nano Gen5'}</strong><small>{testMode ? 'Sem participação na rifa' : 'Nova, lacrada e com frete incluso'}</small></div></div>
          <h2>Resumo do pedido</h2><p>{testMode ? '1 número de teste' : `${numbers.length} número(s) selecionado(s)`}</p>
          <div className="ledger-checkout-numbers">{testMode ? <span>TESTE-0001</span> : numbers.map(n=><span key={n}>{String(n).padStart(4,'0')}</span>)}</div>
          {!testMode && <Link className="ledger-edit-selection" href="/">Alterar números</Link>}
          <div className="ledger-price-breakdown"><div><span>Subtotal</span><span>{formatUSD(subtotal)}</span></div>{!testMode && <div className={discount ? 'ledger-discount-active' : ''}><span>Desconto {discount ? `(${rate}%)` : ''}</span><span>{discount ? '− ' : ''}{formatUSD(discount)}</span></div>}</div>
          <div className="ledger-total-row"><span>Total</span><strong>{formatUSD(subtotal-discount)}</strong></div>
          <div className="ledger-checkout-note"><ShieldCheck size={18}/><span>USDT · BNB Smart Chain (BEP-20). Taxa de saque ou rede separada. {testMode ? 'Teste com moeda real, sem reservar números da campanha.' : 'O pedido só é reservado quando o servidor confirma a disponibilidade.'}</span></div>
          {!testMode && <><p className="ledger-local-note">{DRAW_RULE}</p><p className="ledger-local-note">{DRAW_TIME_NOTE} Vendas públicas ainda fechadas.</p></>}
        </aside>}
        <div className="ledger-number-panel ledger-checkout-form"><RaffleCheckout numbers={numbers} tracking={tracking} testMode={testMode}/></div>
      </div>}
    </main>
    <footer className="ledger-footer"><Link href="/">INVESTIDOR MATUTO</Link><Link href={tracking ? '/checkout' : '/meus-pedidos'}>{tracking ? 'Voltar ao checkout' : 'Meus pedidos'}</Link><span>Dados de contato privados. Endereço de envio solicitado somente ao vencedor.</span></footer>
  </div>;
}
