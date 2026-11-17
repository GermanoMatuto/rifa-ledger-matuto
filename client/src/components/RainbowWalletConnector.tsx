import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, useAccount, useDisconnect } from "wagmi";
import { bsc } from "wagmi/chains";
import { RainbowKitProvider, connectorsForWallets, darkTheme, useConnectModal } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, trustWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import "@rainbow-me/rainbowkit/styles.css";
import type { WalletProvider } from "@/lib/wallet-payment";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const connectors = connectorsForWallets([{groupName:"Carteiras",wallets:[metaMaskWallet,trustWallet,rabbyWallet,walletConnectWallet]}],{appName:"Investidor Matuto — Checkout",projectId,appUrl:"https://rifa-ledger-matuto.vercel.app"});
const config = createConfig({chains:[bsc],connectors,transports:{[bsc.id]:http("https://bsc-dataseed.bnbchain.org")},storage:null});
const queryClient = new QueryClient();
type Props = { request: number; onReady: (provider: WalletProvider, address: string, disconnect: () => Promise<void>) => void; onLost: () => void; onError: (message: string) => void };
function Bridge({request,onReady,onLost,onError}:Props) {
 const {address,connector,isConnected}=useAccount();
 const {disconnectAsync}=useDisconnect();
 const {openConnectModal}=useConnectModal();
 const opened=useRef(0);
 useEffect(()=>{if(openConnectModal && request>opened.current){opened.current=request;openConnectModal();}},[request,openConnectModal]);
 useEffect(()=>{
  let active=true;
  if(!isConnected||!connector||!address){onLost();return;}
  void connector.getProvider().then(raw=>{
   if(!active)return;
   const provider=raw as WalletProvider;
   onReady({request:async(args)=>{
    if(!["eth_accounts","eth_requestAccounts","eth_chainId","wallet_switchEthereumChain","personal_sign","eth_sendTransaction"].includes(args.method))throw new Error("Solicitação não permitida.");
    try{return await provider.request(args);}catch(error){
     let cause:any=error;
     for(let i=0;cause && i<6;i++,cause=cause.cause)if(cause.code===4001||cause.code===5000||cause.name==="UserRejectedRequestError")throw Object.assign(new Error("Solicitação cancelada na carteira."),{code:4001});
     throw error;
    }
   }},address,async()=>{await disconnectAsync({connector});});
  }).catch(()=>{if(active)onError("Não foi possível conectar. Tente novamente ou pague sem conectar.");});
  return()=>{active=false;};
 },[address,connector,isConnected,disconnectAsync,onReady,onLost,onError]);
 return null;
}
export default function RainbowWalletConnector(props:Props){return <WagmiProvider config={config} reconnectOnMount={false}><QueryClientProvider client={queryClient}><RainbowKitProvider locale="pt-BR" initialChain={bsc} modalSize="compact" theme={darkTheme({accentColor:"#3979f2",borderRadius:"medium"})}><Bridge {...props}/></RainbowKitProvider></QueryClientProvider></WagmiProvider>;}
