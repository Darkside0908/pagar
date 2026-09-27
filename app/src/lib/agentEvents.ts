import type { VaultAction } from "./actions";

/** NDJSON events streamed by POST /api/chat, one JSON object per line. */
export type AgentEvent =
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result?: unknown; action?: VaultAction; error?: string }
  | { type: "message"; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** GET /api/status — no secrets. */
export type AgentStatus = {
  agent: string | null;
  model: string | null;
  llm: boolean;
  dryRun: boolean;
  demoKeyRequired: boolean;
  chainId: number;
};
