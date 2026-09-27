#!/usr/bin/env bash
# Deploy + seed + verify PagarVault on BSC Testnet (PRD §4.8, §4.9) and sync addresses into the app.
# Reads contracts/.env. For a FRESH VAULT only (before recording), set MUSDT + ROUTER in .env to the
# existing mocks. agentId / agentRegistrationTx survive the redeploy; demoTxs are reset (new vault).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
cd "$ROOT/contracts"
set -a; source .env; set +a
: "${BSC_TESTNET_RPC:?}" "${OWNER_PK:?}" "${AGENT:?}"
VERIFY=()
if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
  VERIFY=(--verify --verifier etherscan --etherscan-api-key "$ETHERSCAN_API_KEY" --retries 10 --delay 10)
else
  echo "ETHERSCAN_API_KEY is empty: deploying without verification (run scripts/verify.sh later)"
fi

OUT=deployments/97.json
KEEP=""
if [ -f "$OUT" ]; then
  KEEP=$(jq -c '{agentId, agentRegistrationTx} | with_entries(select(.value != null))' "$OUT")
fi

# BSC testnet rejects < 0.1 gwei and forge's fee estimate can come back as 1 wei, so pin a legacy price.
forge script script/Deploy.s.sol --rpc-url "$BSC_TESTNET_RPC" --broadcast --slow --chain 97 \
  --legacy --with-gas-price "${GAS_PRICE:-200000000}" "${VERIFY[@]}"

if [ -n "$KEEP" ] && [ "$KEEP" != "{}" ]; then
  jq --argjson keep "$KEEP" '. + $keep' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
fi
cd "$ROOT/app" && node scripts/sync-deployment.mjs 97
jq . "$ROOT/contracts/$OUT"
