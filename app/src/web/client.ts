import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { chain, PUBLIC_RPCS } from "../lib/chain";

// Browser-side, read-only. JSON-RPC batching keeps each poll to one or two HTTP requests.
export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: fallback(PUBLIC_RPCS.map((url) => http(url, { batch: { wait: 16 }, timeout: 12_000, retryCount: 1 }))),
  pollingInterval: 2_000,
});
