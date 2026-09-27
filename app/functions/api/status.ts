import type { AgentStatus } from "../../src/lib/agentEvents";
import { deployment } from "../../src/lib/deployment";
import { makeCtx, type Env } from "../../agent/env";
import { llmModel } from "../../agent/llm";

// GET /api/status — what the server-side agent is running with. Never returns secrets.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const ctx = makeCtx(env);
  const status: AgentStatus = {
    agent: ctx.account?.address ?? null,
    model: env.LLM_API_KEY ? llmModel(ctx) : null,
    llm: !!env.LLM_API_KEY,
    dryRun: ctx.dryRun,
    demoKeyRequired: !!env.DEMO_KEY,
    chainId: deployment.chainId,
  };
  return Response.json(status, { headers: { "cache-control": "no-store" } });
};
