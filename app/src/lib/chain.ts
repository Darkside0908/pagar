import { defineChain, type Chain } from "viem";
import { bscTestnet, foundry } from "viem/chains";
import { deployment } from "./deployment";

export const chain: Chain =
  deployment.chainId === bscTestnet.id
    ? bscTestnet
    : deployment.chainId === foundry.id
      ? foundry
      : defineChain({
          id: deployment.chainId,
          name: `Chain ${deployment.chainId}`,
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
        });

// Read-only public RPCs for the browser. Paid/dedicated RPC keys stay server-side (PRD §4.8).
export const PUBLIC_RPCS: string[] =
  deployment.chainId === bscTestnet.id
    ? ["https://bsc-testnet-rpc.publicnode.com", "https://data-seed-prebsc-1-s1.bnbchain.org:8545"]
    : ["http://127.0.0.1:8545"];

// BSC blocks are < 1 s (0.45 s since Fermi): 20k blocks ≈ 2.5 h of history (PRD §7).
export const LOG_LOOKBACK_BLOCKS = 20_000n;
export const LOG_CHUNK = 5_000n;
