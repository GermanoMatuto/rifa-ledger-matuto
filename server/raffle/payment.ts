export function quote(numbers: unknown) {
  if (
    !Array.isArray(numbers) ||
    numbers.length < 1 ||
    numbers.length > 50 ||
    numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 1200) ||
    new Set(numbers).size !== numbers.length
  ) {
    throw new Error("Escolha de 1 a 50 números distintos, entre 0001 e 1200.");
  }
  const subtotalCents = numbers.length * 400;
  const discountRate = numbers.length >= 5 ? 15 : numbers.length >= 3 ? 10 : 0;
  const discountCents = Math.round(subtotalCents * discountRate / 100);
  return {
    numbers: [...numbers].sort((a, b) => a - b) as number[],
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const TXID = /^0x[0-9a-fA-F]{64}$/;
type Log = {
  address: string;
  topics: string[];
  data: string;
  logIndex: string;
  removed?: boolean;
};
type Receipt = {
  transactionHash: string;
  status: string;
  blockNumber: string;
  blockHash: string;
  logs: Log[];
};
export type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;
export type PaymentConfig = {
  chainId: number;
  token: string;
  recipient: string;
  decimals: number;
};

// Read only. Never signs transactions or needs a private key.
export async function verifyTransfer(
  rpc: Rpc,
  hash: string,
  config: PaymentConfig,
  expectedUnits: bigint,
  createdAt: string,
) {
  if (!TXID.test(hash)) throw new Error("Txid inválido.");
  const chain = await rpc<string>("eth_chainId", []);
  if (BigInt(chain) !== BigInt(config.chainId))
    throw new Error("RPC conectado à rede incorreta.");
  const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [
    hash,
  ]);
  if (!receipt)
    throw new Error("Transferência ainda não encontrada nesta rede.");
  if (
    receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
    receipt.status !== "0x1"
  )
    throw new Error("Transação sem sucesso.");
  const finalized = await rpc<{ number: string } | null>(
    "eth_getBlockByNumber",
    ["finalized", false],
  );
  if (!finalized || BigInt(receipt.blockNumber) > BigInt(finalized.number))
    throw new Error(
      "Aguardando finalização na rede. Tente verificar novamente depois.",
    );
  const block = await rpc<{ hash: string; timestamp: string } | null>(
    "eth_getBlockByNumber",
    [receipt.blockNumber, false],
  );
  if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase())
    throw new Error("Bloco não corresponde à cadeia atual.");
  const paidAt = Number(BigInt(block.timestamp)) * 1000;
  if (paidAt < Date.parse(createdAt))
    throw new Error("A transferência é anterior ao pedido.");
  const recipientTopic =
    "0x" + config.recipient.slice(2).toLowerCase().padStart(64, "0");
  const incoming = receipt.logs.filter(
    (log) =>
      !log.removed &&
      log.address.toLowerCase() === config.token.toLowerCase() &&
      log.topics.length === 3 &&
      log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
      log.topics[2].toLowerCase() === recipientTopic,
  );
  // Multiple transfers into the recipient require review outside this automatic verifier.
  if (incoming.length !== 1 || !/^0x[0-9a-fA-F]{64}$/.test(incoming[0].data))
    throw new Error(
      "Não há uma transferência única do token esperado para o destinatário.",
    );
  const log = incoming[0];
  const received = BigInt(log.data);
  if (received !== expectedUnits)
    throw new Error(
      "Valor recebido diferente do pedido. Não envie novamente; solicite suporte.",
    );
  return {
    txid: hash.toLowerCase(),
    logIndex: Number(BigInt(log.logIndex)),
    units: received.toString(),
    blockHash: receipt.blockHash,
    paidAt: new Date(paidAt).toISOString(),
    sender: "0x" + log.topics[1].slice(-40).toLowerCase(),
  };
}

