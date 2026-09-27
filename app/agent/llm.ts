import type { AgentEvent, ChatTurn } from "../src/lib/agentEvents";
import { errorMessage, type AgentCtx } from "./env";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOL_DEFS } from "./tools";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const MAX_STEPS = 8;

export const llmModel = (ctx: AgentCtx) => ctx.env.LLM_MODEL || "gpt-4o-mini";

/** Tool-calling loop against any OpenAI-compatible /chat/completions endpoint. */
export async function runAgent(ctx: AgentCtx, history: ChatTurn[], emit: (e: AgentEvent) => Promise<void>) {
  const { env } = ctx;
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is not configured on the server");
  const base = (env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const messages: Msg[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  for (let step = 0; step < MAX_STEPS; step++) {
    const body: Record<string, unknown> = { model: llmModel(ctx), messages, tools: TOOL_DEFS, tool_choice: "auto" };
    if ((env.LLM_TEMPERATURE ?? "0") !== "omit") body.temperature = Number(env.LLM_TEMPERATURE ?? 0);

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
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
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
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
