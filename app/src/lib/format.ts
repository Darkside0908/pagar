import { formatUnits } from "viem";

const MAX_UINT = (1n << 256n) - 1n;
const sig6 = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });
const sci = new Intl.NumberFormat("en-US", { notation: "scientific", maximumSignificantDigits: 4 });

/** Up to 6 significant digits; a 0.00005 BNB fee must never round to 0 (PRD §7). */
export function fmtUnits(v: bigint | string, decimals = 18): string {
  const x = typeof v === "string" ? BigInt(v) : v;
  if (x === MAX_UINT) return "∞";
  if (x === 0n) return "0";
  const n = Number(formatUnits(x, decimals));
  return n >= 1e9 ? sci.format(n) : sig6.format(n);
}

export function fmtBps(bps: number | bigint): string {
  const n = Number(bps);
  return `${n / 100}%`;
}

export function timeAgo(ms: number, lang: "en" | "id"): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return lang === "id" ? "baru saja" : "just now";
  if (s < 60) return lang === "id" ? `${s} dtk lalu` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return lang === "id" ? `${m} mnt lalu` : `${m}m ago`;
  const h = Math.round(m / 60);
  return lang === "id" ? `${h} jam lalu` : `${h}h ago`;
}
