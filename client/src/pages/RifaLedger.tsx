import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { readSelection, saveSelection, discountPercent } from "@/lib/raffle-selection";
import { DRAW_DATE, DRAW_RULE, DRAW_TIME_NOTE } from "@/lib/raffle-schedule";

import { ArrowDown, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Gift, PackageCheck, Search, ShieldCheck, Truck, X, LockKeyhole, Clock3 } from "lucide-react";
import "./rifa-ledger.css";
import "./sales-improvements.css";
import {trackNavigation} from '@/lib/navigation-metrics';


const TOTAL = 1200;
const PAGE_SIZE = 100;
const PRICE = 4;
const numberLabel = (n: number) => String(n).padStart(4, "0");
const usd = (n: number) => n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT';

export default function RifaLedger() {
  const [selected, setSelected] = useState<number[]>(()=>readSelection().slice(0,50));
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selectionFeedback, setSelectionFeedback] = useState("");
  const [inventory,setInventory] = useState<{sold:number[];reserved:number[];updatedAt:string}>({sold:[],reserved:[],updatedAt:''});
  const [inventoryReady,setInventoryReady]=useState(false),[inventoryError,setInventoryError]=useState(false),[sales,setSales]=useState(false),[revision,setRevision]=useState(0);
  const [, navigate] = useLocation();
  useEffect(() => { saveSelection(selected); }, [selected]);
  useEffect(()=>{trackNavigation('landing')},[]);
  useEffect(()=>{if(selected.length)trackNavigation('selection')},[selected.length]);
  useEffect(()=>{let mounted=true,inFlight=false;const controller=new AbortController();async function refresh(){if(inFlight||document.visibilityState!=='visible')return;inFlight=true;try{const responses=await Promise.all(['/inventory','/config'].map(path=>fetch('/api/raffle'+path,{signal:controller.signal,cache:'no-store'})));if(responses.some(r=>!r.ok))throw Error('offline');const [stock,config]=await Promise.all(responses.map(r=>r.json()));if(!Array.isArray(stock.sold)||!Array.isArray(stock.reserved)||[...stock.sold,...stock.reserved].some(n=>!Number.isInteger(n)||n<1||n>TOTAL))throw Error('invalid');if(mounted){setInventory(stock);setSales(config.salesEnabled===true);setInventoryReady(true);setInventoryError(false)}}catch{if(mounted){setInventoryReady(false);setInventoryError(true)}}finally{inFlight=false}}void refresh();const timer=window.setInterval(()=>void refresh(),30000);const onVisible=()=>void refresh();window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);return()=>{mounted=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible)}},[revision]);
  const sold=useMemo(()=>new Set(inventory.sold),[inventory.sold]),reserved=useMemo(()=>new Set(inventory.reserved),[inventory.reserved]);
  const blocked=useMemo(()=>new Set([...sold,...reserved]),[sold,reserved]);
  useEffect(()=>{const removed=selected.filter(n=>blocked.has(n));if(removed.length){setSelected(current=>current.filter(n=>!blocked.has(n)));setSelectionFeedback(`Retirados por indisponibilidade: ${removed.map(numberLabel).join(', ')}. Escolha outros números.`)}},[blocked,selected]);
  const subtotalCents = selected.length * PRICE * 100;
  const discountRate = discountPercent(selected.length);
  const discountCents = Math.round(subtotalCents * discountRate / 100);
  const total = (subtotalCents - discountCents) / 100;
  const buyLabel = `Comprar ${selected.length} ${selected.length === 1 ? "número" : "números"} · ${usd(total)}`;
  const visible = useMemo(() => {
    const numbers = selectedOnly ? [...selected].sort((a, b) => a - b) : Array.from({ length: TOTAL }, (_, i) => i + 1);
    if (search) return numbers.filter(n => numberLabel(n).includes(search));
    return selectedOnly ? numbers : numbers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [selected, selectedOnly, search, page]);

  function toggle(n: number) {
    if(!inventoryReady||blocked.has(n))return;
    if(!selected.includes(n)&&selected.length>=50){setSelectionFeedback('Até 50 números por pedido.');return;}
    setSelectionFeedback("");
    setSelected(current => current.includes(n) ? current.filter(value => value !== n) : [...current, n]);

  }

  function choosePackage(count: number) {
    if(!inventoryReady)return;
    setSelectionFeedback("");
    const chosen = selected.filter(n=>!blocked.has(n)).slice(0, count);
    const available = Array.from({length: TOTAL}, (_, i) => i + 1).filter(n => !blocked.has(n)&&!chosen.includes(n));
    while (chosen.length < count && available.length) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % available.length;
      chosen.push(available.splice(index, 1)[0]);
    }
    setSelected(chosen);
    setSearch('');
    setSelectedOnly(false);
    if(chosen.length)setPage(Math.floor((chosen[0] - 1) / PAGE_SIZE));
    setSelectionFeedback(`Seleção ajustada para ${chosen.length} ${chosen.length===1?'número':'números'}: ${chosen.map(numberLabel).join(', ')}.`);
    document.getElementById('numeros')?.scrollIntoView({behavior: 'auto'});
  }
  function continueCheckout(){if(!inventoryReady||!selected.length)return;saveSelection(selected);navigate('/checkout');}

  return (
    <div className="ledger-page ledger-sales-page">
      <header className="ledger-header">
        <a href="https://investidormatuto.com" className="ledger-brand">INVESTIDOR <span>MATUTO</span><small>CRIPTO • CONHECIMENTO • LIBERDADE</small></a>
        <nav aria-label="Navegação da página"><Link href="/meus-pedidos">Meus pedidos</Link><a href="#numeros">Escolher números</a><a href="#regras">Como funciona</a><a href="https://investidormatuto.com" className="ledger-back"><ArrowLeft size={15} /> Voltar ao site</a></nav>
      </header>
      <main>
        <section className="ledger-hero" aria-labelledby="ledger-title">
          <div className="ledger-hero-copy">
            <div className="ledger-eyebrow"><span /> UMA LEDGER. UMA NOVA POSSIBILIDADE.</div>
            <h1 id="ledger-title">Concorra a uma<br/><em>Ledger Nano Gen5.</em></h1>
            <p>Nova e lacrada. Escolha seus números e acompanhe a apuração pela Loteria Federal.</p>
            <div className="ledger-entry-price"><strong>4 USDT <span>por número</span></strong><small>BNB Smart Chain · BEP-20</small></div>
            <p className="ledger-sales-notice" role="status">{!inventoryReady?(inventoryError?'Não conseguimos consultar a disponibilidade. Tente novamente abaixo.':'Consultando disponibilidade…'):sales?'Vendas abertas · escolha seus números.':'Vendas ainda fechadas. Explore os números e valores; nenhum pagamento será solicitado.'}</p>
            <a className="ledger-primary ledger-hero-cta" href="#numeros">{sales?'Escolher meus números':'Explorar números'}<ArrowDown size={18} aria-hidden="true"/></a>
            <div className="ledger-package-ctas" aria-label="Escolha sua quantidade"><button disabled={!inventoryReady} aria-pressed={selected.length===1} onClick={() => choosePackage(1)}><span>1 número</span><strong>4,00 USDT</strong><small>Selecionar 1 no total</small></button><button disabled={!inventoryReady} aria-pressed={selected.length===3} onClick={() => choosePackage(3)}><span>3 números · 10% OFF</span><strong>10,80 USDT</strong><small>Economize 1,20 USDT</small></button><button disabled={!inventoryReady} aria-pressed={selected.length===5} className="ledger-best-package" onClick={() => choosePackage(5)}><span>5 números · 15% OFF</span><strong>17,00 USDT</strong><small>Economize 3,00 USDT · maior desconto</small></button></div>
            <p className="ledger-package-explanation">Os pacotes definem o total da seleção. Completamos com aleatórios; você pode trocar os números na grade.</p>
            <div className="ledger-hero-facts"><span><PackageCheck size={17} /> Nova e lacrada</span><span><Truck size={17} /> Frete por minha conta</span></div>
            <a href="#premio" className="ledger-real-proof-link"><img src="/assets/ledger-embalagem-real.webp" width="160" height="90" alt="Foto real da embalagem da Ledger enviada pelo organizador"/><span><strong>Veja a embalagem real</strong><small>Foto do prêmio em mãos</small></span><ArrowRight size={17} aria-hidden="true"/></a>
            <details className="ledger-retail-reference"><summary>Valor de referência do aparelho</summary><p><s>R$ 2.099,00</s> · <a href="https://kriptobr.com/" target="_blank" rel="noopener noreferrer">KriptoBR</a> · consultado em 14/11/2026.</p><p>Referência do aparelho, não o preço da participação.</p></details>
          </div>
          <div className="ledger-portrait">
            <div className="ledger-orbit" aria-hidden="true" />
            <img src="/assets/rifa-ledger-matuto.webp" alt="Investidor Matuto apresentando uma Ledger em imagem ilustrativa" width="1183" height="1329" fetchPriority="high" />
            <span className="ledger-photo-note">Imagem ilustrativa · prêmio: aparelho lacrado</span>
          </div>
          <div className="ledger-prize-tag"><Gift size={20} /><span>O PRÊMIO<strong>Ledger Nano Gen5</strong></span></div>
        </section>

        <div className="ledger-metrics"><div><small>POR NÚMERO</small><strong>4 <span>USDT</span></strong></div><div><small>NÚMEROS NO TOTAL</small><strong>1.200</strong></div><div><small>INÍCIO PREVISTO DA APURAÇÃO</small><strong className="ledger-metric-text">{DRAW_DATE}</strong></div><div><small>ENTREGA DO PRÊMIO</small><strong className="ledger-metric-text">Frete incluso</strong></div></div>

        <p className="ledger-schedule-note">{DRAW_RULE} <span>{DRAW_TIME_NOTE}</span></p>
        <section className="ledger-selection" id="numeros" aria-labelledby="numbers-title">
          <div className="ledger-section-title"><div><span className="ledger-eyebrow">01 / ESCOLHA SEUS NÚMEROS</span><h2 id="numbers-title">Qual vai ser o seu?</h2><p>Escolha a quantidade ou toque nos seus favoritos. Até 50 por pedido.</p></div><span className="ledger-preview-badge">{sales?'Vendas abertas':'Vendas fechadas'}</span></div>
          <div className="ledger-shopping-layout">
            <div className="ledger-number-panel">
              <div className="ledger-random-selection"><div><strong>Quantos números você quer?</strong><p>Define o total da seleção, sem somar outra quantidade a cada clique. Completamos com números aleatórios disponíveis.</p></div><div className="ledger-quick-picks" aria-label="Quantidade total da seleção">{[1,3,5].map(count=><button key={count} className="ledger-secondary" type="button" onClick={()=>choosePackage(count)} disabled={!inventoryReady} aria-pressed={selected.length===count} aria-label={`Selecionar ${count} ${count===1?'número':'números'} no total`}>{count} {count===1?'número':'números'}<small>{count===1?'4,00 USDT':count===3?'10,80 USDT · −10%':'17,00 USDT · −15%'}</small></button>)}</div><p className="ledger-selection-feedback" role="status">{selectionFeedback && <span>{selectionFeedback}<br/></span>}<strong>{selected.length} {selected.length===1?'número selecionado':'números selecionados'} · Total {usd(total)}</strong></p></div>
              <div className="ledger-toolbar"><label className="ledger-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Buscar número de 0001 a 1200</span><input inputMode="numeric" value={search} maxLength={4} placeholder="Ou busque seu número favorito…" onChange={e => { setSearch(e.target.value.replace(/\D/g, "")); setPage(0); }} /></label></div>
              <div className="ledger-grid-meta ledger-stock-legend"><span><i className="ledger-dot"/>Disponível</span><span><i className="ledger-dot ledger-dot-selected"/>Selecionado</span><span><LockKeyhole size={13} aria-hidden="true"/>Vendido</span><span><Clock3 size={13} aria-hidden="true"/>Reservado</span><label><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} /> Só meus números</label></div>
              {inventoryError&&<p className="ledger-inline-feedback" role="alert">Não foi possível consultar a disponibilidade. A seleção está pausada. <button type="button" className="ledger-text-button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></p>}
              <div className="ledger-number-grid" aria-label="Números da rifa" aria-busy={!inventoryReady}>{visible.map(n=>{const state=sold.has(n)?'sold':reserved.has(n)?'reserved':selected.includes(n)?'selected':'available',label=state==='sold'?'vendido':state==='reserved'?'reservado':state==='selected'?'selecionado':'disponível';return <button type="button" key={n} className={`is-${state}`} disabled={!inventoryReady||blocked.has(n)} title={`${numberLabel(n)} · ${label}`} aria-label={`Número ${numberLabel(n)} · ${label}`} aria-pressed={selected.includes(n)} onClick={()=>toggle(n)}>{numberLabel(n)}{state==='sold'?<LockKeyhole size={10} aria-hidden="true"/>:state==='reserved'?<Clock3 size={10} aria-hidden="true"/>:null}</button>})}</div>
              {!visible.length && <p className="ledger-empty">{selectedOnly ? "Nenhum número selecionado com esse filtro." : "Nenhum número encontrado. Busque de 0001 a 1200."}</p>}
              {!search && !selectedOnly && <div className="ledger-pagination"><button aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={19} /></button><span>{numberLabel(page * PAGE_SIZE + 1)}–{numberLabel(Math.min((page + 1) * PAGE_SIZE, TOTAL))} <small>de 1.200</small></span><button aria-label="Próxima página" disabled={page === TOTAL / PAGE_SIZE - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={19} /></button></div>}
              <p className="ledger-local-note">{inventoryReady?`${inventory.sold.length} vendidos · ${inventory.reserved.length} reservados. Atualizado às ${new Date(inventory.updatedAt).toLocaleTimeString('pt-BR')}. `:''}Selecionar não reserva o número. O servidor confere a disponibilidade novamente no checkout.</p>
            </div>
            <aside className="ledger-summary" aria-label="Resumo da seleção">
              <span className="ledger-eyebrow">SUA ESCOLHA</span><h3>Um passo mais perto.</h3>
              <div className="ledger-summary-prize"><Gift size={25} /><div><strong>Ledger Nano Gen5</strong><small>Nova, lacrada e com frete incluso</small></div></div>
              <div className="ledger-summary-label"><span>Seus números <b>({selected.length})</b></span><button disabled={!selected.length} onClick={() => { setSelected([]);setSelectionFeedback(""); }}>Limpar</button></div>
              <div className="ledger-chips">{selected.length ? [...selected].sort((a,b) => a-b).map(n => <button key={n} aria-label={`Remover número ${numberLabel(n)}`} onClick={() => toggle(n)}>{numberLabel(n)}<X size={12} /></button>) : <p>Seus números favoritos<br />aparecem aqui.</p>}</div>
              <div className="ledger-discount-offer"><strong>3 a 4 números: 10% OFF</strong><br/><strong>5 ou mais números: 15% OFF</strong><span className="ledger-package-note">Desconto automático no total do pedido. Não cumulativo.</span></div>
              <div className="ledger-price-breakdown" aria-live="polite"><div><span>Subtotal · {selected.length} × 4 USDT</span><span>{usd(subtotalCents / 100)}</span></div><div className={discountCents ? "ledger-discount-active" : ""}><span>Desconto {discountCents > 0 ? `(${discountRate}%)` : ""}</span><span>{discountCents > 0 ? `− ${usd(discountCents / 100)}` : usd(0)}</span></div></div>
              <div className="ledger-total-row"><span>Total</span><strong aria-live="polite">{usd(total)}</strong></div>
              <button className="ledger-primary" disabled={!sales||!inventoryReady||!selected.length} onClick={continueCheckout}>{sales?(selected.length?buyLabel:"Selecione seus números"):"Vendas em breve"}<ArrowRight size={18} /></button>
              <div className="ledger-checkout-note"><ShieldCheck size={17} /><span>{sales?'Sem senha. Comprovante por e-mail com seus números.':'Vendas fechadas. Você pode conferir a seleção; nenhum pagamento será gerado.'}</span></div>
              <details className="ledger-fee-details"><summary>Pagamento e taxas</summary><p>USDT na BNB Smart Chain (BEP-20). Carteiras próprias precisam de BNB para a taxa de rede. Exchanges podem cobrar taxa e exigir saque mínimo. O pedido deve receber o valor líquido exato.</p></details>

            </aside>
          </div>
        </section>

        <section className="ledger-prize-proof" id="premio"><div><span className="ledger-eyebrow">O PRÊMIO EM MÃOS</span><h2>Esta é a embalagem real.</h2><p>Foto enviada pelo organizador da Ledger Nano Gen5 destinada ao vencedor. O aparelho foi informado como novo e lacrado.</p><p>O frete fica por conta do organizador. O endereço só será solicitado ao vencedor, por um canal privado.</p></div><figure><img src="/assets/ledger-embalagem-real.webp" width="1000" height="563" loading="lazy" alt="Foto real da lateral da embalagem Ledger Nano Gen5, com identificação NANOG5-RK-ENFRES"/><figcaption>Foto real da embalagem. A imagem de apresentação no topo é ilustrativa.</figcaption></figure></section>
        <section className="ledger-how ledger-federal-rules" id="regras" aria-labelledby="how-title"><span className="ledger-eyebrow">02 / REGRA DE APURAÇÃO</span><h2 id="how-title">Seu número é o que vale.</h2><p className="ledger-rules-intro">Sem aproximação, troca de número ou escolha manual de vencedor.</p><div className="ledger-steps">{[{n:'01',title:'Lista definitiva antes da extração',text:'Participam apenas os números de 0001 a 1200 com pagamento confirmado até o encerramento. Reservas sem pagamento, não vendidos e testes ficam fora. A lista será publicada antes da primeira extração, sem dados pessoais, e não receberá novos participantes depois.'},{n:'02',title:'Do primeiro ao quinto prêmio',text:'Conferimos os quatro últimos algarismos dos prêmios principais da Federal: 1º, 2º, 3º, 4º e 5º, nessa ordem. Vence o titular do primeiro número entre 0001 e 1200 que estiver na lista. Exemplo: final 0847 com o número 0847 pago → ganha quem comprou 0847.'},{n:'03',title:'Se não houver correspondência',text:'Finais 0000, acima de 1200 ou não participantes são desconsiderados. Sem correspondência nos cinco prêmios, usamos a próxima extração, com a mesma lista e mantendo as vendas encerradas. Sem números pagos, não haverá contemplado.'}].map(step=><article key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div><div className="ledger-rules-schedule"><strong>{DRAW_RULE}</strong><p>{DRAW_TIME_NOTE}</p><p>Se a extração for adiada, aguardamos seu resultado oficial. Se for cancelada definitivamente, usamos a próxima extração disponível. A divulgação mostrará concurso, prêmio considerado, terminação e número vencedor.</p><a href="https://loterias.caixa.gov.br/Paginas/Federal.aspx" target="_blank" rel="noopener noreferrer">Consultar resultados oficiais da CAIXA</a></div></section>
        <section className="ledger-faq" aria-labelledby="faq-title"><div><span className="ledger-eyebrow">ANTES DE PARTICIPAR</span><h2 id="faq-title">Tudo às claras.</h2><p>Preço, pagamento e sorteio em um só lugar.</p></div><div>{[{q:'Quanto custa e quais os descontos?',a:'Um número custa 4 USDT. De 3 a 4 números, o desconto é de 10%; a partir de 5, de 15%. Três números custam 10,80 USDT e cinco custam 17 USDT. Descontos não são cumulativos.'},{q:'O prêmio é novo?',a:'O prêmio informado é uma Ledger Nano Gen5 nova e lacrada. A foto real da embalagem está nesta página. A imagem de apresentação com o organizador é ilustrativa.'},{q:'O sorteio depende de vender todos os números?',a:'Não. A apuração começa na extração inicial divulgada, mesmo sem esgotar os 1.200 números. Se nenhum final dos cinco prêmios corresponder a um participante, a apuração continua na próxima extração, com a mesma lista. O vencedor pode ser identificado depois de 20/12. Sem números pagos, não haverá contemplado.'},{q:'Quem paga o frete?',a:'O organizador assume o frete. A região de entrega e o tratamento de eventuais tributos serão divulgados antes das vendas. O endereço só será solicitado ao vencedor.'},{q:'Quando será e como posso pagar?',a:DRAW_RULE+' '+DRAW_TIME_NOTE+' O pagamento será em USDT na BNB Smart Chain (BEP-20), com carteira conectada ou transferência sem conectar. Sem conexão, informe o txid para conferência. Taxa de rede ou saque é separada.'},{q:'Vou receber meus números por e-mail?',a:'Sim. Após a confirmação, o comprovante inclui valor, pedido e números comprados. Para recuperar o pedido em outro dispositivo, use o mesmo e-mail em “Meus pedidos”. Não pedimos seed nem chave privada.'}].map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
      </main>
      <footer className="ledger-footer"><a href="https://investidormatuto.com">INVESTIDOR MATUTO</a><span>{sales?'Vendas abertas':'Vendas públicas ainda fechadas'}</span><span>Ledger é marca de seu respectivo titular. Esta ação não é oficial da Ledger nem da CAIXA.</span></footer>
      {selected.length>0&&<div className="ledger-mobile-selection"><div><strong>{selected.length} {selected.length===1?'número':'números'} · {usd(total)}</strong><small>{sales?'Frete incluso · taxa de rede à parte':'Vendas em breve'}</small></div><button type="button" className="ledger-primary" disabled={!sales||!inventoryReady} aria-label={sales?buyLabel:"Vendas em breve"} onClick={continueCheckout}>{sales?"Comprar":"Vendas em breve"}<ArrowRight size={17} aria-hidden="true"/></button></div>}
    </div>
  );
}