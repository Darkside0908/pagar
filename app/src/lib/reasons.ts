// Reason codes emitted by PagarVault.ActionBlocked (PRD §4.2). Shared by agent + dashboard.
export const REASONS = ["OK", "TARGET_NOT_ALLOWED", "EXCEEDS_MAX_PER_TX", "DAILY_CAP_EXCEEDED",
  "RECIPIENT_NOT_ALLOWED", "UNLIMITED_APPROVAL", "SPENDER_NOT_ALLOWED", "SLIPPAGE_TOO_HIGH",
  "UNDECODABLE_CALLDATA"] as const;

export type ReasonName = (typeof REASONS)[number];

export function reasonName(code: number): string {
  return REASONS[code] ?? `REASON_${code}`;
}

// One line per code, for tooltips and the agent's receipt summary.
export const REASON_HINTS: Record<ReasonName, { en: string; id: string }> = {
  OK: { en: "Passed every check", id: "Lolos semua cek" },
  TARGET_NOT_ALLOWED: { en: "Contract + function not on the allowlist", id: "Kontrak + fungsi tidak ada di allowlist" },
  EXCEEDS_MAX_PER_TX: { en: "Amount above the per-transaction limit", id: "Nominal di atas batas per transaksi" },
  DAILY_CAP_EXCEEDED: { en: "Would exceed today's cap for this asset", id: "Melewati batas harian aset ini" },
  RECIPIENT_NOT_ALLOWED: { en: "Recipient is not on the allowlist", id: "Penerima tidak ada di allowlist" },
  UNLIMITED_APPROVAL: { en: "Unlimited approvals are never allowed", id: "Approve unlimited selalu ditolak" },
  SPENDER_NOT_ALLOWED: { en: "Spender is not on the allowlist", id: "Spender tidak ada di allowlist" },
  SLIPPAGE_TOO_HIGH: { en: "minOut below the router quote minus max slippage", id: "minOut di bawah quote router dikurangi slippage maks" },
  UNDECODABLE_CALLDATA: { en: "Calldata the vault cannot decode is refused", id: "Calldata yang tidak bisa didekode ditolak" },
};
