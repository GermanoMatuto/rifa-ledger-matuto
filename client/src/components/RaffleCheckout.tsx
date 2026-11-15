import { useEffect, useState } from "react";
type Order = {
  id: string;
  numbers: number[];
  status: string;
  total_cents: number;
  symbol: string;
  recipient: string;
  chain_id: number;
  token_address: string;
  expires_at: string;
  txid: string | null;
};
const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
const statuses: Record<string, string> = {
  reserved: "Aguardando transferência",
  expired: "Reserva vencida — não envie valores",
  review: "Recebimento em análise de titularidade",
  paid: "Participação confirmada",
};
async function api(path: string, body?: object) {
  const r = await fetch(`/api/raffle${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const data = await r
    .json()
    .catch(() => ({ error: "Serviço ainda não disponível." }));
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
export default function RaffleCheckout({ numbers }: { numbers: number[] }) {
  const [configured, setConfigured] = useState(false),
    [sales, setSales] = useState(false),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [logged, setLogged] = useState(false);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [whatsapp, setWhatsapp] = useState(true),
    [consent, setConsent] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [txids, setTxids] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    api("/config")
      .then((data) => {
        if (mounted) {
          setConfigured(data.configured);
          setSales(data.salesEnabled);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  async function loadOrders() {
    const data = await api("/orders");
    setOrders(data.orders);
    setLogged(true);
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha temporária.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ledger-checkout" aria-label="Cadastro e pedidos">
      <h4>Cadastro e acompanhamento</h4>
      {!configured ? (
        <>
          <p>
            Cadastro e recebimento ainda não configurados. Não envie valores.
            Sua seleção continua sendo uma simulação.
          </p>
          <fieldset disabled className="ledger-contact-preview">
            <legend>Prévia do cadastro</legend>
            <label>
              Nome completo
              <input autoComplete="off" placeholder="Seu nome" />
            </label>
            <label>
              E-mail para entrar na conta
              <input
                type="email"
                autoComplete="off"
                placeholder="seu@email.com"
              />
            </label>
            <label>
              Telefone com DDI
              <input
                type="tel"
                autoComplete="off"
                placeholder="+5511999999999"
              />
            </label>
            <label className="ledger-check-label">
              <input type="checkbox" defaultChecked />
              Este número tem WhatsApp
            </label>
            <p>
              Contato privado para acompanhar seu pedido e combinar a entrega se
              você ganhar. Endereço de envio será solicitado somente ao
              vencedor.
            </p>
          </fieldset>
        </>
      ) : (
        <>
          {!logged ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!sent) {
                    const data = await api("/auth/code", { email });
                    setSent(true);
                    setMessage(data.message);
                  } else {
                    await api("/auth/verify", { email, code });
                    await loadOrders();
                    setMessage("E-mail confirmado.");
                  }
                });
              }}
            >
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  disabled={busy || sent}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {sent && (
                <label>
                  Código recebido por e-mail
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,8}"
                    minLength={6}
                    maxLength={8}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              )}
              <button className="ledger-secondary" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : sent
                    ? "Confirmar código"
                    : "Receber código"}
              </button>
              {sent && (
                <button
                  type="button"
                  className="ledger-secondary"
                  disabled={busy}
                  onClick={() => {
                    setSent(false);
                    setCode("");
                  }}
                >
                  Alterar e-mail
                </button>
              )}
              <button
                type="button"
                className="ledger-secondary"
                disabled={busy}
                onClick={() => void run(loadOrders)}
              >
                Já entrei — ver pedidos
              </button>
            </form>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const data = await api("/orders", {
                      name,
                      phone,
                      whatsapp,
                      contactConsent: consent,
                      numbers,
                    });
                    await loadOrders();
                    setMessage(
                      `Pedido ${data.order.id} criado. Confira a moeda, a rede e o valor antes de enviar.`,
                    );
                  });
                }}
              >
                <label>
                  Nome completo
                  <input
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Telefone com DDI
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+5511999999999"
                    pattern="\+[1-9][0-9]{7,14}"
                    required
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/[^+\d]/g, ""))
                    }
                  />
                </label>
                <label className="ledger-check-label">
                  <input
                    type="checkbox"
                    checked={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.checked)}
                  />
                  Este número tem WhatsApp
                </label>
                <p>
                  Usaremos seu contato para acompanhar o pedido e combinar a
                  entrega caso você ganhe. O número não será público. Não
                  enviamos publicidade com este cadastro.
                </p>
                <label className="ledger-check-label">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Estou ciente desse uso do meu contato.
                </label>
                <button
                  className="ledger-primary"
                  disabled={busy || !sales || !numbers.length}
                >
                  Criar pedido e reservar números
                </button>
                {!sales && <p>As vendas estão fechadas.</p>}
              </form>
              <button
                className="ledger-secondary"
                disabled={busy}
                onClick={() => void run(loadOrders)}
              >
                Atualizar meus pedidos
              </button>
              <button
                className="ledger-secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/auth/logout", {});
                    setLogged(false);
                    setOrders([]);
                    setCode("");
                    setSent(false);
                  })
                }
              >
                Sair
              </button>
            </>
          )}
          {orders.map((order) => (
            <article className="ledger-order" key={order.id}>
              <strong>{statuses[order.status] || "Em acompanhamento"}</strong>
              <p>Pedido {order.id}</p>
              <p>
                Números:{" "}
                {order.numbers
                  .map((n) => String(n).padStart(4, "0"))
                  .join(", ")}
              </p>
              <p>
                Total:{" "}
                <strong>
                  {money(order.total_cents)} em {order.symbol}
                </strong>
              </p>
              {order.status === "reserved" && (
                <>
                  <p>
                    Rede: <strong>{order.chain_id === 56 ? "BNB Smart Chain (BEP-20) · ID 56" : `EVM · ID ${order.chain_id}`}</strong>
                    <br />
                    Contrato do token: <code>{order.token_address}</code>
                  </p>
                  <label>
                    Endereço de recebimento
                    <input
                      readOnly
                      value={order.recipient}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <p>
                    Reserva até{" "}
                    {new Date(order.expires_at).toLocaleString("pt-BR")}. A taxa
                    de saque é separada: o valor líquido recebido deve
                    corresponder ao pedido. Se a exchange atrasar ou não aceitar
                    o valor, solicite suporte antes de enviar.
                  </p>
                </>
              )}
              {order.txid ? (
                <p>
                  Txid: <code>{order.txid}</code>
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const data = await api(`/orders/${order.id}/transfer`, {
                        txid: txids[order.id],
                      });
                      await loadOrders();
                      setMessage(data.message);
                    });
                  }}
                >
                  <label>
                    Txid da transferência
                    <input
                      required
                      pattern="0x[0-9a-fA-F]{64}"
                      maxLength={66}
                      value={txids[order.id] || ""}
                      onChange={(e) =>
                        setTxids((current) => ({
                          ...current,
                          [order.id]: e.target.value.trim(),
                        }))
                      }
                    />
                  </label>
                  <button className="ledger-secondary" disabled={busy}>
                    Verificar recebimento
                  </button>
                </form>
              )}
              <p>
                A confirmação da transferência não comprova a titularidade. Sua
                participação só está confirmada quando o status indicar
                “Participação confirmada”. Guarde o registro do saque da
                exchange.
              </p>
            </article>
          ))}
        </>
      )}
      {message && (
        <p role="status" className="ledger-checkout-message">
          {message}
        </p>
      )}
    </section>
  );
}

