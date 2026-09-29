// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PagarVault} from "../src/PagarVault.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";

/// Deploy + seed (PRD v3 §4.9). The deployer IS the vault owner (user wallet), so seeding works in one run.
///
/// env: OWNER_PK, AGENT, PROTOCOL_ADMIN, TREASURY, ALICE, BOB
/// optional: WBNB (default: WBNB on BSC Testnet), SEED_BNB (default 0.5 ether), MUSDT, ROUTER
///   -> set MUSDT + ROUTER to reuse existing mocks when you only need a FRESH VAULT (before recording).
contract Deploy is Script {
    bytes4 constant SEL_TRANSFER = 0xa9059cbb;
    bytes4 constant SEL_APPROVE = 0x095ea7b3;
    bytes4 constant SEL_SWAP = 0x7ff36ab5;

    function run() external {
        uint256 pk = vm.envUint("OWNER_PK");
        address owner = vm.addr(pk);
        address wbnb = vm.envOr("WBNB", address(0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd));
        uint256 seedBnb = vm.envOr("SEED_BNB", uint256(0.5 ether));
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);

        MockUSDT musdt = MockUSDT(vm.envOr("MUSDT", address(0)));
        if (address(musdt) == address(0)) musdt = new MockUSDT();
        MockRouter router = MockRouter(payable(vm.envOr("ROUTER", address(0))));
        if (address(router) == address(0)) router = new MockRouter(wbnb, musdt, 1000e18);

        PagarVault vault = new PagarVault(
            owner, vm.envAddress("AGENT"), vm.envAddress("PROTOCOL_ADMIN"), vm.envAddress("TREASURY"), 10
        );

        // BNB limits default to PRD §4.9 (0.1 / tx, 0.3 / day); scale down with BNB_MAX_TX / BNB_DAILY when tBNB is scarce
        vault.setLimit(address(0), vm.envOr("BNB_MAX_TX", uint256(0.1 ether)), vm.envOr("BNB_DAILY", uint256(0.3 ether)));
        vault.setLimit(address(musdt), 50e18, 150e18);
        vault.setMaxSlippageBps(300);
        vault.setAllowedCall(address(router), SEL_SWAP, true);
        vault.setAllowedCall(address(musdt), SEL_TRANSFER, true);
        vault.setAllowedCall(address(musdt), SEL_APPROVE, true);
        vault.setAllowedRecipient(vm.envAddress("ALICE"), true);
        vault.setAllowedRecipient(vm.envAddress("BOB"), true);
        vault.setAllowedSpender(address(router), true);
        vault.deposit{value: seedBnb}();
        musdt.mint(address(vault), 200e18);

        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "vault", address(vault));
        vm.serializeAddress(o, "musdt", address(musdt));
        vm.serializeAddress(o, "router", address(router));
        vm.serializeAddress(o, "wbnb", wbnb);
        // public addresses the agent + dashboard label and check against the allowlist (PRD §6.1, §7)
        vm.serializeAddress(o, "owner", owner);
        vm.serializeAddress(o, "agent", vault.agent());
        vm.serializeAddress(o, "treasury", vault.treasury());
        vm.serializeAddress(o, "alice", vm.envAddress("ALICE"));
        vm.serializeAddress(o, "bob", vm.envAddress("BOB"));
        vm.serializeAddress(o, "bad", vm.envOr("BAD", address(0)));
        vm.serializeString(o, "demoSwapBnb", vm.envOr("DEMO_SWAP_BNB", string("0.05")));
        string memory json = vm.serializeUint(o, "deployBlock", startBlock);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
