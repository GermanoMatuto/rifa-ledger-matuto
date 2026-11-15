import { describe, it, expect, vi } from "vitest";
import { walletConnectAdapter, walletConnectNamespaces } from "../../client/src/lib/walletconnect";
import type UniversalProvider from "@walletconnect/universal-provider";

describe("WalletConnect chain and permission scope", () => {
  function fixture(accounts = ["eip155:56:0x1111111111111111111111111111111111111111"]) {
    const request = vi.fn().mockResolvedValue("signed");
    const provider = { session: { namespaces: { eip155: { accounts, methods: ["personal_sign", "eth_sendTransaction"] } } }, request };
    return { provider, request, adapter: walletConnectAdapter(provider as unknown as UniversalProvider) };
  }
  it("only exposes approved BNB accounts and scopes financial requests to chain 56", async () => {
    const { adapter, request } = fixture(["eip155:1:0x2222222222222222222222222222222222222222", "eip155:56:0x1111111111111111111111111111111111111111"]);
    expect(await adapter.request({ method: "eth_accounts" })).toEqual(["0x1111111111111111111111111111111111111111"]);
    expect(await adapter.request({ method: "eth_chainId" })).toBe("0x38");
    expect(request).not.toHaveBeenCalled();
    const call = { method: "eth_sendTransaction", params: [{ data: "0xa9059cbb" }] };
    await adapter.request(call);
    expect(request).toHaveBeenCalledWith(call, "eip155:56");
    await expect(adapter.request({ method: "eth_signTypedData_v4" })).rejects.toThrow("não permitida");
    expect(walletConnectNamespaces.eip155.methods).toEqual(["personal_sign", "eth_sendTransaction"]);
  });
  it("rejects disconnected, wrong-chain and reduced-permission sessions", async () => {
    const wrongChain = fixture(["eip155:1:0x1111111111111111111111111111111111111111"]);
    await expect(wrongChain.adapter.request({ method: "eth_accounts" })).rejects.toThrow("Reconecte");
    const reduced = fixture(); reduced.provider.session.namespaces.eip155.methods = ["personal_sign"];
    await expect(reduced.adapter.request({ method: "eth_sendTransaction" })).rejects.toThrow("Reconecte");
    expect(reduced.request).not.toHaveBeenCalled();
  });
});
