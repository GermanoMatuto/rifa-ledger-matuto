import { describe, expect, it } from "vitest";
import { connectWallet, sendWalletPayment, signWalletLink, transferData, type WalletProvider } from "../../client/src/lib/wallet-payment";
const address = "0x" + "a".repeat(40);
const order = { id: "test", chain_id: 56, token_address: "0x55d398326f99059ff775485246999027b3197955", recipient: "0x6e578f4f5c137300fa256a01d2a36d2d109ee2a3", total_cents: 100, decimals: 18, expires_at: new Date(Date.now() + 600000).toISOString() };
describe("wallet authorization boundary", () => {
  it("requests connection, switch, a readable ownership signature and one exact transfer, never allowance", async () => {
    const calls: {method: string; params?: unknown[]}[] = []; let chain = "0x1";
    const provider: WalletProvider = { request: async request => {
      calls.push(request);
      if (request.method === "eth_requestAccounts" || request.method === "eth_accounts") return [address];
      if (request.method === "eth_chainId") return chain;
      if (request.method === "wallet_switchEthereumChain") { chain = "0x38"; return null; }
      if (request.method === "personal_sign") return "0x" + "b".repeat(130);
      if (request.method === "eth_sendTransaction") return "0x" + "c".repeat(64);
      throw new Error("Unexpected wallet request");
    } };
    expect(await connectWallet(provider,56)).toBe(address);
    await signWalletLink(provider,address,"Vincular pedido sem autorizar transferencias");
    await sendWalletPayment(provider,address,order);
    const transaction = calls.find(call=>call.method==="eth_sendTransaction")!.params![0] as Record<string,string>;
    expect(transaction.to).toBe(order.token_address);
    expect(transaction.value).toBe("0x0");
    expect(transaction.data).toBe("0xa9059cbb"+order.recipient.slice(2).padStart(64,"0")+(10n**18n).toString(16).padStart(64,"0"));
    expect(calls.filter(call=>call.method==="eth_sendTransaction")).toHaveLength(1);
    expect(calls.some(call=>/approve|permit|sendRaw/i.test(call.method))).toBe(false);
  });
  it("blocks token substitution and expired orders before opening a transfer", async () => {
    expect(()=>transferData({...order,token_address:address})).toThrow();
    const provider: WalletProvider = {request: async()=>{throw new Error("Must not request the wallet");}};
    await expect(sendWalletPayment(provider,address,{...order,expires_at:"invalid"})).rejects.toThrow("venceu");
  });
  it("blocks payment when the selected account or network changes", async () => {
    const changedAccount: WalletProvider = {request: async()=>["0x"+"d".repeat(40)]};
    await expect(sendWalletPayment(changedAccount,address,order)).rejects.toThrow("conta");
    const changedNetwork: WalletProvider = {request: async({method})=>method==="eth_accounts"?[address]:"0x1"};
    await expect(sendWalletPayment(changedNetwork,address,order)).rejects.toThrow("rede");
  });
});
