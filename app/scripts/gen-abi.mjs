// Regenerates typed viem ABIs from the Foundry build (PRD §4.8). Requires `forge` on PATH.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contracts = fileURLToPath(new URL("../../contracts", import.meta.url));
const targets = [
  ["src/PagarVault.sol:PagarVault", "pagarVaultAbi", "pagarVault.ts"],
  ["src/mocks/MockRouter.sol:MockRouter", "mockRouterAbi", "mockRouter.ts"],
];
for (const [id, name, file] of targets) {
  const abi = execFileSync("forge", ["inspect", id, "abi", "--json"], { cwd: contracts, encoding: "utf8" });
  writeFileSync(fileURLToPath(new URL(`../src/abi/${file}`, import.meta.url)), `export const ${name} = ${abi.trim()} as const;\n`);
  console.log(`wrote src/abi/${file}`);
}
