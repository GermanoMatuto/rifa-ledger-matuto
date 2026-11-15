import { TRANSFER_TOPIC, verifyTransfer, type Rpc, type PaymentConfig } from "./payment.js";

type ChainLog = { transactionHash: string; blockNumber: string; blockHash: string; address: string; topics: string[]; data: string; removed?: boolean };
export type WatchedOrder = PaymentConfig & { createdAt: string; units: bigint; nextBlock: string | null };
export async function detectTransfers(logRpc: Rpc, verificationRpc: Rpc, order: WatchedOrder) {
  if (BigInt(await logRpc<string>("eth_chainId", [])) !== BigInt(order.chainId)) throw new Error("Monitor conectado à rede incorreta.");
  const finalized = await verificationRpc<{ number: string; timestamp: string }>("eth_getBlockByNumber", ["finalized", false]);
  const end = BigInt(finalized.number);
  let start: bigint;
  if (order.nextBlock !== null) start = BigInt(order.nextBlock);
  else {
    // Recover an old invoice's starting block without assuming a fixed block time.
    let low = end > 50000n ? end - 50000n : 0n, high = end;
    const created = Math.floor(Date.parse(order.createdAt) / 1000);
    while (low < high) {
      const middle = (low + high) / 2n;
      const block = await verificationRpc<{ timestamp: string }>("eth_getBlockByNumber", ["0x" + middle.toString(16), false]);
      if (Number(BigInt(block.timestamp)) < created) low = middle + 1n; else high = middle;
    }
    start = low > 0n ? low - 1n : 0n;
  }
  if (start > end) return { transfers: [], nextBlock: start.toString(), caughtUp: true };
  const stop = start + 999n < end ? start + 999n : end;
  const logs = await logRpc<ChainLog[]>("eth_getLogs", [{
    fromBlock: "0x" + start.toString(16), toBlock: "0x" + stop.toString(16), address: order.token,
    topics: [TRANSFER_TOPIC, null, "0x" + order.recipient.slice(2).toLowerCase().padStart(64, "0")],
  }]);
  if (!Array.isArray(logs) || logs.length > 1000) throw new Error("Não foi possível concluir esta consulta à rede.");
  const hashes = new Set<string>();
  for (const log of logs) {
    if (!log.removed && log.address.toLowerCase() === order.token.toLowerCase() && /^0x[0-9a-fA-F]{64}$/.test(log.data) && BigInt(log.data) === order.units) hashes.add(log.transactionHash);
  }
  if (hashes.size > 10) throw new Error("Vários depósitos compatíveis. A conferência precisa de análise.");
  const transfers = [];
  for (const hash of hashes) {
    // Never accept an indexer's event without independently verifying the receipt.
    try { transfers.push(await verifyTransfer(verificationRpc, hash, order, order.units, order.createdAt)); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes("anterior ao pedido")) throw error;
    }
  }
  return { transfers, nextBlock: (stop + 1n).toString(), caughtUp: stop === end };
}
