#!/usr/bin/env bash
# Local end-to-end chain for development: deploy + seed PagarVault on a running anvil (chainId 31337)
# and point the app at it. Start the chain first in another terminal:  anvil
# Uses anvil's well-known dev keys — never use them anywhere else.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
RPC=${RPC:-http://127.0.0.1:8545}
export PATH="$HOME/.foundry/bin:$PATH"

export OWNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil #0
export AGENT=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                               # anvil #1
export PROTOCOL_ADMIN=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                      # anvil #2
export TREASURY=$PROTOCOL_ADMIN
export ALICE=0x90F79bf6EB2c4f870365E785982E1f101E93b906                               # anvil #3
export BOB=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65                                 # anvil #4
export BAD=${BAD:-0xbAD6f16eA8Db06dD8bbaEeb7De84b81A73893Ab0}
unset MUSDT ROUTER

cd "$ROOT/contracts"
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow -q
cd "$ROOT/app"
node scripts/sync-deployment.mjs 31337

if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
  sed -i "s#^RPC_URL=.*#RPC_URL=$RPC#; s#^AGENT_PK=.*#AGENT_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d#; s#^DEMO_KEY=.*#DEMO_KEY=local#" .dev.vars
  echo "wrote app/.dev.vars (anvil agent key, DEMO_KEY=local) — add LLM_API_KEY to chat with the agent"
fi
