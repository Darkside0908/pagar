// Copies contracts/deployments/<chainId>.json (written by Deploy.s.sol, plus the manual
// agentId / agentRegistrationTx / demoTxs fields) into src/deployment.json — the single
// address source for the agent (Pages Functions) and the dashboard.
// usage: node scripts/sync-deployment.mjs [chainId=97]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const chainId = process.argv[2] ?? "97";
const src = fileURLToPath(new URL(`../../contracts/deployments/${chainId}.json`, import.meta.url));
const dst = fileURLToPath(new URL("../src/deployment.json", import.meta.url));
const d = JSON.parse(readFileSync(src, "utf8"));
for (const k of ["vault", "musdt", "router", "wbnb", "owner", "agent", "treasury", "alice", "bob"]) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(d[k] ?? "")) throw new Error(`${src}: missing address "${k}"`);
}
writeFileSync(dst, JSON.stringify(d, null, 2) + "\n");
console.log(`synced ${src} -> src/deployment.json (chainId ${d.chainId}, vault ${d.vault})`);
