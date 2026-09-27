import { encodeFunctionData, erc20Abi, getAddress, isAddress, parseEther, parseUnits, type Address } from "viem";
import { mockRouterAbi } from "../src/abi/mockRouter";
import { deployment, MAX_UINT, ZERO } from "../src/lib/deployment";
import type { VaultAction } from "../src/lib/actions";
import type { AgentCtx } from "./env";
import { propose, readPolicy, readPortfolio } from "./vault";
import tokens from "./data/tokens.json";

// PRD §6.1 — six tools, OpenAI function-calling schema.
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "getPortfolio",
      description: "Vault balances (BNB and mUSDT), protocol fees collected per asset, and the on-chain executed/blocked counters.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getPolicy",
      description:
        "The vault's active policy: per-asset limits and what is left today, max slippage, fee, freeze state, and allowlist status for the known addresses.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getTokenInfo",
      description: "Market info for a token symbol, from the external token-info feed.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Token symbol, e.g. MOON or USDT" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proposeSwap",
      description:
        "Propose a swap of vault BNB into mUSDT through the router. ONLY BNB → mUSDT is supported. The tool quotes the router and sets minOut = quote × (1 − slippage).",
      parameters: {
        type: "object",
        properties: {
          amountBnb: { type: "string", description: 'BNB amount as a decimal string, e.g. "0.05"' },
          slippageBps: { type: "integer", description: "Slippage tolerance in basis points. Default 100 (1%)." },
        },
        required: ["amountBnb"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proposeTransfer",
      description: "Propose sending BNB or mUSDT from the vault to an address.",
      parameters: {
        type: "object",
        properties: {
          asset: { type: "string", enum: ["BNB", "mUSDT"] },
          to: { type: "string", description: "Recipient 0x address (Alice and Bob may be given by name)" },
          amount: { type: "string", description: 'Amount as a decimal string, e.g. "0.05"' },
        },
        required: ["asset", "to", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proposeApprove",
      description: 'Propose an mUSDT approval for a spender. amount is a decimal string, or "max" for an unlimited approval.',
      parameters: {
        type: "object",
        properties: {
          spender: { type: "string", description: "Spender 0x address (the router may be given as Router)" },
          amount: { type: "string", description: 'Decimal string, or "max"' },
        },
        required: ["spender", "amount"],
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFS)[number]["function"]["name"];
export type ToolOutput = { llm: unknown; action?: VaultAction };

const NAMES: Record<string, Address> = {
  alice: deployment.alice,
  bob: deployment.bob,
  router: deployment.router,
};

function resolveAddress(input: unknown): Address {
  const s = String(input ?? "").trim();
  const named = NAMES[s.toLowerCase()];
  if (named) return named;
  if (!isAddress(s, { strict: false })) throw new Error(`"${s}" is not a valid address`);
  return getAddress(s);
}

function amountArg(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`amount must be a decimal string like "0.05", got "${s}"`);
  return s;
}

// Deliberately naive (PRD §6.3): no filtering or sanitising here. The vault contract decides.
export async function runTool(ctx: AgentCtx, name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const d = deployment;
  switch (name as ToolName) {
    case "getPortfolio":
      return { llm: await readPortfolio(ctx) };

    case "getPolicy":
      return { llm: await readPolicy(ctx) };

    case "getTokenInfo": {
      const q = String(args.symbol ?? "").trim().toUpperCase();
      const table = tokens as Record<string, { symbol: string; description: string }>;
      const hit = Object.entries(table).find(([k, v]) => k.toUpperCase() === q || v.symbol.toUpperCase() === q);
      return { llm: hit ? { symbol: hit[1].symbol, description: hit[1].description } : { error: `no info for ${q}` } };
    }

    case "proposeSwap": {
      const value = parseEther(amountArg(args.amountBnb));
      const slippageBps = args.slippageBps === undefined ? 100 : Number(args.slippageBps);
      if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) throw new Error("slippageBps must be 0..10000");
      const path = [d.wbnb, d.musdt] as const;
      const amounts = await ctx.publicClient.readContract({
        address: d.router,
        abi: mockRouterAbi,
        functionName: "getAmountsOut",
        args: [value, [...path]],
      });
      const quote = amounts[amounts.length - 1];
      const minOut = (quote * BigInt(10_000 - slippageBps)) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const data = encodeFunctionData({
        abi: mockRouterAbi,
        functionName: "swapExactETHForTokens",
        args: [minOut, [...path], d.vault, deadline],
      });
      return propose(ctx, { target: d.router, value, data, asset: ZERO, counterparty: d.vault, amount: value });
    }

    case "proposeTransfer": {
      const to = resolveAddress(args.to);
      const asset = String(args.asset ?? "").trim().toUpperCase();
      if (asset === "BNB") {
        const value = parseEther(amountArg(args.amount));
        return propose(ctx, { target: to, value, data: "0x", asset: ZERO, counterparty: to, amount: value });
      }
      if (asset === "MUSDT" || asset === "USDT") {
        const amount = parseUnits(amountArg(args.amount), 18);
        const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
        return propose(ctx, { target: d.musdt, value: 0n, data, asset: d.musdt, counterparty: to, amount });
      }
      throw new Error(`asset must be "BNB" or "mUSDT", got "${String(args.asset)}"`);
    }

    case "proposeApprove": {
      const spender = resolveAddress(args.spender);
      const raw = String(args.amount ?? "").trim().toLowerCase();
      const amount = raw === "max" || raw === "unlimited" ? MAX_UINT : parseUnits(amountArg(raw), 18);
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
      return propose(ctx, { target: d.musdt, value: 0n, data, asset: d.musdt, counterparty: spender, amount });
    }

    default:
      throw new Error(`unknown tool ${name}`);
  }
}
