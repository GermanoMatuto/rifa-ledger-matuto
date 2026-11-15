export type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
export type PaymentRequest = { id: string; recipient: string; token_address: string; chain_id: number; decimals: number; total_cents: number; expires_at: string };
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export function transferData(order: PaymentRequest) {
  if (!addressPattern.test(order.recipient) || !addressPattern.test(order.token_address) || Number(order.chain_id) !== 56 || order.token_address.toLowerCase() !== "0x55d398326f99059ff775485246999027b3197955" || order.decimals !== 18 || !Number.isSafeInteger(order.total_cents) || order.total_cents <= 0) throw new Error("Dados de pagamento inválidos. Atualize o pedido.");
  const units = BigInt(order.total_cents) * 10n ** BigInt(order.decimals - 2);
  return "0xa9059cbb" + order.recipient.slice(2).toLowerCase().padStart(64, "0") + units.toString(16).padStart(64, "0");
}
export async function connectWallet(provider: WalletProvider, chainId: number) {
  if (Number(chainId) !== 56) throw new Error("Rede de pagamento inválida.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !addressPattern.test(accounts[0])) throw new Error("Nenhuma conta foi selecionada na carteira.");
  const current = await provider.request({ method: "eth_chainId" });
  if (BigInt(String(current)) !== 56n) await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  if (BigInt(String(await provider.request({ method: "eth_chainId" }))) !== 56n) throw new Error("Selecione BNB Smart Chain na carteira.");
  return String(accounts[0]);
}
export async function signWalletLink(provider: WalletProvider, address: string, message: string) {
  const hex = "0x" + Array.from(new TextEncoder().encode(message), byte => byte.toString(16).padStart(2, "0")).join("");
  const signature = await provider.request({ method: "personal_sign", params: [hex, address] });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Assinatura não suportada. Você pode pagar sem conectar, pelo QR.");
  return signature;
}
export async function sendWalletPayment(provider: WalletProvider, address: string, order: PaymentRequest, beforeBroadcast?: () => void) {
  if (!Number.isFinite(Date.parse(order.expires_at)) || Date.parse(order.expires_at) <= Date.now()) throw new Error("O prazo deste pedido venceu. Não envie valores.");
  const data = transferData(order);
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== address.toLowerCase()) throw new Error("A conta da carteira mudou. Conecte novamente.");
  if (BigInt(String(await provider.request({ method: "eth_chainId" }))) !== BigInt(order.chain_id)) throw new Error("A rede mudou. Selecione BNB Smart Chain e tente novamente.");
  // Only a direct ERC-20 transfer. No approve, permit, subscriptions or unlimited allowance.
  beforeBroadcast?.();
  const txid = await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to: order.token_address, data, value: "0x0" }] });
  if (typeof txid !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txid)) throw new Error("A carteira não retornou o txid. Confira o histórico antes de tentar pagar novamente.");
  return txid;
}
