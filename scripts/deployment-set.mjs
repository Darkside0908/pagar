// Merge fields into contracts/deployments/<chainId>.json and re-sync the app copy.
//   node scripts/deployment-set.mjs agentId=42 agentRegistrationTx=0xabc…
//   node scripts/deployment-set.mjs demoTxs+=0xhash        (append to an array)
//   node scripts/deployment-set.mjs demoTxs=               (clear an array)
// CHAIN_ID env selects the file (default 97).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const chainId = process.env.CHAIN_ID ?? "97";
const file = fileURLToPath(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url));
const d = JSON.parse(readFileSync(file, "utf8"));
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^([A-Za-z0-9_]+)(\+?=)(.*)$/);
  if (!m) throw new Error(`bad argument: ${arg}`);
  const [, key, op, raw] = m;
  const value = /^\d+$/.test(raw) && key !== "demoTxs" ? Number(raw) : raw;
  if (op === "+=") d[key] = [...new Set([...(d[key] ?? []), value])];
  else d[key] = key === "demoTxs" ? (raw ? raw.split(",") : []) : value;
}
writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
console.log(`updated ${file}`);
execFileSync("node", [fileURLToPath(new URL("../app/scripts/sync-deployment.mjs", import.meta.url)), chainId], { stdio: "inherit" });
