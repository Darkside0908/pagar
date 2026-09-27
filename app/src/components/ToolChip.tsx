import { isAddress } from "viem";
import { labelOf, short } from "../lib/deployment";
import type { ToolItem } from "../hooks/useChat";
import { HighlightBad } from "./Text";

const who = (v: unknown) => {
  const s = String(v ?? "");
  return isAddress(s, { strict: false }) ? (labelOf(s) ?? short(s)) : s;
};

function label(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case "getTokenInfo":
      return `getTokenInfo · ${String(a.symbol ?? "").toUpperCase()}`;
    case "proposeSwap":
      return `proposeSwap · ${String(a.amountBnb)} BNB → mUSDT`;
    case "proposeTransfer":
      return `proposeTransfer · ${String(a.asset)} ${String(a.amount)} → ${who(a.to)}`;
    case "proposeApprove": {
      const amt = String(a.amount ?? "").toLowerCase();
      return `proposeApprove · ${amt === "max" || amt === "unlimited" ? "∞" : amt} mUSDT → ${who(a.spender)}`;
    }
    default:
      return name;
  }
}

type Portfolio = { balances?: { BNB?: string; mUSDT?: string } };
type TokenInfo = { symbol?: string; description?: string; error?: string };

/** What a read-only tool returned, in one glance. */
function Output({ tool }: { tool: ToolItem }) {
  if (tool.name === "getTokenInfo") {
    const r = tool.result as TokenInfo | undefined;
    if (!r?.description) return null;
    return (
      <blockquote className="tool-out">
        <HighlightBad text={r.description} />
      </blockquote>
    );
  }
  if (tool.name === "getPortfolio") {
    const b = (tool.result as Portfolio | undefined)?.balances;
    return b ? (
      <span className="tool-sum">
        BNB {b.BNB} · mUSDT {b.mUSDT}
      </span>
    ) : null;
  }
  return null;
}

export function ToolChip({ tool }: { tool: ToolItem }) {
  const a = tool.action;
  const cls = tool.state === "error" ? "error" : a ? a.status : tool.state;
  let tag: string | null = null;
  if (a?.status === "executed") tag = "Executed";
  else if (a?.status === "blocked") tag = `Blocked · ${a.reasonName}`;
  else if (a?.status === "reverted") tag = `Reverted · ${a.error ?? ""}`;
  else if (a?.status === "dry-run") tag = "Dry-run";

  return (
    <div className={`tool ${cls}`}>
      <div className="tool-line">
        {tool.state === "pending" ? <span className="spinner" aria-label="running" /> : <span className="gear">⚙</span>}
        <span className="tool-name">
          <HighlightBad text={label(tool.name, tool.args)} />
        </span>
        {tag && <span className={`tag ${a?.status}`}>{tag}</span>}
        {tool.state === "done" && !a && <span className="tag ok">✓</span>}
      </div>
      {tool.state === "done" && <Output tool={tool} />}
      {tool.error && <span className="tool-err">✗ {tool.error}</span>}
    </div>
  );
}
