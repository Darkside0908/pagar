import type { AgentEvent, ChatTurn } from "../src/lib/agentEvents";
import { errorMessage, type AgentCtx } from "./env";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOL_DEFS } from "./tools";

// `arguments` is a JSON string per the OpenAI spec; a few compatible providers send an object.
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string | Record<string, unknown> } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const MAX_STEPS = 8;

export const llmModel = (ctx: AgentCtx) => ctx.env.LLM_MODEL || "gpt-4o-mini";

const MAX_RETRIES = 3;
const MAX_WAIT_MS = 20_000;

/** POST with retries on 429 / 5xx — free LLM tiers rate-limit tokens per minute. */
async function completion(url: string, key: string, body: Record<string, unknown>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
    // Honour Retry-After or the provider's "try again in 7.5s" hint, else back off exponentially.
    const hinted = Number(res.headers.get("retry-after")) || Number(text.match(/try again in ([\d.]+)s/i)?.[1]);
    const waitMs = Math.min(MAX_WAIT_MS, hinted ? hinted * 1000 + 250 : 2_000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/** Tool-calling loop against any OpenAI-compatible /chat/completions endpoint. */
export async function runAgent(ctx: AgentCtx, history: ChatTurn[], emit: (e: AgentEvent) => Promise<void>) {
  const { env } = ctx;
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is not configured on the server");
  const base = (env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const messages: Msg[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  for (let step = 0; step < MAX_STEPS; step++) {
    const body: Record<string, unknown> = { model: llmModel(ctx), messages, tools: TOOL_DEFS, tool_choice: "auto" };
    if ((env.LLM_TEMPERATURE ?? "0") !== "omit") body.temperature = Number(env.LLM_TEMPERATURE ?? 0);

    const res = await completion(`${base}/chat/completions`, env.LLM_API_KEY, body);
    const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("LLM returned no message");

    const calls = msg.tool_calls ?? [];
    messages.push({ role: "assistant", content: msg.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) {
      await emit({ type: "message", content: msg.content ?? "" });
      return;
    }

    for (const call of calls) {
      const name = call.function.name;
      const raw = call.function.arguments;
      let args: Record<string, unknown> = {};
      try {
        args = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
      } catch {
        args = {};
      }
      await emit({ type: "tool_call", id: call.id, name, args });
      let content: string;
      try {
        const out = await runTool(ctx, name, args);
        await emit({ type: "tool_result", id: call.id, name, result: out.llm, action: out.action });
        content = JSON.stringify(out.llm);
      } catch (e) {
        const error = errorMessage(e);
        await emit({ type: "tool_result", id: call.id, name, error });
        content = JSON.stringify({ error });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  await emit({ type: "message", content: "(berhenti: terlalu banyak langkah tool)" });
}
