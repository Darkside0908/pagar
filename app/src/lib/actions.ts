import { parseEventLogs, type Address, type Hex, type Log } from "viem";
import { pagarVaultAbi } from "../abi/pagarVault";
import { reasonName } from "./reasons";
import { assetSymbol, isBad, labelOf, MAX_UINT, sameAddress, short, ZERO } from "./deployment";
import { fmtUnits } from "./format";

export type ActionStatus = "executed" | "blocked" | "reverted" | "dry-run";

/** One row of the activity feed. bigint fields are decimal strings so it survives JSON. */
export type VaultAction = {
  id: string; // txHash:logIndex for on-chain rows
  status: ActionStatus;
  reason: number;
  reasonName: string;
  nonce?: string;
  agent?: Address;
  target: Address;
  selector: Hex;
  asset: Address;
  counterparty: Address;
  amount: string; // base units
  fee: string; // base units, same asset
  txHash?: Hex;
  blockNumber?: string;
  logIndex?: number;
  error?: string; // decoded revert for status "reverted"
  ts?: number; // ms
};

export const SEL = {
  NATIVE: "0x00000000",
  TRANSFER: "0xa9059cbb",
  APPROVE: "0x095ea7b3",
  SWAP: "0x7ff36ab5",
} as const;

export function actionsFromLogs(logs: Log[], vault: Address): VaultAction[] {
  const parsed = parseEventLogs({ abi: pagarVaultAbi, logs, eventName: ["ActionExecuted", "ActionBlocked"] });
  const out: VaultAction[] = [];
  for (const l of parsed) {
    if (!sameAddress(l.address, vault)) continue;
    const base = {
      id: `${l.transactionHash}:${l.logIndex}`,
      nonce: l.args.nonce.toString(),
      agent: l.args.agent,
      target: l.args.target,
      selector: l.args.selector,
      asset: l.args.asset,
      counterparty: l.args.counterparty,
      amount: l.args.amount.toString(),
      txHash: l.transactionHash ?? undefined,
      blockNumber: l.blockNumber?.toString(),
      logIndex: l.logIndex ?? undefined,
    };
    if (l.eventName === "ActionExecuted") {
      out.push({ ...base, status: "executed", reason: 0, reasonName: "OK", fee: l.args.fee.toString() });
    } else {
      const r = Number(l.args.reason);
      out.push({ ...base, status: "blocked", reason: r, reasonName: reasonName(r), fee: "0" });
    }
  }
  return out;
}

const who = (a: string) => labelOf(a) ?? short(a);

/** Human sentence for a feed row, e.g. "Transfer 0.44995 BNB → 0xbAD6…3Ab0" (PRD §7). */
export function describe(a: VaultAction): string {
  const amt = BigInt(a.amount);
  const decoded = !sameAddress(a.counterparty, ZERO) || a.selector === SEL.NATIVE;
  switch (a.selector) {
    case SEL.NATIVE:
      if (sameAddress(a.counterparty, ZERO)) return `Malformed call to ${who(a.target)}`;
      return `Transfer ${fmtUnits(amt)} BNB → ${who(a.counterparty)}`;
    case SEL.TRANSFER:
      if (!decoded) return `transfer() on ${who(a.target)}`;
      return `Transfer ${fmtUnits(amt)} ${assetSymbol(a.asset)} → ${who(a.counterparty)}`;
    case SEL.APPROVE:
      if (!decoded) return `approve() on ${who(a.target)}`;
      return `Approve ${amt === MAX_UINT ? "∞" : fmtUnits(amt)} ${assetSymbol(a.asset)} → ${who(a.counterparty)}`;
    case SEL.SWAP: {
      if (!decoded) return `swap() on ${who(a.target)}`;
      const base = `Swap ${fmtUnits(amt)} BNB → mUSDT`;
      return labelOf(a.counterparty) === "Vault" ? base : `${base}, output → ${who(a.counterparty)}`;
    }
    default:
      return `Call ${a.selector} on ${who(a.target)}`;
  }
}

export function feeText(a: VaultAction): string | null {
  if (a.status !== "executed" || a.fee === "0") return null;
  return `fee ${fmtUnits(a.fee)} ${assetSymbol(a.asset)} → PAGAR`;
}

export const touchesBad = (a: VaultAction) => isBad(a.counterparty) || isBad(a.target);
