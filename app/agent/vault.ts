import { BaseError, ContractFunctionRevertedError, erc20Abi, formatEther, formatUnits, type Address, type Hex } from "viem";
import { pagarVaultAbi } from "../src/abi/pagarVault";
import { actionsFromLogs, describe, type VaultAction } from "../src/lib/actions";
import { assetSymbol, deployment, labelOf, short, txUrl, ZERO } from "../src/lib/deployment";
import { fmtUnits } from "../src/lib/format";
import type { AgentCtx } from "./env";

const vault = { address: deployment.vault, abi: pagarVaultAbi } as const;

/** What the agent intends; used to render rows for proposals that never reach the chain. */
export type Proposal = {
  target: Address;
  value: bigint;
  data: Hex;
  asset: Address;
  counterparty: Address;
  amount: bigint;
};

/** Tool result: `llm` goes back to the model, `action` goes to the dashboard feed. */
export type ProposeOutcome = {
  llm: Record<string, unknown>;
  action: VaultAction;
};

/**
 * PRD §6.2: send vault.propose straight away. No simulateContract gate — a proposal that will be
 * blocked must land on-chain (blocked proposals do not revert, so gas estimation succeeds).
 */
export async function propose(ctx: AgentCtx, p: Proposal): Promise<ProposeOutcome> {
  const pending: VaultAction = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "dry-run",
    reason: 0,
    reasonName: "",
    target: p.target,
    selector: p.data === "0x" ? "0x00000000" : (p.data.slice(0, 10) as Hex),
    asset: p.asset,
    counterparty: p.counterparty,
    amount: p.amount.toString(),
    fee: "0",
    ts: Date.now(),
  };

  if (ctx.dryRun) {
    return {
      action: pending,
      llm: {
        status: "dry-run",
        note: "AGENT_DRY_RUN=1: nothing was sent",
        call: { target: p.target, value: p.value.toString(), data: p.data },
        summary: describe(pending),
      },
    };
  }
  if (!ctx.walletClient || !ctx.account) throw new Error("AGENT_PK is not configured on the server");

  let hash: Hex;
  try {
    hash = await ctx.walletClient.writeContract({
      ...vault,
      functionName: "propose",
      args: [p.target, p.value, p.data],
      account: ctx.account,
      chain: ctx.walletClient.chain,
    });
  } catch (e) {
    const revert = decodeRevert(e);
    if (!revert) throw e;
    // Gas estimation reverted: no tx was sent, no event, no state change (PRD §6.2 "reverted").
    const action: VaultAction = { ...pending, status: "reverted", reasonName: revert, error: revert };
    return { action, llm: { status: "reverted", error: revert, summary: describe(action), note: "no transaction was sent" } };
  }

  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 500 });
  if (receipt.status !== "success") {
    const action: VaultAction = { ...pending, status: "reverted", reasonName: "REVERTED", error: "reverted on-chain", txHash: hash };
    return { action, llm: { status: "reverted", txHash: hash, explorer: txUrl(hash) || undefined } };
  }
  const [action] = actionsFromLogs(receipt.logs, deployment.vault);
  if (!action) throw new Error(`receipt ${hash} has no ActionExecuted/ActionBlocked log`);
  action.ts = Date.now();

  return {
    action,
    llm: {
      status: action.status,
      reason: action.reason,
      reasonName: action.reasonName,
      summary: describe(action),
      asset: assetSymbol(action.asset),
      counterparty: action.counterparty,
      amount: fmtUnits(action.amount),
      fee: fmtUnits(action.fee),
      txHash: hash,
      explorer: txUrl(hash) || undefined,
    },
  };
}

export function decodeRevert(e: unknown): string | null {
  if (!(e instanceof BaseError)) return null;
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
  if (!(r instanceof ContractFunctionRevertedError)) return null;
  if (r.data?.errorName) {
    const args = (r.data.args ?? []).map((a) => String(a)).join(", ");
    return `${r.data.errorName}(${args})`;
  }
  return r.signature ? `revert ${r.signature}` : "execution reverted";
}

// ---------------------------------------------------------------- reads (getPortfolio / getPolicy)

const read = <T>(ctx: AgentCtx, functionName: string, args: readonly unknown[] = []) =>
  ctx.publicClient.readContract({ ...vault, functionName, args } as never) as Promise<T>;

export async function readPortfolio(ctx: AgentCtx) {
  const d = deployment;
  const [bnb, musdt, feeBnb, feeUsdt, executed, blocked] = await Promise.all([
    ctx.publicClient.getBalance({ address: d.vault }),
    ctx.publicClient.readContract({ address: d.musdt, abi: erc20Abi, functionName: "balanceOf", args: [d.vault] }),
    read<bigint>(ctx, "feesCollected", [ZERO]),
    read<bigint>(ctx, "feesCollected", [d.musdt]),
    read<bigint>(ctx, "executedCount"),
    read<bigint>(ctx, "blockedCount"),
  ]);
  return {
    vault: d.vault,
    balances: { BNB: formatEther(bnb), mUSDT: formatUnits(musdt, 18) },
    feesCollected: { BNB: formatEther(feeBnb), mUSDT: formatUnits(feeUsdt, 18) },
    executedCount: Number(executed),
    blockedCount: Number(blocked),
  };
}

export async function readPolicy(ctx: AgentCtx) {
  const d = deployment;
  const people = [
    ["Alice", d.alice],
    ["Bob", d.bob],
    ["Router", d.router],
    ...(d.bad !== ZERO ? [["unknown", d.bad]] : []),
  ] as [string, Address][];

  const [limBnb, limUsdt, remBnb, remUsdt, slip, feeBps, frozen, treasury, flags] = await Promise.all([
    read<readonly [bigint, bigint]>(ctx, "limitOf", [ZERO]),
    read<readonly [bigint, bigint]>(ctx, "limitOf", [d.musdt]),
    read<bigint>(ctx, "remainingToday", [ZERO]),
    read<bigint>(ctx, "remainingToday", [d.musdt]),
    read<number>(ctx, "maxSlippageBps"),
    read<number>(ctx, "feeBps"),
    read<boolean>(ctx, "frozen"),
    read<Address>(ctx, "treasury"),
    Promise.all(
      people.map(([, a]) =>
        Promise.all([read<boolean>(ctx, "allowedRecipient", [a]), read<boolean>(ctx, "allowedSpender", [a])]),
      ),
    ),
  ]);

  return {
    limits: {
      BNB: { maxPerTx: formatEther(limBnb[0]), dailyCap: formatEther(limBnb[1]), remainingToday: formatEther(remBnb) },
      mUSDT: { maxPerTx: formatUnits(limUsdt[0], 18), dailyCap: formatUnits(limUsdt[1], 18), remainingToday: formatUnits(remUsdt, 18) },
    },
    maxSlippageBps: Number(slip),
    feeBps: Number(feeBps),
    frozen,
    treasury,
    addresses: people.map(([name, a], i) => ({
      name: labelOf(a) ?? name,
      address: a,
      short: short(a),
      allowedRecipient: flags[i][0],
      allowedSpender: flags[i][1],
    })),
  };
}
