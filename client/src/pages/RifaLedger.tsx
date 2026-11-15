import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { readSelection, saveSelection } from "@/lib/raffle-selection";
import { DRAW_DATE, DRAW_RULE, DRAW_TIME_NOTE } from "@/lib/raffle-schedule";

import { ArrowDown, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Gift, PackageCheck, Search, ShieldCheck, Truck, X } from "lucide-react";
import "./rifa-ledger.css";


const TOTAL = 1200;
const PAGE_SIZE = 100;
const PRICE = 4;
const numberLabel = (n: number) => String(n).padStart(4, "0");
const usd = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export default function RifaLedger() {
  const [selected, setSelected] = useState<number[]>(readSelection);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [, navigate] = useLocation();
  useEffect(() => { saveSelection(selected); }, [selected]);
  const subtotalCents = selected.length * PRICE * 100;
  const discountCents = selected.length >= 4 ? Math.round(subtotalCents * 0.1) : 0;
  const total = (subtotalCents - discountCents) / 100;
  const visible = useMemo(() => {
    const numbers = selectedOnly ? [...selected].sort((a, b) => a - b) : Array.from({ length: TOTAL }, (_, i) => i + 1);
    if (search) return numbers.filter(n => numberLabel(n).includes(search));
    return selectedOnly ? numbers : numbers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [selected, selectedOnly, search, page]);

  function toggle(n: number) {
    setSelected(current => current.includes(n) ? current.filter(value => value !== n) : [...current, n]);

  }

  function surprise() {
    const available = Array.from({ length: TOTAL }, (_, i) => i + 1).filter(n => !selected.includes(n));
    const chosen: number[] = [];
    for (let i = 0; i < 5 && available.length; i++) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % available.length;
      chosen.push(available.splice(index, 1)[0]);
    }
    setSelected(current => [...current, ...chosen]);
    if (chosen.length) setPage(Math.floor((chosen[0] - 1) / PAGE_SIZE));
    setSearch("");

  }

  return (
    <div className="ledger-page">
      <header className="ledger-header">
        <a href="https://investidormatuto.com" className="ledger-brand">INVESTIDOR <span>MATUTO</span><small>CRIPTO • CONHECIMENTO • LIBERDADE</small></a>
        <nav aria-label="Navegação da página"><Link href="/meus-pedidos">Meus pedidos</Link><a href="#numeros">Escolher números</a><a href="#regras">Como funciona</a><a href="https://investidormatuto.com" className="ledger-back"><ArrowLeft size={15} /> Voltar ao site</a></nav>
      </header>
      <main>
        <section className="ledger-hero" aria-labelledby="ledger-title">
          <div className="ledger-hero-copy">
            <div className="ledger-eyebrow"><span /> UMA LEDGER. UMA NOVA POSSIBILIDADE.</div>
            <h1 id="ledger-title">Sua próxima<br />Ledger pode<br />estar <em>aqui.</em></h1>
            <p>Ledger Nano Gen5 nova e lacrada.<br />Escolha seus números e acompanhe essa ação da comunidade Investidor Matuto.</p>
            <div className="ledger-retail-price"><span>Preço de referência no varejo</span><s>R$ 2.099,00</s><a href="https://kriptobr.com/" target="_blank" rel="noopener noreferrer">KriptoBR · Pix/boleto · consultado em 14/11/2026</a><small>Referência do aparelho; US$ 4 é o valor de um número, não a compra da Ledger.</small></div>
            <a className="ledger-primary ledger-hero-cta" href="#numeros">Escolher meus números <ArrowDown size={18} /></a>
            <div className="ledger-hero-facts"><span><PackageCheck size={17} /> Nova e lacrada</span><span><Truck size={17} /> Frete por minha conta</span></div>
          </div>
          <div className="ledger-portrait">
            <div className="ledger-orbit" aria-hidden="true" />
            <img src="/assets/rifa-ledger-matuto.webp" alt="Investidor Matuto apresentando uma Ledger em imagem ilustrativa" width="1183" height="1329" fetchPriority="high" />
            <span className="ledger-photo-note">Imagem ilustrativa · prêmio: aparelho lacrado</span>
          </div>
          <div className="ledger-prize-tag"><Gift size={20} /><span>O PRÊMIO<strong>Ledger Nano Gen5</strong></span></div>
        </section>

        <div className="ledger-metrics"><div><small>POR NÚMERO</small><strong>US$ 4<span>,00</span></strong></div><div><small>NÚMEROS NO TOTAL</small><strong>1.200</strong></div><div><small>SORTEIO</small><strong className="ledger-metric-text">{DRAW_DATE}</strong></div><div><small>ENTREGA DO PRÊMIO</small><strong className="ledger-metric-text">Frete incluso</strong></div></div>

        <p className="ledger-schedule-note">{DRAW_RULE} <span>{DRAW_TIME_NOTE}</span></p>
        <section className="ledger-selection" id="numeros" aria-labelledby="numbers-title">
          <div className="ledger-section-title"><div><span className="ledger-eyebrow">01 / ESCOLHA SEUS NÚMEROS</span><h2 id="numbers-title">Qual vai ser o seu?</h2><p>Escolha um favorito ou deixe a seleção por nossa conta.</p></div><span className="ledger-preview-badge">Prévia interativa · vendas fechadas</span></div>
          <div className="ledger-shopping-layout">
            <div className="ledger-number-panel">
              <div className="ledger-toolbar"><label className="ledger-search"><Search size={18} /><span className="sr-only">Buscar número de 0001 a 1200</span><input inputMode="numeric" value={search} maxLength={4} placeholder="Buscar número…" onChange={e => { setSearch(e.target.value.replace(/\D/g, "")); setPage(0); }} /></label><button className="ledger-secondary" onClick={surprise} disabled={selected.length === TOTAL}>Escolher 5 para mim</button></div>
              <div className="ledger-grid-meta"><div><span className="ledger-dot" /> Disponível na prévia <span className="ledger-dot ledger-dot-selected" /> Selecionado</div><label><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} /> Só meus números</label></div>
              <div className="ledger-number-grid" aria-label="Números da prévia">{visible.map(n => <button key={n} className={selected.includes(n) ? "is-selected" : ""} aria-label={`Número ${numberLabel(n)}`} aria-pressed={selected.includes(n)} onClick={() => toggle(n)}>{numberLabel(n)}</button>)}</div>
              {!visible.length && <p className="ledger-empty">{selectedOnly ? "Nenhum número selecionado com esse filtro." : "Nenhum número encontrado. Busque de 0001 a 1200."}</p>}
              {!search && !selectedOnly && <div className="ledger-pagination"><button aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={19} /></button><span>{numberLabel(page * PAGE_SIZE + 1)}–{numberLabel(Math.min((page + 1) * PAGE_SIZE, TOTAL))} <small>de 1.200</small></span><button aria-label="Próxima página" disabled={page === TOTAL / PAGE_SIZE - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={19} /></button></div>}
              <p className="ledger-local-note">Esta seleção é uma simulação no seu navegador. Nenhum número está reservado ou vendido.</p>
            </div>
            <aside className="ledger-summary" aria-label="Resumo da seleção">
              <span className="ledger-eyebrow">SUA ESCOLHA</span><h3>Um passo mais perto.</h3>
              <div className="ledger-summary-prize"><Gift size={25} /><div><strong>Ledger Nano Gen5</strong><small>Nova, lacrada e com frete incluso</small></div></div>
              <div className="ledger-summary-label"><span>Seus números <b>({selected.length})</b></span><button disabled={!selected.length} onClick={() => { setSelected([]);  }}>Limpar</button></div>
              <div className="ledger-chips">{selected.length ? [...selected].sort((a,b) => a-b).map(n => <button key={n} aria-label={`Remover número ${numberLabel(n)}`} onClick={() => toggle(n)}>{numberLabel(n)}<X size={12} /></button>) : <p>Seus números favoritos<br />aparecem aqui.</p>}</div>
              <div className="ledger-discount-offer">Compre 4 ou mais números e ganhe <strong>10% de desconto.</strong></div>
              <div className="ledger-price-breakdown" aria-live="polite"><div><span>Subtotal · {selected.length} × US$ 4,00</span><span>{usd(subtotalCents / 100)}</span></div><div className={discountCents ? "ledger-discount-active" : ""}><span>Desconto {discountCents > 0 ? "(10%)" : ""}</span><span>{discountCents > 0 ? `− ${usd(discountCents / 100)}` : usd(0)}</span></div></div>
              <div className="ledger-total-row"><span>Total</span><strong aria-live="polite">{usd(total)}</strong></div>
              <button className="ledger-primary" disabled={!selected.length} onClick={() => { saveSelection(selected); navigate("/checkout"); }}>Continuar <ArrowRight size={18} /></button>
              <div className="ledger-checkout-note"><ShieldCheck size={17} /><span>Cadastro e instruções de pagamento ficam na próxima etapa.</span></div>

            </aside>
          </div>
        </section>

        <section className="ledger-how" id="regras" aria-labelledby="how-title"><span className="ledger-eyebrow">02 / SEM COMPLICAÇÃO</span><h2 id="how-title">Da escolha à entrega.</h2><div className="ledger-steps">{[{n:"01",title:"Escolha seus números",text:"Serão 1.200 números, de 0001 a 1200, a US$ 4 cada."},{n:"02",title:"Confirme sua participação",text:"Na abertura, o cadastro e o pagamento confirmarão sua participação. Esta prévia não recebe valores."},{n:"03",title:"Acompanhe o resultado",text:DRAW_RULE}].map(step => <article key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
        <section className="ledger-faq" aria-labelledby="faq-title"><div><span className="ledger-eyebrow">ANTES DE PARTICIPAR</span><h2 id="faq-title">Tudo às claras.</h2><p>Os detalhes finais estarão disponíveis antes da abertura das vendas.</p></div><div>{[{q:"O prêmio é novo?",a:"Sim. O prêmio informado é uma Ledger Nano Gen5 nova e lacrada. A imagem de apresentação é ilustrativa; uma foto da caixa do prêmio será adicionada antes da abertura."},{q:"O sorteio depende de vender todos os números?",a:"Não. O sorteio será realizado até 20/12/2026 entre os números com pagamento confirmado, mesmo sem esgotar os 1.200. Sem participantes pagos, não haverá sorteio."},{q:"Quem paga o frete?",a:"O organizador assume o frete. A região de entrega e as condições para eventuais tributos serão definidas no regulamento antes das vendas."},{q:"Quando será e como posso pagar?",a:DRAW_RULE + " " + DRAW_TIME_NOTE + " O pagamento será em USDT na BNB Smart Chain (BEP-20). O método de apuração ainda será divulgado. As vendas continuam fechadas nesta prévia."},{q:"Preciso informar meu endereço agora?",a:"Não. A proposta é solicitar os dados de envio somente ao vencedor, por um canal privado. Nenhum endereço deve aparecer publicamente."}].map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
      </main>
      <footer className="ledger-footer"><a href="https://investidormatuto.com">INVESTIDOR MATUTO</a><span>Prévia da página · nenhuma venda aberta</span><span>Ledger é marca de seu respectivo titular. Esta ação não é apresentada como oficial da Ledger.</span></footer>
    </div>
  );
}



