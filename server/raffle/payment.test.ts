import { describe, expect, it } from "vitest";
import { quote, verifyTransfer, TRANSFER_TOPIC, type Rpc } from "./payment";
const hash = "0x" + "a".repeat(64),
  token = "0x" + "b".repeat(40),
  recipient = "0x" + "c".repeat(40),
  blockHash = "0x" + "d".repeat(64);
const config = { chainId: 8453, token, recipient, decimals: 6 };
function mock(overrides: Record<string, unknown> = {}): Rpc {
  return async <T>(method: string, params: unknown[]) => {
    const data: Record<string, unknown> = {
      eth_chainId: "0x2105",
      eth_getTransactionReceipt: {
        transactionHash: hash,
        status: "0x1",
        blockNumber: "0x10",
        blockHash,
        logs: [
          {
            address: token,
            topics: [
              TRANSFER_TOPIC,
              "0x" + "0".repeat(64),
              "0x" + recipient.slice(2).padStart(64, "0"),
            ],
            data: "0x" + 14400000n.toString(16).padStart(64, "0"),
            logIndex: "0x0",
          },
        ],
      },
      eth_getBlockByNumber:
        params[0] === "finalized"
          ? { number: "0x20" }
          : {
              hash: blockHash,
              timestamp:
                "0x" +
                Math.floor(Date.parse("2026-11-14T15:00:00Z") / 1000).toString(
                  16,
                ),
            },
    };
    return (method in overrides ? overrides[method] : data[method]) as T;
  };
}
describe("server payment boundary", () => {
  it("computes discount server-side and rejects duplicates", () => {
    expect(quote([1, 2]).totalCents).toBe(800);
    expect(quote([1, 2, 3]).totalCents).toBe(1080);
    expect(quote([1, 2, 3, 4, 5]).totalCents).toBe(1700);
    expect(quote([1, 2, 3, 4, 5, 6]).totalCents).toBe(2040);
    expect(quote([1, 2, 3, 4]).totalCents).toBe(1440);
    expect(() => quote([1, 1])).toThrow();
    expect(() => quote([1201])).toThrow();
    expect(() => quote(["1"])).toThrow();
  });
  it("checks finalized exact token transfer", async () => {
    expect(
      (
        await verifyTransfer(
          mock(),
          hash,
          config,
          14400000n,
          "2026-11-14T14:00:00Z",
        )
      ).units,
    ).toBe("14400000");
  });
  it("rejects wrong network", async () => {
    await expect(
      verifyTransfer(
        mock({ eth_chainId: "0x1" }),
        hash,
        config,
        14400000n,
        "2026-11-14",
      ),
    ).rejects.toThrow("rede incorreta");
  });
  it("rejects pending transfer", async () => {
    await expect(
      verifyTransfer(
        mock({ eth_getTransactionReceipt: null }),
        hash,
        config,
        14400000n,
        "2026-11-14",
      ),
    ).rejects.toThrow("não encontrada");
  });
  it("rejects unfinalized transfer", async () => {
    await expect(
      verifyTransfer(
        mock({ eth_getBlockByNumber: { number: "0x1" } }),
        hash,
        config,
        14400000n,
        "2026-11-14",
      ),
    ).rejects.toThrow("finalização");
  });
  it("rejects amount mismatch and old transfers", async () => {
    await expect(
      verifyTransfer(mock(), hash, config, 14000000n, "2026-11-14"),
    ).rejects.toThrow("Valor recebido");
    await expect(
      verifyTransfer(mock(), hash, config, 14400000n, "2026-11-14T16:00:00Z"),
    ).rejects.toThrow("anterior");
  });
  it("rejects wrong recipient or token", async () => {
    await expect(
      verifyTransfer(
        mock(),
        hash,
        { ...config, recipient: token },
        14400000n,
        "2026-11-14",
      ),
    ).rejects.toThrow("token esperado");
    await expect(
      verifyTransfer(
        mock(),
        hash,
        { ...config, token: recipient },
        14400000n,
        "2026-11-14",
      ),
    ).rejects.toThrow("token esperado");
  });
});

it('validates BNB USDT using 18 decimals without floating point', async () => {
  const units = BigInt('14400000000000000000');
  const rpc = mock({
    eth_chainId: '0x38',
    eth_getTransactionReceipt: {
      transactionHash: hash, status: '0x1', blockNumber: '0x10', blockHash,
      logs: [{ address: token, topics: [TRANSFER_TOPIC, '0x'+'0'.repeat(64), '0x'+recipient.slice(2).padStart(64,'0')], data: '0x'+units.toString(16).padStart(64,'0'), logIndex:'0x0' }]
    }
  });
  expect((await verifyTransfer(rpc, hash, {...config, chainId:56, decimals:18}, units, '2026-11-14T14:00:00Z')).units).toBe('14400000000000000000');
});

