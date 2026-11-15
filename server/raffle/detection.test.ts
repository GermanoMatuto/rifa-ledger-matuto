import { expect, it } from "vitest";
import { detectTransfers } from "./detection";
import { TRANSFER_TOPIC, type Rpc } from "./payment";
const hash="0x"+"a".repeat(64),blockHash="0x"+"b".repeat(64),token="0x"+"c".repeat(40),recipient="0x"+"d".repeat(40);
const log={address:token,topics:[TRANSFER_TOPIC,"0x"+"0".repeat(64),"0x"+recipient.slice(2).padStart(64,"0")],data:"0x"+(10n**18n).toString(16).padStart(64,"0"),logIndex:"0x0",transactionHash:hash,blockNumber:"0x10",blockHash};
const order={chainId:56,token,recipient,decimals:18,units:10n**18n,createdAt:"2026-11-15T00:00:00Z",nextBlock:"16"};
const verify: Rpc = async<T>(method: string, params: unknown[]) => { const data: Record<string, unknown> = {eth_chainId:"0x38",eth_getTransactionReceipt:{transactionHash:hash,status:"0x1",blockNumber:"0x10",blockHash,logs:[log]},eth_getBlockByNumber:params[0]==="finalized"?{number:"0x20",timestamp:"0x6"}:{hash:blockHash,timestamp:"0x"+Math.floor(Date.parse("2026-11-15T00:01:00Z")/1000).toString(16)}};return data[method] as T; };
it("discovers logs but verifies the receipt on a separate RPC before returning a candidate",async()=>{
  const calls:string[]=[];const index: Rpc=async<T>(method: string,params: unknown[])=>{calls.push(method);if(method==="eth_chainId")return "0x38" as T;expect(params[0]).toMatchObject({address:token,fromBlock:"0x10",toBlock:"0x20"});return [log] as T;};
  const result=await detectTransfers(index,verify,order);expect(result.transfers[0].txid).toBe(hash);expect(result.nextBlock).toBe("33");expect(result.caughtUp).toBe(true);expect(calls).toEqual(["eth_chainId","eth_getLogs"]);
});
it("never advances the scan after an RPC failure or accepts the wrong chain",async()=>{
  const broken: Rpc=async()=>{throw Error("offline");};await expect(detectTransfers(broken,verify,order)).rejects.toThrow();
  const wrong: Rpc=async<T>()=>"0x1" as T;await expect(detectTransfers(wrong,verify,order)).rejects.toThrow("rede incorreta");
});
it("does not trust a fabricated indexer event without a valid receipt",async()=>{
  const index: Rpc=async<T>(method: string)=> (method==="eth_chainId"?"0x38":[log]) as T;
  const noReceipt: Rpc=async<T>(method: string,params: unknown[])=>method==="eth_getTransactionReceipt"?null as T:verify<T>(method,params);
  await expect(detectTransfers(index,noReceipt,order)).rejects.toThrow("não encontrada");
});

