import { parseAbiItem, type Log } from "viem";
import { actionsFromLogs } from "../../src/lib/actions";
import { LOG_CHUNK, LOG_LOOKBACK_BLOCKS } from "../../src/lib/chain";
import { deployment } from "../../src/lib/deployment";
import { errorMessage, makeCtx, type Env } from "../../agent/env";

const EVENTS = [
  parseAbiItem(
    "event ActionExecuted(uint256 indexed nonce, address indexed agent, address target, bytes4 selector, address asset, address counterparty, uint256 amount, uint256 fee)",
  ),
  parseAbiItem(
    "event ActionBlocked(uint256 indexed nonce, address indexed agent, address target, bytes4 selector, address asset, address counterparty, uint256 amount, uint8 reason)",
  ),
];

// GET /api/events — recent vault history through the server's dedicated RPC, for browsers whose
// public RPC refuses eth_getLogs (PRD §7). Read-only; no demo key needed. Cached for a few seconds
// at the edge so a public endpoint cannot burn the dedicated RPC quota.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(request.url).origin + "/api/events", { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const { publicClient } = makeCtx(env);
  try {
    const latest = await publicClient.getBlockNumber();
    const floor = BigInt(deployment.deployBlock);
    let from = latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : 0n;
    if (from < floor) from = floor;
    const logs: Log[] = [];
    for (let start = from; start <= latest; start += LOG_CHUNK) {
      const end = start + LOG_CHUNK - 1n > latest ? latest : start + LOG_CHUNK - 1n;
      logs.push(...(await publicClient.getLogs({ address: deployment.vault, events: EVENTS, fromBlock: start, toBlock: end })));
    }
    const res = Response.json(
      { latest: latest.toString(), actions: actionsFromLogs(logs, deployment.vault) },
      { headers: { "cache-control": "public, max-age=5" } },
    );
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
};
