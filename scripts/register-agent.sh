#!/usr/bin/env bash
# Register the PAGAR agent in the official ERC-8004 Identity Registry on BSC Testnet (PRD §4.7).
# Sent from the AGENT key so the identity NFT is owned by the agent address.
#   scripts/register-agent.sh https://<pages-domain>/agent.json
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
URI=${1:?usage: register-agent.sh https://<pages-domain>/agent.json}
REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e
REGISTERED_TOPIC=$(cast keccak "Registered(uint256,string,address)")
set -a; source "$ROOT/contracts/.env"; set +a

[ -n "$(cast code $REGISTRY --rpc-url "$BSC_TESTNET_RPC" | sed 's/^0x//')" ] || { echo "registry has no code on this chain — keep ERC-8004 as roadmap"; exit 1; }
RCPT=$(cast send $REGISTRY "register(string)" "$URI" --private-key "$AGENT_PK" --rpc-url "$BSC_TESTNET_RPC" \
  --legacy --gas-price "${GAS_PRICE:-200000000}" --json)
TX=$(echo "$RCPT" | jq -r .transactionHash)
ID_HEX=$(echo "$RCPT" | jq -r --arg t "$REGISTERED_TOPIC" '.logs[] | select(.topics[0] == $t) | .topics[1]')
AGENT_ID=$(cast to-dec "$ID_HEX")
echo "agentId=$AGENT_ID tx=$TX"
node "$ROOT/scripts/deployment-set.mjs" agentId=$AGENT_ID agentRegistrationTx=$TX
