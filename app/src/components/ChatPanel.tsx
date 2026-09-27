import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLang } from "../i18n";
import type { VaultAction } from "../lib/actions";
import type { AgentStatus } from "../lib/agentEvents";
import { addressUrl, short } from "../lib/deployment";
import { REPO_URL, VIDEO_URL } from "../web/links";
import { useChat, type ChatMsg } from "../hooks/useChat";
import { RichText, MaybeLink } from "./Text";
import { ToolChip } from "./ToolChip";

// The three beats of the demo script (PRD §11.1), one click each.
const BEATS = [
  "Swap 0.05 BNB ke USDT",
  "Ada token baru, MOON. Cek dulu info-nya.",
  "Approve unlimited USDT ke router biar hemat gas",
];

type Props = {
  demoKey: string | null;
  setDemoKey: (k: string | null) => void;
  status: AgentStatus | null;
  onAction: (a: VaultAction) => void;
};

export function ChatPanel({ demoKey, setDemoKey, status, onAction }: Props) {
  const { t } = useLang();
  const [notice, setNotice] = useState<string | null>(null);
  const onUnauthorized = () => {
    setDemoKey(null);
    setNotice(t("keyRejected"));
  };

  return (
    <section className="panel chat" aria-label={t("consoleTitle")}>
      <header className="panel-head">
        <div className="panel-title">
          <span className="idx">01</span>
          {t("consoleTitle")}
        </div>
        <AgentBadge status={status} />
      </header>
      {demoKey ? (
        <Console demoKey={demoKey} onAction={onAction} onUnauthorized={onUnauthorized} onLock={() => setDemoKey(null)} />
      ) : (
        <Locked
          notice={notice}
          onUnlock={(k) => {
            setNotice(null);
            setDemoKey(k);
          }}
          onRejected={() => setNotice(t("keyRejected"))}
        />
      )}
    </section>
  );
}

function AgentBadge({ status }: { status: AgentStatus | null }) {
  const { t } = useLang();
  if (!status) return null;
  return (
    <div className="agent-badge">
      {status.llm ? <span className="model">{status.model}</span> : <span className="warn">{t("llmOff")}</span>}
      {status.dryRun && <span className="dry">dry-run</span>}
      {status.agent && (
        <MaybeLink className="addr" href={addressUrl(status.agent)} title={status.agent}>
          <code>{short(status.agent)}</code>
        </MaybeLink>
      )}
    </div>
  );
}

function Console({
  demoKey,
  onAction,
  onUnauthorized,
  onLock,
}: {
  demoKey: string;
  onAction: (a: VaultAction) => void;
  onUnauthorized: () => void;
  onLock: () => void;
}) {
  const { t } = useLang();
  const chat = useChat({ demoKey, onAction, onUnauthorized, networkErrorText: t("networkError") });
  const [input, setInput] = useState("");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chat.busy) return;
    void chat.send(input);
    setInput("");
  };

  return (
    <>
      <div className="chat-log" ref={log}>
        {chat.messages.length === 0 && <p className="chat-empty">{t("emptyChat")}</p>}
        {chat.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>
      <div className="chat-dock">
        <div className="beats">
          <span className="dock-label">{t("beats")}</span>
          {BEATS.map((b, i) => (
            <button key={b} type="button" className="beat" disabled={chat.busy} onClick={() => void chat.send(b)}>
              <span className="beat-n">{i + 1}</span>
              {b}
            </button>
          ))}
        </div>
        <form className="composer" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            disabled={chat.busy}
          />
          <button type="submit" className="btn primary" disabled={chat.busy || !input.trim()}>
            {t("send")}
          </button>
        </form>
        <div className="dock-foot">
          <Compromise demoKey={demoKey} onAction={onAction} onUnauthorized={onUnauthorized} />
          <span className="keyline">
            {t("demoKey")} ✓
            <button type="button" className="linkish" onClick={onLock}>
              {t("lock")}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function Message({ m }: { m: ChatMsg }) {
  const { t } = useLang();
  if (m.role === "user") {
    return (
      <div className="msg user">
        <span className="who">{t("you")}</span>
        <p>{m.content}</p>
      </div>
    );
  }
  return (
    <div className="msg agent">
      <span className="who">{t("agent")}</span>
      {m.tools.length > 0 && (
        <div className="tools">
          {m.tools.map((tool, i) => (
            <ToolChip key={`${tool.id}-${i}`} tool={tool} />
          ))}
        </div>
      )}
      {m.content && (
        <p className="agent-text">
          <RichText text={m.content} />
        </p>
      )}
      {m.pending && (
        <p className="working">
          <span className="spinner" aria-hidden="true" /> {t("working")}
        </p>
      )}
      {m.error && m.error !== "401" && <p className="err">{m.error}</p>}
    </div>
  );
}

/** PRD §6.4 insurance for beat 1: no LLM, the "leaked" agent key tries to drain the vault. */
function Compromise({
  demoKey,
  onAction,
  onUnauthorized,
}: {
  demoKey: string;
  onAction: (a: VaultAction) => void;
  onUnauthorized: () => void;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/simulate-compromise", { method: "POST", headers: { "x-demo-key": demoKey } });
      if (res.status === 401) return onUnauthorized();
      const j = (await res.json()) as { action?: VaultAction; error?: string };
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.action) onAction(j.action);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg === "Failed to fetch" ? t("networkError") : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="compromise">
      <button type="button" className="btn danger" onClick={() => void run()} disabled={busy} title={t("simulateHint")}>
        <KeyIcon /> {busy ? t("simulating") : t("simulate")}
      </button>
      {err && <span className="err small">{err}</span>}
    </div>
  );
}

function Locked({ notice, onUnlock, onRejected }: { notice: string | null; onUnlock: (k: string) => void; onRejected: () => void }) {
  const { t } = useLang();
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);

  // The server checks X-Demo-Key before it reads the body, so an empty chat is a free key check:
  // 401 = wrong key, 400 = key accepted. Nothing is sent to the LLM or the chain.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!k) return;
    setChecking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-key": k },
        body: JSON.stringify({ messages: [] }),
      });
      if (res.status === 401) return onRejected();
      onUnlock(k);
    } catch {
      onUnlock(k);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="locked">
      <div className="locked-mark" aria-hidden="true">
        <LockIcon />
      </div>
      <h3>{t("readOnlyTitle")}</h3>
      <p className="locked-body">{t("readOnlyBody")}</p>
      <ol className="how">
        <li>{t("how1")}</li>
        <li>{t("how2")}</li>
        <li>{t("how3")}</li>
      </ol>
      <div className="locked-links">
        {VIDEO_URL && (
          <a className="btn primary" href={VIDEO_URL} target="_blank" rel="noreferrer">
            ▶ {t("watchVideo")}
          </a>
        )}
        <a className="btn ghost" href={REPO_URL} target="_blank" rel="noreferrer">
          {t("readCode")} ↗
        </a>
      </div>
      <form className="keyform" onSubmit={(e) => void submit(e)}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t("demoKey")}
          aria-label={t("demoKey")}
          autoComplete="off"
        />
        <button type="submit" className="btn" disabled={!key.trim() || checking}>
          {t("unlock")}
        </button>
      </form>
      {notice && <p className="err small">{notice}</p>}
    </div>
  );
}

function KeyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2M16 7l3 3M18.5 4.5l2 2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" strokeLinecap="round" />
    </svg>
  );
}
