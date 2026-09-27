#!/usr/bin/env bash
# Deploy + seed + verify PagarVault on BSC Testnet (PRD §4.8, §4.9) and sync addresses into the app.
# Reads contracts/.env. For a FRESH VAULT only (before recording), set MUSDT + ROUTER in .env to the
# existing mocks. agentId / agentRegistrationTx survive the redeploy; demoTxs are reset (new vault).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
cd "$ROOT/contracts"
set -a; source .env; set +a
: "${BSC_TESTNET_RPC:?}" "${OWNER_PK:?}" "${AGENT:?}" "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY in contracts/.env}"

OUT=deployments/97.json
KEEP=""
if [ -f "$OUT" ]; then
  KEEP=$(jq -c '{agentId, agentRegistrationTx} | with_entries(select(.value != null))' "$OUT")
fi

forge script script/Deploy.s.sol --rpc-url "$BSC_TESTNET_RPC" --broadcast --slow \
  --verify --verifier etherscan --etherscan-api-key "$ETHERSCAN_API_KEY" --chain 97 --retries 10 --delay 10

if [ -n "$KEEP" ] && [ "$KEEP" != "{}" ]; then
  jq --argjson keep "$KEEP" '. + $keep' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
fi
cd "$ROOT/app" && node scripts/sync-deployment.mjs 97
jq . "$ROOT/contracts/$OUT"
