import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { readStore, writeStore } from "./web/storage";

export type Lang = "id" | "en";

const dict = {
  tagline: { id: "AI boleh mikir. Kontrak yang megang kunci.", en: "The AI may think. The contract holds the keys." },
  local: { id: "Anvil lokal", en: "Local anvil" },
  feeBadge: { id: "Fee {bps} bps · diatur protokol · maks 1%", en: "Fee {bps} bps · set by protocol · max 1%" },

  consoleTitle: { id: "Konsol agent", en: "Agent console" },
  you: { id: "Kamu", en: "You" },
  agent: { id: "Agent", en: "Agent" },
  placeholder: { id: "Perintahkan agent…", en: "Tell the agent what to do…" },
  send: { id: "Kirim", en: "Send" },
  beats: { id: "Beat demo", en: "Demo beats" },
  emptyChat: {
    id: "Suruh agent swap, transfer, atau cek token baru. Agent cuma bisa mengusulkan — kontrak yang memutuskan.",
    en: "Ask the agent to swap, transfer, or check a new token. It can only propose — the contract decides.",
  },
  working: { id: "Agent bekerja…", en: "Agent working…" },
  llmOff: { id: "LLM belum di-set", en: "LLM not set" },
  simulate: { id: "Simulate: agent key bocor", en: "Simulate: leaked agent key" },
  simulateHint: {
    id: "Tanpa LLM. Penyerang memakai agent key untuk mengirim seluruh saldo BNB vault ke 0xbad…",
    en: "No LLM. An attacker uses the agent key to send the vault's entire BNB balance to 0xbad…",
  },
  simulating: { id: "Mengirim…", en: "Sending…" },
  networkError: { id: "Gagal menghubungi server", en: "Could not reach the server" },
  keyRejected: { id: "Demo key ditolak — masukkan ulang.", en: "Demo key rejected — enter it again." },

  evidenceEyebrow: { id: "Bukti on-chain", en: "On-chain evidence" },
  evidenceTitle: { id: "Agent mengusulkan. Kontrak memutuskan.", en: "The agent proposes. The contract decides." },
  evidenceBody: {
    id: "Aksi di bawah dikirim AI agent ke vault di BSC Testnet. Yang lolos membayar fee kecil, yang melanggar ditolak dan tercatat permanen sebagai event. Jangan percaya kami — cek sendiri.",
    en: "The actions below were sent by an AI agent to a vault on BSC Testnet. The one that passed paid a small fee; the ones that broke policy were refused and recorded as events. Don't trust us — check.",
  },
  evVault: { id: "Kode vault, terverifikasi", en: "Vault source, verified" },
  evAgent: { id: "Identitas agent · ERC-8004 #{id}", en: "Agent identity · ERC-8004 #{id}" },
  evLoading: { id: "Memuat transaksi demo…", en: "Loading demo transactions…" },
  keyPrompt: { id: "Punya demo key? Buka konsol agent.", en: "Have a demo key? Open the agent console." },
  watchVideo: { id: "Tonton video demo", en: "Watch the demo video" },
  readCode: { id: "Kode di GitHub", en: "Code on GitHub" },
  demoKey: { id: "Demo key", en: "Demo key" },
  unlock: { id: "Buka", en: "Unlock" },
  lock: { id: "Kunci", en: "Lock" },

  policyTitle: { id: "Policy aktif", en: "Active policy" },
  limits: { id: "Limit per aset", en: "Per-asset limits" },
  perDay: { id: "hari", en: "day" },
  leftToday: { id: "sisa hari ini", en: "left today" },
  maxSlippage: { id: "Slippage maks", en: "Max slippage" },
  allowlist: { id: "Allowlist", en: "Allowlist" },
  recipient: { id: "penerima", en: "recipient" },
  spender: { id: "spender", en: "spender" },
  vaultTitle: { id: "Vault", en: "Vault" },
  earned: { id: "PAGAR earned dari vault ini", en: "PAGAR earned from this vault" },
  earnedNote: { id: "Fee hanya saat aksi lolos. Block selalu gratis.", en: "Fee only when an action executes. Blocks are always free." },
  active: { id: "Aktif", en: "Active" },
  frozen: { id: "Frozen", en: "Frozen" },
  freeze: { id: "Freeze vault", en: "Freeze vault" },
  unfreeze: { id: "Unfreeze vault", en: "Unfreeze vault" },
  connectOwner: { id: "Hubungkan wallet owner", en: "Connect owner wallet" },
  notOwner: { id: "Wallet {addr} bukan owner vault", en: "Wallet {addr} is not the vault owner" },
  noWallet: { id: "Freeze butuh wallet browser (MetaMask / Rabby)", en: "Freeze needs a browser wallet (MetaMask / Rabby)" },
  confirmInWallet: { id: "Konfirmasi di wallet…", en: "Confirm in your wallet…" },
  waitingBlock: { id: "Menunggu blok…", en: "Waiting for the block…" },
  ownerNote: { id: "Khusus owner. Withdraw tetap jalan saat frozen.", en: "Owner only. Withdrawals still work while frozen." },
  frozenBanner: {
    id: "VAULT FROZEN — setiap propose() di-revert, termasuk yang lolos policy. Withdraw owner tetap jalan.",
    en: "VAULT FROZEN — every propose() reverts, even ones that pass policy. Owner withdrawals still work.",
  },

  feedTitle: { id: "Aktivitas on-chain", en: "On-chain activity" },
  liveBlock: { id: "live · blok {n}", en: "live · block {n}" },
  feedStart: { id: "awal riwayat · vault di-deploy di blok {n}", en: "start of history · vault deployed at block {n}" },
  feedWindow: { id: "riwayat ±2,5 jam terakhir · lengkapnya di BscScan", en: "last ~2.5 hours · full history on BscScan" },
  traceLabel: { id: "Jejak keputusan kontrak", en: "Contract decision trace" },
  gate_target: { id: "Kontrak", en: "Contract" },
  gate_decode: { id: "Decode", en: "Decode" },
  gate_recipient: { id: "Penerima", en: "Recipient" },
  gate_output: { id: "Output ke vault", en: "Output to vault" },
  gate_spender: { id: "Spender", en: "Spender" },
  gate_unlimited: { id: "Bukan ∞", en: "Not ∞" },
  gate_perTx: { id: "Per-tx", en: "Per-tx" },
  gate_daily: { id: "Harian", en: "Daily" },
  gate_slippage: { id: "Slippage", en: "Slippage" },
  gatePass: { id: "lolos", en: "passed" },
  gateIdle: { id: "tidak dievaluasi", en: "not evaluated" },
  gateExecute: { id: "Eksekusi", en: "Execute" },
  executed: { id: "executed", en: "executed" },
  blocked: { id: "blocked", en: "blocked" },
  counterNote: { id: "dibaca langsung dari kontrak", en: "read straight from the contract" },
  allEvents: { id: "Semua event di BscScan", en: "All events on BscScan" },
  emptyFeed: { id: "Belum ada aksi. Suruh agent melakukan sesuatu.", en: "No actions yet. Ask the agent to do something." },
  noFee: { id: "tanpa fee", en: "no fee" },
  targetUntouched: { id: "target tidak dipanggil", en: "target never called" },
  noTx: { id: "tidak ada tx terkirim", en: "no transaction sent" },
  pinned: { id: "demo", en: "demo" },
  loading: { id: "Memuat…", en: "Loading…" },
} satisfies Record<string, Record<Lang, string>>;

export type TKey = keyof typeof dict;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey, vars?: Record<string, string | number>) => string };

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readStore("local", "pagar.lang") === "en" ? "en" : "id"));
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeStore("local", "pagar.lang", l);
    document.documentElement.lang = l;
  }, []);
  const t = useCallback(
    (k: TKey, vars?: Record<string, string | number>) =>
      dict[k][lang].replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? `{${v}}`)),
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return createElement(LangContext.Provider, { value }, children);
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang outside LangProvider");
  return ctx;
}
