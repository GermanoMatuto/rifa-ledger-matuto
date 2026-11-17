import type { WalletProvider } from "./wallet-payment";
import type UniversalProvider from "@walletconnect/universal-provider";

export const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";
let instance: Promise<UniversalProvider> | undefined;
export async function getWalletConnect() {
  if (!/^[0-9a-f]{32}$/i.test(walletConnectProjectId)) throw new Error("WalletConnect ainda não está configurado. Você pode pagar sem conectar.");
  // Load and contact the relay only after the visitor explicitly chooses WalletConnect.
  instance ??= import("@walletconnect/universal-provider").then(({ default: Provider }) => Provider.init({
    projectId: walletConnectProjectId, telemetryEnabled: false,
    metadata: { name: "Investidor Matuto — Checkout", description: "Pagamento em USDT na BNB Smart Chain", url: "https://rifa.investidormatuto.com", icons: [] },
  })).catch(error => { instance = undefined; throw error; });
  return instance;
}

export function walletConnectAdapter(provider: UniversalProvider): WalletProvider {
  return { async request(args) {
    const namespace = provider.session?.namespaces.eip155;
    const accounts = namespace?.accounts.filter(item => item.startsWith("eip155:56:")).map(item => item.split(":")[2]) || [];
    if (!accounts.length || !namespace?.methods.includes("personal_sign") || !namespace.methods.includes("eth_sendTransaction")) throw new Error("Reconecte a carteira autorizando a BNB Smart Chain.");
    if (args.method === "eth_accounts" || args.method === "eth_requestAccounts") return accounts;
    // All requests are scoped to the explicitly approved chain, independently of the wallet's UI selection.
    if (args.method === "eth_chainId") return "0x38";
    if (args.method !== "personal_sign" && args.method !== "eth_sendTransaction") throw new Error("Solicitação não permitida neste checkout.");
    return provider.request(args, "eip155:56");
  } };
}

export const walletConnectNamespaces = { eip155: {
  chains: ["eip155:56"], methods: ["personal_sign", "eth_sendTransaction"], events: ["accountsChanged", "chainChanged"],
  rpcMap: { 56: "https://bsc-dataseed.bnbchain.org" },
} };
