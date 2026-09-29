import { SEL, type VaultAction } from "./actions";
import { sameAddress, ZERO } from "./deployment";

/**
 * The gates a proposal walks through inside PagarVault.propose(), in the fixed order of PRD §4.3.
 * A blocked action stops at the first gate whose reason code matches; later gates never ran.
 */
export type Gate = "target" | "decode" | "recipient" | "output" | "spender" | "unlimited" | "perTx" | "daily" | "slippage";
export type GateState = "pass" | "fail" | "idle";
export type Step = { gate: Gate; state: GateState; code: number };

// Reason code each gate emits when it fails (PRD §4.2).
const CODE: Record<Gate, number> = {
  target: 1,
  decode: 8,
  recipient: 4,
  output: 4,
  spender: 6,
  unlimited: 5,
  perTx: 2,
  daily: 3,
  slippage: 7,
};

function gatesOf(a: VaultAction): Gate[] {
  switch (a.selector) {
    case SEL.NATIVE:
      // Empty calldata skips the target and decode gates; 0 < data.length < 4 fails decoding first.
      return sameAddress(a.counterparty, ZERO) ? ["decode"] : ["recipient", "perTx", "daily"];
    case SEL.TRANSFER:
      return ["target", "decode", "recipient", "perTx", "daily"];
    case SEL.APPROVE:
      return ["target", "decode", "spender", "unlimited", "perTx", "daily"];
    case SEL.SWAP:
      return ["target", "decode", "output", "perTx", "daily", "slippage"];
    default:
      return ["target", "decode"];
  }
}

/** Gate-by-gate trace for an on-chain row; null for rows that never reached the policy (reverted, dry-run). */
export function traceOf(a: VaultAction): Step[] | null {
  if (a.status !== "executed" && a.status !== "blocked") return null;
  const gates = gatesOf(a);
  const failAt = a.status === "blocked" ? gates.findIndex((g) => CODE[g] === a.reason) : -1;
  return gates.map((gate, i) => ({
    gate,
    code: CODE[gate],
    state: failAt < 0 || i < failAt ? "pass" : i === failAt ? "fail" : "idle",
  }));
}
