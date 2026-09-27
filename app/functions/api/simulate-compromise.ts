import { deployment, ZERO } from "../../src/lib/deployment";
import { demoKeyError, errorMessage, makeCtx, type Env } from "../../agent/env";
import { propose } from "../../agent/vault";

// POST /api/simulate-compromise — no LLM (PRD §6.4). Pretend the agent key leaked: the attacker
// signs vault.propose(0xbad…, <entire BNB balance>, "0x") with AGENT_PK. The vault still decides.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = demoKeyError(request, env);
  if (denied) return denied;
  if (deployment.bad === ZERO) return Response.json({ error: "deployment has no attacker address (bad)" }, { status: 500 });

  const ctx = makeCtx(env);
  ctx.dryRun = false; // deterministic insurance for the demo: always sends
  try {
    const balance = await ctx.publicClient.getBalance({ address: deployment.vault });
    const out = await propose(ctx, {
      target: deployment.bad,
      value: balance,
      data: "0x",
      asset: ZERO,
      counterparty: deployment.bad,
      amount: balance,
    });
    return Response.json({ result: out.llm, action: out.action });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
};
