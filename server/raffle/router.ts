import express from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { ADDRESS, quote, TXID, verifyTransfer } from "./payment.js";
import { makeRpc } from "./rpc.js";
import { detectTransfers } from "./detection.js";
import { verifyMessage } from "viem";
import { dispatchReceipts } from "./receipts.js";

type Order = {
  id: string;
  user_id: string | null;
  guest_session_hash: string | null;
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
  wallet_txid: string | null;
  wallet_address: string | null;
  wallet_challenge: string | null;
  wallet_challenge_address: string | null;
  wallet_challenge_expires_at: string | null;
  monitor_next_block: string | null;
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
  const orderFields = "id,numbers,status,total_cents,symbol,recipient,chain_id,token_address,decimals,created_at,expires_at,txid,buyer_phone,has_whatsapp,is_test,wallet_txid,wallet_address";
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
      detectionEnabled: ready && Boolean(env.RAFFLE_EVM_LOGS_RPC_URL && env.RAFFLE_EVM_RPC_URL),
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
  router.get("/admin/payments", wrap(async (req, res) => {
    // Guest sessions and the test-email allowlist never grant administrative access.
    const account = await user(req);
    const admins = (env.RAFFLE_ADMIN_EMAILS || "").split(",").map(email=>email.trim().toLowerCase()).filter(Boolean);
    if (!account.email || !admins.includes(String(account.email).toLowerCase())) throw new HttpError(403, "Este e-mail não tem acesso ao painel administrativo.");
    await limit("admin-read:" + account.id, 60, 60);
    const status = String(req.query.status || "all"), search = String(req.query.search || "").trim(), page = Number(req.query.page || 1);
    if (!["all","paid","review","reserved","expired"].includes(status) || search.length>100 || !Number.isInteger(page) || page<1 || page>2000) throw new HttpError(400, "Filtro inválido.");
    await rpcDb("raffle_expire", {});
    const [result,funnel] = await Promise.all([rpcDb("raffle_admin_payments", { p_search: search, p_status: status, p_include_tests: req.query.tests !== "false", p_offset: (page-1)*50 }),rpcDb('raffle_navigation_summary',{})]);
    res.json({ ...result, funnel, page, pageSize: 50, updatedAt: new Date().toISOString() });
  }));
  router.post('/events',wrap(async(req,res)=>{
    const event=String(req.body.event||''),device=String(req.body.device||'');
    if(!['landing','selection','checkout'].includes(event)||!['mobile','desktop'].includes(device))throw new HttpError(400,'Evento inválido.');
    await limit('navigation:'+clientIp(req),60,3600);
    await rpcDb('raffle_record_navigation',{p_event:event,p_device:device,p_phase:enabled?'sales':'preview'});
    res.json({ok:true});
  }));
  router.post("/internal/receipts", wrap(async (req,res)=>{
    const expected=env.RAFFLE_WORKER_SECRET||"",supplied=req.get("authorization")?.replace(/^Bearer /,"")||"";
    if(expected.length<32 || supplied.length!==expected.length || !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))throw new HttpError(401,"Acesso não autorizado.");
    const pending:Order[]=await request('/rest/v1/raffle_orders?status=in.(reserved,review)&wallet_txid=not.is.null&order=wallet_check_at.asc.nullsfirst,created_at.asc&limit=5&select=*');
    await Promise.allSettled(pending.map(async order=>{
      await request(`/rest/v1/raffle_orders?id=eq.${order.id}`,{method:"PATCH",body:JSON.stringify({wallet_check_at:new Date().toISOString()})});
      if(order.user_id)await reconcileWallet(order,{userId:order.user_id,filter:""});
      else if(order.guest_session_hash)await reconcileWallet(order,{hash:order.guest_session_hash,filter:""});
    }));
    res.json(await dispatchReceipts(env,rpcDb));
  }));
  router.get(
    "/inventory",
    wrap(async (_req, res) =>
      res.json({ ...await rpcDb("raffle_inventory_states", {}), updatedAt: new Date().toISOString() }),
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
    let watchBlock: string | undefined;
    if (env.RAFFLE_EVM_LOGS_RPC_URL && env.RAFFLE_EVM_RPC_URL) {
      try { watchBlock = BigInt(await makeRpc(env.RAFFLE_EVM_RPC_URL)<string>("eth_blockNumber", [])).toString(); } catch { /* Receipt validation remains available if indexing is down. */ }
    }
    const order = await rpcDb("raffle_create_guest_order", { p_hash: hashGuest(token), p_email: email, p_name: name, p_phone: phone, p_whatsapp: req.body.whatsapp, p_numbers: numbers, p_test: test });
    if (watchBlock) await rpcDb("raffle_advance_scan", { p_order: order.id, p_next: watchBlock });
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
  async function ownedOrder(req: express.Request) {
    const access = await owner(req);
    if (!UUID.test(String(req.params.id))) throw new HttpError(400, "Pedido inválido.");
    const rows: Order[] = await request(`/rest/v1/raffle_orders?id=eq.${req.params.id}&${access.filter}&select=*`);
    if (!rows[0]) throw new HttpError(404, "Pedido não encontrado.");
    return { access, order: rows[0] };
  }
  function openOrder(order: Order) {
    if (order.status !== "reserved" || Date.parse(order.expires_at) <= Date.now()) throw new HttpError(409, "Este pedido não está disponível para um novo pagamento. Atualize o acompanhamento.");
  }
  async function recordForOwner(order: Order, access: Awaited<ReturnType<typeof owner>>, transfer: Awaited<ReturnType<typeof verifyTransfer>>) {
    return rpcDb(access.hash ? "raffle_record_guest_transfer" : "raffle_record_transfer", { p_order: order.id, ...(access.hash ? { p_hash: access.hash } : { p_user: access.userId }), p_txid: transfer.txid, p_log: transfer.logIndex, p_block: transfer.blockHash, p_received: transfer.paidAt });
  }
  const unitsFor = (order: Order) => BigInt(order.total_cents) * 10n ** BigInt(order.decimals - 2);
  const configFor = (order: Order) => ({ chainId: Number(order.chain_id), token: order.token_address, recipient: order.recipient, decimals: order.decimals });
  async function reconcileWallet(order:Order,access:Awaited<ReturnType<typeof owner>>){
    if(!env.RAFFLE_EVM_RPC_URL || !order.wallet_txid)throw new Error("Verificação da rede indisponível.");
    const transfer=await verifyTransfer(makeRpc(env.RAFFLE_EVM_RPC_URL),order.wallet_txid,configFor(order),unitsFor(order),order.created_at);
    if(transfer.sender!==order.wallet_address?.toLowerCase())throw new Error("O remetente não corresponde à carteira vinculada. Solicite conferência; não envie novamente.");
    await recordForOwner(order,access,transfer);
    const confirmed=await rpcDb("raffle_confirm_wallet_payment",{p_order:order.id,p_txid:transfer.txid,p_sender:transfer.sender,p_log:transfer.logIndex,p_block:transfer.blockHash,p_received:transfer.paidAt,p_units:transfer.units});
    return{state:confirmed.state,txid:transfer.txid};
  }

  router.post("/orders/:id/wallet/challenge", wrap(async (req, res) => {
    const { access, order } = await ownedOrder(req); openOrder(order);
    await limit("wallet-challenge:" + (access.userId || access.hash), 10, 900);
    const address = String(req.body.address || "").toLowerCase();
    if (!ADDRESS.test(address)) throw new HttpError(400, "Endereço da carteira inválido.");
    if (order.wallet_txid) throw new HttpError(409, "Uma transação já foi enviada. Acompanhe o recebimento antes de pagar novamente.");
    const expires = new Date(Date.now() + 5 * 60000).toISOString();
    const message = [`Investidor Matuto: vincular carteira ao pedido`, `Site: ${origin}`, `Pedido: ${order.id}`, `Carteira: ${address}`, `Rede: ${order.chain_id}`, `Token: ${order.token_address}`, `Destinatario: ${order.recipient}`, `Valor em unidades do token: ${unitsFor(order)}`, `Nonce: ${randomBytes(32).toString("hex")}`, `Valido ate: ${expires}`, `Esta assinatura apenas comprova a titularidade da carteira para este pedido. Nao autoriza transferencias nem aprovacoes de tokens. O pagamento sera confirmado separadamente na carteira.`].join("\n");
    await request(`/rest/v1/raffle_orders?id=eq.${order.id}&${access.filter}`, { method: "PATCH", body: JSON.stringify({ wallet_challenge: message, wallet_challenge_address: address, wallet_challenge_expires_at: expires, wallet_address: null, wallet_verified_at: null }) });
    res.json({ message, expiresAt: expires });
  }));
  router.post("/orders/:id/wallet/verify", wrap(async (req, res) => {
    const { access, order } = await ownedOrder(req); openOrder(order);
    await limit("wallet-verify:" + (access.userId || access.hash), 10, 900);
    const signature = String(req.body.signature || "");
    if (!order.wallet_challenge || !order.wallet_challenge_address || !order.wallet_challenge_expires_at || Date.parse(order.wallet_challenge_expires_at) <= Date.now() || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new HttpError(400, "A assinatura está inválida ou expirou. Conecte novamente.");
    let valid = false;
    try { valid = await verifyMessage({ address: order.wallet_challenge_address as `0x${string}`, message: order.wallet_challenge, signature: signature as `0x${string}` }); } catch { /* Invalid signature. */ }
    if (!valid) throw new HttpError(401, "A assinatura não corresponde à carteira. Use o QR se sua carteira não for compatível.");
    await request(`/rest/v1/raffle_orders?id=eq.${order.id}&${access.filter}`, { method: "PATCH", body: JSON.stringify({ wallet_address: order.wallet_challenge_address, wallet_verified_at: new Date().toISOString(), wallet_challenge: null, wallet_challenge_expires_at: null }) });
    res.json({ address: order.wallet_challenge_address });
  }));
  router.post("/orders/:id/wallet/transaction", wrap(async (req, res) => {
    const { access, order } = await ownedOrder(req);
    await limit("wallet-tx:" + (access.userId || access.hash), 10, 900);
    const hash = String(req.body.txid || "").toLowerCase();
    if (!TXID.test(hash) || !order.wallet_address) throw new HttpError(400, "Confirme a carteira antes de informar a transação.");
    if (order.wallet_txid && order.wallet_txid !== hash) throw new HttpError(409, "Uma transação já foi informada. Solicite suporte antes de enviar outra.");
    await request(`/rest/v1/raffle_orders?id=eq.${order.id}&${access.filter}`, { method: "PATCH", body: JSON.stringify({ wallet_txid: hash }) });
    res.json({ txid: hash, message: "Transação capturada. Aguardando confirmação na rede." });
  }));
  router.post("/orders/:id/detect", wrap(async (req, res) => {
    const { access, order } = await ownedOrder(req);
    await limit("detect:" + order.id, 6, 60);
    if (order.status === "paid" || (order.txid && !order.wallet_txid)) { res.json({ state: order.status }); return; }
    if (!env.RAFFLE_EVM_RPC_URL) throw new HttpError(503, "Verificação da rede indisponível.");
    const rpc = makeRpc(env.RAFFLE_EVM_RPC_URL);
    if (order.wallet_txid) {
      try {
        const confirmed = await reconcileWallet(order,access);
        if(confirmed.state === "paid") await dispatchReceipts(env,rpcDb,order.id).catch(()=>{});
        res.json(confirmed);
      } catch (error) {
        res.json({ state: "pending", message: error instanceof Error ? error.message : "Aguardando confirmação na rede." });
      }
      return;
    }
    if (!env.RAFFLE_EVM_LOGS_RPC_URL) throw new HttpError(503, "Busca automática indisponível. Você ainda pode informar o txid.");
    if (order.status !== "reserved" || Date.parse(order.expires_at) <= Date.now()) { res.json({ state: "expired" }); return; }
    let detected;
    try { detected = await detectTransfers(makeRpc(env.RAFFLE_EVM_LOGS_RPC_URL), rpc, { ...configFor(order), createdAt: order.created_at, units: unitsFor(order), nextBlock: order.monitor_next_block }); }
    catch { throw new HttpError(503, "A busca automática está temporariamente indisponível. Você pode informar o txid sem reenviar o pagamento."); }
    let state = "waiting";
    for (const transfer of detected.transfers) {
      const result = await rpcDb("raffle_detect_payment", { p_order: order.id, p_txid: transfer.txid, p_log: transfer.logIndex, p_block: transfer.blockHash, p_received: transfer.paidAt, p_units: transfer.units });
      if (result.state === "candidate") state = "needs_txid";
      if (result.state === "ambiguous") state = "ambiguous";
    }
    await rpcDb("raffle_advance_scan", { p_order: order.id, p_next: detected.nextBlock });
    // Remember a discovered candidate while waiting for the external payer's txid.
    if (state === "waiting") {
      const candidates = await request(`/rest/v1/raffle_payment_events?chain_id=eq.${order.chain_id}&token_address=eq.${order.token_address}&recipient=eq.${order.recipient}&units=eq.${unitsFor(order)}&received_at=gte.${encodeURIComponent(order.created_at)}&select=txid&limit=1`);
      if (candidates.length) state = "needs_txid";
    }
    res.json({ state, caughtUp: detected.caughtUp });
  }));
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


