import express from "express";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
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
  is_test: boolean;
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
  function clientIp(req: express.Request) {
    // Only Vercel's own deployment may trust this platform-overwritten header.
    const forwarded = env.VERCEL === "1" ? req.get("x-vercel-forwarded-for")?.trim() : undefined;
    return forwarded && isIP(forwarded) ? forwarded : req.ip || "unknown";
  }
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
      if (data?.message?.includes("TEST_NOT_ALLOWED"))
        throw new HttpError(403, "Este teste está disponível apenas para o organizador.");
      if (data?.message?.includes("GUEST_EMAIL_MISMATCH"))
        throw new HttpError(409, "Use o mesmo e-mail dos pedidos deste navegador ou saia para iniciar outro cadastro.");
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
  const guestCookieName = env.NODE_ENV === "production" ? "__Host-raffle-guest" : "raffle-guest";
  function guestToken(req: express.Request) {
    const value = req.headers.cookie?.split(";").map(c => c.trim()).find(c => c.startsWith(guestCookieName + "="))?.slice(guestCookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
  const hashGuest = (token: string) => createHash("sha256").update(token).digest("hex");
  const orderFields = "id,numbers,status,total_cents,symbol,recipient,chain_id,token_address,decimals,created_at,expires_at,txid,buyer_phone,has_whatsapp,is_test";
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
  async function owner(req: express.Request): Promise<{ userId: string; hash?: never; filter: string } | { hash: string; userId?: never; filter: string }> {
    if (cookie(req)) {
      try {
        const u = await user(req);
        return { userId: u.id, filter: `user_id=eq.${u.id}` };
      } catch (e) {
        if (!(e instanceof HttpError) || e.status !== 401) throw e;
      }
    }
    const token = guestToken(req);
    if (token) {
      const hash = hashGuest(token);
      const rows = await request(`/rest/v1/raffle_guests?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`);
      if (rows.length) return { hash, filter: `guest_session_hash=eq.${hash}` };
    }
    throw new HttpError(401, "Confirme seu e-mail para recuperar seus pedidos neste dispositivo.");
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
      testEnabled: ready && Boolean(env.RAFFLE_EVM_RPC_URL) && env.RAFFLE_TEST_ENABLED === "true",
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
      await limit("otp:" + clientIp(req), 5, 900);
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
      await limit("verify:" + clientIp(req), 10, 900);
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
      await rpcDb("raffle_claim_guest_orders", { p_user: data.user.id });
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
  router.post("/auth/logout", wrap(async (req, res) => {
    const guest = guestToken(req);
    if (guest) await request(`/rest/v1/raffle_guests?token_hash=eq.${hashGuest(guest)}`, { method: "PATCH", body: JSON.stringify({ expires_at: new Date().toISOString() }) });
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.clearCookie(guestCookieName, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict", path: "/" });
    res.json({ ok: true });
  }));
  router.get(
    "/inventory",
    wrap(async (_req, res) =>
      res.json({ unavailable: await rpcDb("raffle_inventory", {}) }),
    ),
  );
  router.get(
    "/orders",
    wrap(async (req, res) => {
      const access = await owner(req);
      await rpcDb("raffle_expire", {});
      const rows = await request(
        `/rest/v1/raffle_orders?${access.filter}&select=${orderFields}&order=created_at.desc&limit=20`,
      );
      res.json({ orders: rows });
    }),
  );
  router.post("/guest/orders", wrap(async (req, res) => {
    const test = req.body.test === true;
    if (test ? !(ready && env.RAFFLE_EVM_RPC_URL && env.RAFFLE_TEST_ENABLED === "true") : !enabled)
      throw new HttpError(409, test ? "O teste ainda não está disponível." : "As vendas ainda estão fechadas.");
    await limit("guest-orders-ip:" + clientIp(req), 10, 3600);
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 100 || !/^\+[1-9]\d{7,14}$/.test(phone) || typeof req.body.whatsapp !== "boolean" || req.body.contactConsent !== true)
      throw new HttpError(400, "Confira nome, e-mail e telefone com DDI.");
    await limit("guest-orders-email:" + email, 5, 3600);
    let authenticatedUser: string | undefined;
    if (cookie(req)) {
      try {
        const u = await user(req);
        if (String(u.email).toLowerCase() !== email) throw new HttpError(409, "Use o e-mail da sessão atual ou saia antes de trocar de comprador.");
        authenticatedUser = u.id;
      } catch (e) { if (!(e instanceof HttpError) || e.status !== 401) throw e; }
    }
    let numbers: number[] = [];
    if (!test) {
      try { numbers = quote(req.body.numbers).numbers; }
      catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Números inválidos."); }
    }
    let token = guestToken(req);
    if (token) {
      const existing = await request(`/rest/v1/raffle_guests?token_hash=eq.${hashGuest(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`);
      if (!existing.length) token = null;
    }
    token ||= randomBytes(32).toString("hex");
    const order = await rpcDb("raffle_create_guest_order", { p_hash: hashGuest(token), p_email: email, p_name: name, p_phone: phone, p_whatsapp: req.body.whatsapp, p_numbers: numbers, p_test: test });
    if (authenticatedUser) await rpcDb("raffle_claim_guest_orders", { p_user: authenticatedUser });
    res.cookie(guestCookieName, token, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 30 * 86400000 });
    const result = await request(`/rest/v1/raffle_orders?id=eq.${order.id}&select=${orderFields}`);
    res.status(201).json({ order: result[0] });
  }));
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
      const access = await owner(req);
      await limit("tx:" + (access.userId || access.hash), 15, 900);
      if (
        !UUID.test(String(req.params.id)) ||
        !TXID.test(String(req.body.txid || ""))
      )
        throw new HttpError(400, "Pedido ou txid inválido.");
      const rows: Order[] = await request(
        `/rest/v1/raffle_orders?id=eq.${req.params.id}&${access.filter}&select=*`,
      );
      const order = rows[0];
      if (!order) throw new HttpError(404, "Pedido não encontrado.");
      const hash = String(req.body.txid).toLowerCase();
      if (order.txid === hash) {
        const safeRows = await request(`/rest/v1/raffle_orders?id=eq.${order.id}&${access.filter}&select=${orderFields}`);
        res.json({ order: safeRows[0] });
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
      const updated = await rpcDb(access.hash ? "raffle_record_guest_transfer" : "raffle_record_transfer", {
        p_order: order.id,
        ...(access.hash ? { p_hash: access.hash } : { p_user: access.userId }),
        p_txid: transfer.txid,
        p_log: transfer.logIndex,
        p_block: transfer.blockHash,
        p_received: transfer.paidAt,
      });
      const safeRows = await request(`/rest/v1/raffle_orders?id=eq.${updated.id}&${access.filter}&select=${orderFields}`);
      res.json({
        order: safeRows[0],
        message:
          "Recebimento verificado. A vinculação ao comprador está em análise; os números ainda não foram liberados.",
      });
    }),
  );
  return router;
}


