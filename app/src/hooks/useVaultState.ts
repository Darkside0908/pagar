import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { pagarVaultAbi } from "../abi/pagarVault";
import { publicClient } from "../web/client";
import { deployment, ZERO } from "../lib/deployment";

type Limit = { maxPerTx: bigint; dailyCap: bigint; remaining: bigint };

export type VaultState = {
  block: bigint;
  executed: bigint;
  blocked: bigint;
  feeBps: number;
  maxSlippageBps: number;
  frozen: boolean;
  owner: Address;
  limits: { bnb: Limit; musdt: Limit };
  fees: { bnb: bigint; musdt: bigint };
  balances: { bnb: bigint; musdt: bigint };
  allow: { alice: boolean; bob: boolean; router: boolean; badRecipient: boolean; badSpender: boolean };
};

const POLL_MS = 4_500;
const vault = { address: deployment.vault, abi: pagarVaultAbi } as const;

async function readVault(): Promise<VaultState> {
  const d = deployment;
  const [
    executed, blocked, feeBps, maxSlippageBps, frozen, owner,
    limBnb, limUsdt, remBnb, remUsdt, feeBnb, feeUsdt,
    alice, bob, router, badRecipient, badSpender, balBnb, balUsdt, block,
  ] = await Promise.all([
    publicClient.readContract({ ...vault, functionName: "executedCount" }),
    publicClient.readContract({ ...vault, functionName: "blockedCount" }),
    publicClient.readContract({ ...vault, functionName: "feeBps" }),
    publicClient.readContract({ ...vault, functionName: "maxSlippageBps" }),
    publicClient.readContract({ ...vault, functionName: "frozen" }),
    publicClient.readContract({ ...vault, functionName: "owner" }),
    publicClient.readContract({ ...vault, functionName: "limitOf", args: [ZERO] }),
    publicClient.readContract({ ...vault, functionName: "limitOf", args: [d.musdt] }),
    publicClient.readContract({ ...vault, functionName: "remainingToday", args: [ZERO] }),
    publicClient.readContract({ ...vault, functionName: "remainingToday", args: [d.musdt] }),
    publicClient.readContract({ ...vault, functionName: "feesCollected", args: [ZERO] }),
    publicClient.readContract({ ...vault, functionName: "feesCollected", args: [d.musdt] }),
    publicClient.readContract({ ...vault, functionName: "allowedRecipient", args: [d.alice] }),
    publicClient.readContract({ ...vault, functionName: "allowedRecipient", args: [d.bob] }),
    publicClient.readContract({ ...vault, functionName: "allowedSpender", args: [d.router] }),
    publicClient.readContract({ ...vault, functionName: "allowedRecipient", args: [d.bad] }),
    publicClient.readContract({ ...vault, functionName: "allowedSpender", args: [d.bad] }),
    publicClient.getBalance({ address: d.vault }),
    publicClient.readContract({ address: d.musdt, abi: erc20Abi, functionName: "balanceOf", args: [d.vault] }),
    publicClient.getBlockNumber({ cacheTime: 0 }),
  ]);
  return {
    block,
    executed,
    blocked,
    feeBps: Number(feeBps),
    maxSlippageBps: Number(maxSlippageBps),
    frozen,
    owner,
    limits: {
      bnb: { maxPerTx: limBnb[0], dailyCap: limBnb[1], remaining: remBnb },
      musdt: { maxPerTx: limUsdt[0], dailyCap: limUsdt[1], remaining: remUsdt },
    },
    fees: { bnb: feeBnb, musdt: feeUsdt },
    balances: { bnb: balBnb, musdt: balUsdt },
    allow: { alice, bob, router, badRecipient, badSpender },
  };
}

/**
 * Policy, counters and balances straight from the contract (PRD §7: the counter never comes from logs).
 * Polls every few seconds while the tab is visible; `refresh()` re-reads right after a new receipt —
 * three times, because the browser's public RPC can trail the server's RPC by a block or two.
 */
export function useVaultState() {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setState(await readVault());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void load();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    const pending = timers.current;
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load();
    timers.current.push(window.setTimeout(() => void load(), 1_500), window.setTimeout(() => void load(), 4_000));
  }, [load]);

  return { state, error, refresh };
}
