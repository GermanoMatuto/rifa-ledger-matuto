import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {ArrowLeft,Gift,ShieldCheck} from 'lucide-react';
import RaffleCheckout from '@/components/RaffleCheckout';
import {readSelection,formatUSD,discountPercent} from '@/lib/raffle-selection';
import './rifa-ledger.css';
import {DRAW_RULE,DRAW_TIME_NOTE} from '@/lib/raffle-schedule';
export default function CheckoutPage({tracking=false}:{tracking?:boolean}){
 const [numbers]=useState(readSelection);
 const subtotal=numbers.length*400,rate=discountPercent(numbers.length),discount=Math.round(subtotal*rate/100);
 useEffect(()=>{window.scrollTo(0,0);document.title=tracking?'Meus pedidos | Investidor Matuto':'Checkout | Investidor Matuto';return()=>{document.title='Ledger | Investidor Matuto'}},[tracking]);
 return <div className="ledger-page ledger-checkout-page"><header className="ledger-header"><Link href="/" className="ledger-brand">INVESTIDOR <span>MATUTO</span></Link><Link href="/" className="ledger-back"><ArrowLeft size={16}/>Voltar aos números</Link></header><main className="ledger-checkout-main"><span className="ledger-eyebrow">{tracking?'ACOMPANHE SUA PARTICIPAÇÃO':'02 / CADASTRO E PAGAMENTO'}</span><h1>{tracking?'Meus pedidos':'Confira sua escolha.'}</h1><p className="ledger-checkout-intro">{tracking?'Entre com seu e-mail para consultar suas comandas e pagamentos.':'Confira os números e o total antes de entrar na conta e criar sua comanda.'}</p>
 {!tracking&&!numbers.length?<section className="ledger-number-panel"><h2>Escolha seus números primeiro.</h2><p>Nenhuma seleção foi encontrada neste navegador.</p><Link href="/" className="ledger-primary">Escolher números</Link></section>:<div className={tracking?'ledger-tracking-layout':'ledger-checkout-layout'}>
 {!tracking&&<aside className="ledger-summary ledger-checkout-summary"><div className="ledger-summary-prize"><Gift size={26}/><div><strong>Ledger Nano Gen5</strong><small>Nova, lacrada e com frete incluso</small></div></div><h2>Resumo do pedido</h2><p>{numbers.length} número(s) selecionado(s)</p><div className="ledger-checkout-numbers">{numbers.map(n=><span key={n}>{String(n).padStart(4,'0')}</span>)}</div><Link className="ledger-edit-selection" href="/">Alterar números</Link><div className="ledger-price-breakdown"><div><span>Subtotal</span><span>{formatUSD(subtotal)}</span></div><div className={discount?'ledger-discount-active':''}><span>Desconto {discount?`(${rate}%)`:''}</span><span>{discount?'− ':''}{formatUSD(discount)}</span></div></div><div className="ledger-total-row"><span>Total</span><strong>{formatUSD(subtotal-discount)}</strong></div><div className="ledger-checkout-note"><ShieldCheck size={18}/><span>USDT · BNB Smart Chain (BEP-20). A seleção só será reservada após criar a comanda no servidor.</span></div><p className="ledger-local-note">{DRAW_RULE}</p><p className="ledger-local-note">{DRAW_TIME_NOTE} Prévia: vendas e pagamentos fechados.</p></aside>}
 <div className="ledger-number-panel ledger-checkout-form"><RaffleCheckout numbers={tracking?[]:numbers} tracking={tracking}/></div></div>}
 </main><footer className="ledger-footer"><Link href="/">INVESTIDOR MATUTO</Link><Link href={tracking?'/checkout':'/meus-pedidos'}>{tracking?'Voltar ao checkout':'Meus pedidos'}</Link><span>Dados de contato privados. Endereço de envio solicitado somente ao vencedor.</span></footer></div>
}



