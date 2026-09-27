#!/usr/bin/env bash
# Top up the agent's gas from the OWNER wallet (the agent only ever pays gas; ~0.13 gwei on testnet).
#   scripts/fund-agent.sh [amount=0.01ether]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$ROOT/contracts/.env"; set +a
cast send "$AGENT" --value "${1:-0.01ether}" --private-key "$OWNER_PK" --rpc-url "$BSC_TESTNET_RPC" --legacy --gas-price "${GAS_PRICE:-200000000}" --json | jq -r '"funded agent: \(.transactionHash)"'
cast balance "$AGENT" --ether --rpc-url "$BSC_TESTNET_RPC"
