import { createPublicClient, createWalletClient, http, type Hex, type PublicClient, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "../src/lib/chain";

/** Pages Functions bindings. Secrets live in .dev.vars / Pages secrets only — never in the browser bundle. */
export interface Env {
  RPC_URL?: string;
  AGENT_PK?: string;
  DEMO_KEY?: string;
  AGENT_DRY_RUN?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_TEMPERATURE?: string;
}

export type AgentCtx = {
  env: Env;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Account;
  dryRun: boolean;
};

// Clients + account are memoized per isolate: the first secp256k1 key derivation costs ~45 ms of CPU
// (curve precompute), later ones ~2 ms — this keeps warm requests far under the Workers CPU limit.
let memo: { key: string; clients: Omit<AgentCtx, "env" | "dryRun"> } | undefined;

export function makeCtx(env: Env): AgentCtx {
  const key = `${env.RPC_URL ?? ""}|${env.AGENT_PK ?? ""}`;
  if (memo?.key !== key) {
    const transport = http(env.RPC_URL || chain.rpcUrls.default.http[0], { retryCount: 2, timeout: 20_000 });
    const publicClient = createPublicClient({ chain, transport, pollingInterval: 500 }) as PublicClient;
    const account = env.AGENT_PK ? privateKeyToAccount(env.AGENT_PK.trim() as Hex) : undefined;
    const walletClient = account ? createWalletClient({ chain, transport, account }) : undefined;
    memo = { key, clients: { publicClient, walletClient, account } };
  }
  return { env, ...memo.clients, dryRun: env.AGENT_DRY_RUN === "1" };
}

/** PRD §6.4: /api/chat and /api/simulate-compromise need X-Demo-Key when DEMO_KEY is set. */
export function demoKeyError(request: Request, env: Env): Response | null {
  if (!env.DEMO_KEY) return null;
  const got = request.headers.get("x-demo-key") ?? "";
  if (constantTimeEqual(got, env.DEMO_KEY)) return null;
  return Response.json({ error: "demo key required" }, { status: 401 });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "shortMessage" in e && typeof e.shortMessage === "string") return e.shortMessage;
  return e instanceof Error ? e.message : String(e);
}
