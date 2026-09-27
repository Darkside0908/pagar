import type { AgentEvent, ChatTurn } from "../../src/lib/agentEvents";
import { demoKeyError, errorMessage, makeCtx, type Env } from "../../agent/env";
import { runAgent } from "../../agent/llm";

const MAX_TURNS = 20;
const MAX_CHARS = 4_000;

// POST /api/chat — streams AgentEvent NDJSON so the dashboard can show each tool call as it happens.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const denied = demoKeyError(request, env);
  if (denied) return denied;

  let history: ChatTurn[];
  try {
    const body = (await request.json()) as { messages?: unknown };
    history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m): m is ChatTurn => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (history.at(-1)?.role !== "user") return Response.json({ error: "last message must be from the user" }, { status: 400 });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = async (e: AgentEvent) => {
    await writer.write(enc.encode(JSON.stringify(e) + "\n")).catch(() => {});
  };

  waitUntil(
    (async () => {
      try {
        await runAgent(makeCtx(env), history, emit);
      } catch (e) {
        await emit({ type: "error", message: errorMessage(e) });
      } finally {
        await emit({ type: "done" });
        await writer.close().catch(() => {});
      }
    })(),
  );

  return new Response(readable, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
};
