import type { Rpc } from "./payment.js";

export function makeRpc(endpoint: string): Rpc {
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Consulta à rede indisponível. Tente novamente.");
    const body = await response.json();
    if (body.error || !("result" in body)) throw new Error("Consulta à rede indisponível. Tente novamente.");
    return body.result;
  };
}
