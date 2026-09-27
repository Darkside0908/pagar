import { useCallback, useRef, useState } from "react";
import type { VaultAction } from "../lib/actions";
import type { AgentEvent, ChatTurn } from "../lib/agentEvents";

export type ToolItem = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  state: "pending" | "done" | "error";
  result?: unknown;
  action?: VaultAction;
  error?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolItem[];
  error?: string;
  pending?: boolean;
};

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: AgentEvent) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as AgentEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as AgentEvent);
}

type Opts = {
  demoKey: string | null;
  onAction: (a: VaultAction) => void;
  onUnauthorized: () => void;
  networkErrorText: string;
};

/** POST /api/chat and render its NDJSON stream; every receipt goes to the feed the moment it arrives. */
export function useChat({ demoKey, onAction, onUnauthorized, networkErrorText }: Opts) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<ChatMsg[]>([]);
  history.current = messages;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy || !demoKey) return;
      const user: ChatMsg = { id: uid(), role: "user", content, tools: [] };
      const reply: ChatMsg = { id: uid(), role: "assistant", content: "", tools: [], pending: true };
      const turns: ChatTurn[] = [...history.current, user]
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((ms) => [...ms, user, reply]);
      setBusy(true);

      const update = (fn: (m: ChatMsg) => ChatMsg) => setMessages((ms) => ms.map((m) => (m.id === reply.id ? fn(m) : m)));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "x-demo-key": demoKey },
          body: JSON.stringify({ messages: turns }),
        });
        if (res.status === 401) {
          onUnauthorized();
          update((m) => ({ ...m, error: "401" }));
          return;
        }
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        await readNdjson(res.body, (e) => {
          switch (e.type) {
            case "tool_call":
              update((m) => ({ ...m, tools: [...m.tools, { id: e.id, name: e.name, args: e.args, state: "pending" }] }));
              break;
            case "tool_result":
              if (e.action) onAction(e.action);
              update((m) => {
                // Some OpenAI-compatible providers send empty ids: fall back to the first pending call of that name.
                let i = m.tools.findIndex((t) => t.state === "pending" && t.id === e.id && !!e.id);
                if (i < 0) i = m.tools.findIndex((t) => t.state === "pending" && t.name === e.name);
                if (i < 0) return m;
                const tools = m.tools.slice();
                tools[i] = { ...tools[i], state: e.error ? "error" : "done", result: e.result, action: e.action, error: e.error };
                return { ...m, tools };
              });
              break;
            case "message":
              update((m) => ({ ...m, content: e.content }));
              break;
            case "error":
              update((m) => ({ ...m, error: e.message }));
              break;
            case "done":
              update((m) => ({ ...m, pending: false }));
              break;
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        update((m) => ({ ...m, error: msg === "Failed to fetch" ? networkErrorText : msg }));
      } finally {
        update((m) => ({ ...m, pending: false }));
        setBusy(false);
      }
    },
    [busy, demoKey, onAction, onUnauthorized, networkErrorText],
  );

  const reset = useCallback(() => setMessages([]), []);
  return { messages, busy, send, reset };
}
