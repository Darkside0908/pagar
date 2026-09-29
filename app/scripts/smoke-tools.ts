// Runs the PRD §11 demo sequence through the agent's own tools, no LLM involved.
// usage: bun scripts/smoke-tools.ts [--pin]   (reads .dev.vars; expects a fresh vault)
//   --pin  records the three tx hashes as deployments/<chainId>.json → demoTxs (PRD §7 pinned rows)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { makeCtx, type Env } from "../agent/env";
import { runTool } from "../agent/tools";
import { deployment } from "../src/lib/deployment";

const env = Object.fromEntries(
  readFileSync(process.env.DEV_VARS ?? new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
) as Env;
const ctx = makeCtx(env);

async function step(name: string, args: Record<string, unknown> = {}) {
  const out = await runTool(ctx, name, args);
  console.log(`\n▶ ${name}(${JSON.stringify(args)})\n`, JSON.stringify(out.llm, null, 2));
  return out;
}

await step("getPolicy");
const swap = await step("proposeSwap", { amountBnb: deployment.demoSwapBnb ?? "0.05" });
const p = (await step("getPortfolio")).llm as { balances: { BNB: string } };
const drain = await step("proposeTransfer", { asset: "BNB", to: deployment.bad, amount: p.balances.BNB });
const appr = await step("proposeApprove", { spender: "Router", amount: "max" });
await step("getTokenInfo", { symbol: "moon" });
const fin = (await step("getPortfolio")).llm as { executedCount: number; blockedCount: number };

const got = [swap.action?.status, drain.action?.reasonName, appr.action?.reasonName, `${fin.executedCount}/${fin.blockedCount}`];
const want = ["executed", "RECIPIENT_NOT_ALLOWED", "UNLIMITED_APPROVAL", "1/2"];
console.log("\nresult:", got.join(" · "));
if (JSON.stringify(got) !== JSON.stringify(want)) {
  console.error("MISMATCH, expected:", want.join(" · "));
  process.exit(1);
}
console.log("OK — matches the demo script (PRD §11.1)");

if (process.argv.includes("--pin")) {
  const hashes = [swap, drain, appr].map((o) => o.action?.txHash).filter(Boolean).join(",");
  execFileSync("node", [new URL("../../scripts/deployment-set.mjs", import.meta.url).pathname, `demoTxs=${hashes}`], {
    stdio: "inherit",
    env: { ...process.env, CHAIN_ID: String(deployment.chainId) },
  });
}
