#!/usr/bin/env bash
# Verify the BSC Testnet deployment on BscScan through the Etherscan V2 API (PRD §4.8).
# Reads contracts/deployments/97.json and contracts/.env (ETHERSCAN_API_KEY). Safe to re-run.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
cd "$ROOT/contracts"
set -a; source .env; set +a
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY in contracts/.env (https://etherscan.io/myapikey)}"
D=deployments/97.json
j() { jq -r ".$1" "$D"; }
V=(--chain 97 --verifier etherscan --etherscan-api-key "$ETHERSCAN_API_KEY" --watch)

forge verify-contract "${V[@]}" "$(j musdt)" src/mocks/MockUSDT.sol:MockUSDT || true
forge verify-contract "${V[@]}" "$(j router)" src/mocks/MockRouter.sol:MockRouter \
  --constructor-args "$(cast abi-encode 'constructor(address,address,uint256)' "$(j wbnb)" "$(j musdt)" 1000000000000000000000)" || true
forge verify-contract "${V[@]}" "$(j vault)" src/PagarVault.sol:PagarVault \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address,address,uint16)' "$(j owner)" "$(j agent)" "$PROTOCOL_ADMIN" "$(j treasury)" 10)"
echo "https://testnet.bscscan.com/address/$(j vault)#code"
