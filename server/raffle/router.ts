import express from "express";
import { createHmac } from "node:crypto";
import { ADDRESS, quote, TXID, verifyTransfer } from "./payment.js";

type Order = {
  id: string;
  user_id: string;
  buyer_name: string;
  buyer_phone: string;
  has_whatsapp: boolean;
  status: string;
  numbers: number[];
  total_cents: number;
  expected_units: string;
  chain_id: number;
  token_address: string;
  recipient: string;
  symbol: string;
  decimals: number;
  created_at: string;
  expires_at: string;
  txid: string | null;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createRaffleRouter(env: NodeJS.ProcessEnv = process.env) {
  const router = express.Router();
  const url = env.RAFFLE_SUPABASE_URL;
  const anon = env.RAFFLE_SUPABASE_ANON_KEY;
  const secret = env.RAFFLE_SUPABASE_SERVICE_KEY;
  const origin = env.RAFFLE_SITE_ORIGIN;
  const ready = Boolean(
    url && anon && secret && origin && env.RAFFLE_RATE_SECRET,
  );
  const enabled = ready && Boolean(env.RAFFLE_EVM_RPC_URL) && env.RAFFLE_SALES_ENABLED === "true";
  async function request(path: string, init: RequestInit = {}, admin = true) {
    if (!ready)
      throw new HttpError(
        503,
        "Cadastro e pagamento ainda não estão configurados.",
      );
    const response = await fetch(`${url}${path}`, {
      ...init,
      signal: AbortSignal.timeout(12000),
      headers: {
        apikey: admin ? secret! : anon!,
        ...(admin ? { Authorization: `Bearer ${secret}` } : {}),
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (data?.message?.includes("NUMBERS_UNAVAILABLE"))
        throw new HttpError(
          409,
          "Algum número já foi reservado. Atualize a seleção.",
        );
      if (data?.message?.includes("TOO_MANY_PENDING"))
        throw new HttpError(
          409,
          "Você já tem pedidos pendentes. Confira seus pedidos.",
        );
      if (data?.message?.includes("SALES_CLOSED"))
        throw new HttpError(409, "As vendas estão fechadas.");
      if (data?.code === "23505")
        throw new HttpError(
          409,
          "Esta transferência já foi apresentada. Entre em contato com o suporte se ela for sua.",
        );
      throw new HttpError(
        502,
        "Não foi possível concluir a operação. Tente novamente ou solicite suporte.",
      );
    }
    return data;
  }
  const rpcDb = (name: string, body: object) =>
    request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  const cookieName =
    env.NODE_ENV === "production" ? "__Host-raffle-session" : "raffle-session";
  function cookie(req: express.Request) {
    return req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
  }
  async function user(req: express.Request) {
    const token = cookie(req);
    if (!token || token.length > 8000)
      throw new HttpError(401, "Entre com seu e-mail para continuar.");
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon!, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
    const u = await response.json();
    if (!UUID.test(u.id) || !u.email_confirmed_at)
      throw new HttpError(401, "Confirme seu e-mail.");
    return u;
  }
  async function limit(key: string, max: number, seconds: number) {
    const hashed = createHmac("sha256", env.RAFFLE_RATE_SECRET!)
      .update(key)
      .digest("hex");
    if (
      !(await rpcDb("raffle_rate_limit", {
        p_key: hashed,
        p_limit: max,
        p_seconds: seconds,
      }))
    )
      throw new HttpError(
        429,
        "Muitas tentativas. Aguarde antes de tentar novamente.",
      );
  }
  const wrap =
    (
      fn: (req: express.Request, res: express.Response) => Promise<unknown>,
    ): express.RequestHandler =>
    (req, res) => {
      Promise.resolve(fn(req, res)).catch((e) =>
        res
          .status(e instanceof HttpError ? e.status : 503)
          .json({
            error:
              e instanceof HttpError
                ? e.message
                : "Serviço temporariamente indisponível. Nenhuma confirmação foi concluída.",
          }),
      );
    };
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && (!origin || req.get("origin") !== origin)) {
      res.status(403).json({ error: "Origem não autorizada." });
      return;
    }
    next();
  });
  router.get("/config", (_req, res) =>
    res.json({
      configured: ready,
      salesEnabled: enabled,
      contactPolicy:
        "O telefone é privado e usado para acompanhar o pedido e entregar o prêmio. WhatsApp não é verificado automaticamente.",
    }),
  );
  router.use((_req, res, next) => {
    if (!ready) {
      res
        .status(503)
        .json({ error: "Cadastro e pagamento ainda não estão configurados." });
      return;
    }
    next();
  });

  router.use(express.json({ limit: "8kb" }));
  router.post(
    "/auth/code",
    wrap(async (req, res) => {
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new HttpError(400, "Informe um e-mail válido.");
      await limit("otp:" + req.ip, 5, 900);
      await limit("email:" + email, 3, 900);
      await request(
        "/auth/v1/otp",
        { method: "POST", body: JSON.stringify({ email, create_user: true }) },
        false,
      );
      res.json({
        message:
          "Se o envio for permitido, você receberá um código. Confira também o spam.",
      });
    }),
  );
  router.post(
    "/auth/verify",
    wrap(async (req, res) => {
      await limit("verify:" + req.ip, 10, 900);
      const email = String(req.body.email || "")
          .trim()
          .toLowerCase(),
        token = String(req.body.code || "");
      if (email.length > 254 || !/^\d{6,8}$/.test(token))
        throw new HttpError(400, "Confira o e-mail e o código.");
      const data = await request(
        "/auth/v1/verify",
        {
          method: "POST",
          body: JSON.stringify({ email, token, type: "email" }),
        },
        false,
      );
      if (!data.access_token || !data.user?.email_confirmed_at)
        throw new HttpError(401, "Código inválido ou expirado.");
      res.cookie(cookieName, data.access_token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: Math.min(data.expires_in || 3600, 3600) * 1000,
      });
      res.json({ email: data.user.email });
    }),
  );
  router.post("/auth/logout", (_req, res) => {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  router.get(
    "/inventory",
    wrap(async (_req, res) =>
      res.json({ unavailable: await rpcDb("raffle_inventory", {}) }),
    ),
  );
  router.get(
    "/orders",
    wrap(async (req, res) => {
      const u = await user(req);
      const rows = await request(
        `/rest/v1/raffle_orders?user_id=eq.${u.id}&select=id,numbers,status,total_cents,symbol,recipient,chain_id,token_address,decimals,created_at,expires_at,txid,buyer_phone,has_whatsapp&order=created_at.desc&limit=20`,
      );
      res.json({ orders: rows });
    }),
  );
  router.post(
    "/orders",
    wrap(async (req, res) => {
      if (!enabled) throw new HttpError(409, "As vendas ainda estão fechadas.");
      const u = await user(req);
      await limit("orders:" + u.id, 5, 3600);
      let q;
      try {
        q = quote(req.body.numbers);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Números inválidos.",
        );
      }
      const name = String(req.body.name || "").trim();
      const phone = String(req.body.phone || "").trim();
      if (
        name.length < 2 ||
        name.length > 100 ||
        !/^\+[1-9]\d{7,14}$/.test(phone) ||
        typeof req.body.whatsapp !== "boolean" ||
        req.body.contactConsent !== true
      )
        throw new HttpError(
          400,
          "Preencha nome, telefone com DDI e a ciência sobre o uso do contato.",
        );
      const order = await rpcDb("raffle_create_order", {
        p_user: u.id,
        p_name: name,
        p_phone: phone,
        p_whatsapp: req.body.whatsapp,
        p_numbers: q.numbers,
      });
      res.status(201).json({ order });
    }),
  );
  router.post(
    "/orders/:id/transfer",
    wrap(async (req, res) => {
      const u = await user(req);
      await limit("tx:" + u.id, 15, 900);
      if (
        !UUID.test(String(req.params.id)) ||
        !TXID.test(String(req.body.txid || ""))
      )
        throw new HttpError(400, "Pedido ou txid inválido.");
      const rows: Order[] = await request(
        `/rest/v1/raffle_orders?id=eq.${req.params.id}&user_id=eq.${u.id}&select=*`,
      );
      const order = rows[0];
      if (!order) throw new HttpError(404, "Pedido não encontrado.");
      const hash = String(req.body.txid).toLowerCase();
      if (order.txid === hash) {
        res.json({ order });
        return;
      }
      if (order.txid)
        throw new HttpError(
          409,
          "O pedido já tem uma transferência em análise.",
        );
      const endpoint = env.RAFFLE_EVM_RPC_URL;
      if (
        !endpoint ||
        !ADDRESS.test(order.token_address) ||
        !ADDRESS.test(order.recipient)
      )
        throw new HttpError(503, "Verificação da rede ainda não configurada.");
      const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error("RPC indisponível");
        const body = await r.json();
        if (body.error || !("result" in body))
          throw new Error("RPC indisponível");
        return body.result;
      };
      let transfer;
      try {
        transfer = await verifyTransfer(
          rpc,
          hash,
          {
            chainId: order.chain_id,
            token: order.token_address,
            recipient: order.recipient,
            decimals: order.decimals,
          },
          BigInt(order.total_cents) * BigInt("1" + "0".repeat(order.decimals - 2)),
          order.created_at,
        );
      } catch (e) {
        throw new HttpError(
          422,
          e instanceof Error ? e.message : "Não foi possível verificar.",
        );
      }
      const updated = await rpcDb("raffle_record_transfer", {
        p_order: order.id,
        p_user: u.id,
        p_txid: transfer.txid,
        p_log: transfer.logIndex,
        p_block: transfer.blockHash,
        p_received: transfer.paidAt,
      });
      res.json({
        order: updated,
        message:
          "Recebimento verificado. A vinculação ao comprador está em análise; os números ainda não foram liberados.",
      });
    }),
  );
  return router;
}



