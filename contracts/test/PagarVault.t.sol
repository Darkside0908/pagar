// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PagarVault} from "../src/PagarVault.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";

contract RevertingReceiver {
    receive() external payable {
        revert("no");
    }
}

contract ReentrantAgent {
    PagarVault public immutable vault;

    constructor(PagarVault v) {
        vault = v;
    }

    function attack(uint256 v) external {
        vault.propose(address(this), v, "");
    }

    receive() external payable {
        vault.propose(address(this), 1, ""); // re-enter
    }
}

contract PagarVaultTest is Test {
    bytes4 constant SEL_TRANSFER = 0xa9059cbb;
    bytes4 constant SEL_APPROVE = 0x095ea7b3;
    bytes4 constant SEL_SWAP = 0x7ff36ab5;
    bytes4 constant SEL_TRANSFER_FROM = 0x23b872dd;

    uint256 constant BNB_MAX = 0.1 ether;
    uint256 constant BNB_CAP = 0.3 ether;
    uint256 constant USDT_MAX = 50e18;
    uint256 constant USDT_CAP = 150e18;
    uint256 constant T0 = 1_760_000_000;

    PagarVault vault;
    MockUSDT musdt;
    MockRouter router;

    address owner = makeAddr("owner");
    address agentAddr = makeAddr("agent");
    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address bad = makeAddr("bad");
    address wbnb = makeAddr("wbnb");

    function setUp() public {
        vm.warp(T0);
        musdt = new MockUSDT();
        router = new MockRouter(wbnb, musdt, 1000e18);
        vault = new PagarVault(owner, agentAddr, admin, treasury, 10);

        vm.startPrank(owner);
        vault.setLimit(address(0), BNB_MAX, BNB_CAP);
        vault.setLimit(address(musdt), USDT_MAX, USDT_CAP);
        vault.setMaxSlippageBps(300);
        vault.setAllowedCall(address(router), SEL_SWAP, true);
        vault.setAllowedCall(address(musdt), SEL_TRANSFER, true);
        vault.setAllowedCall(address(musdt), SEL_APPROVE, true);
        vault.setAllowedRecipient(alice, true);
        vault.setAllowedRecipient(bob, true);
        vault.setAllowedSpender(address(router), true);
        vm.stopPrank();

        vm.deal(address(this), 1 ether);
        vault.deposit{value: 0.5 ether}();
        musdt.mint(address(vault), 200e18);
    }

    // ------------------------------------------------------------------ helpers
    function _path() internal view returns (address[] memory p) {
        p = new address[](2);
        p[0] = wbnb;
        p[1] = address(musdt);
    }

    function _swapData(uint256 minOut, address to) internal view returns (bytes memory) {
        return abi.encodeWithSelector(SEL_SWAP, minOut, _path(), to, block.timestamp + 600);
    }

    function _transferData(address to, uint256 amt) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(SEL_TRANSFER, to, amt);
    }

    function _approveData(address spender, uint256 amt) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(SEL_APPROVE, spender, amt);
    }

    function _propose(address target, uint256 value, bytes memory data) internal returns (bool, uint8) {
        vm.prank(agentAddr);
        return vault.propose(target, value, data);
    }

    struct Blocked {
        address target;
        bytes4 selector;
        address asset;
        address counterparty;
        uint256 amount;
        uint8 reason;
    }

    struct Snap {
        uint256 tBnb;
        uint256 tUsdt;
        uint256 blocked;
        uint256 executed;
    }

    /// No CALL (value transfer or state-changing call) reached the target. A STATICCALL (router quote) is fine.
    function _assertNeverCalled(VmSafe.AccountAccess[] memory acc, address target) internal pure {
        for (uint256 i; i < acc.length; i++) {
            assertFalse(
                acc[i].account == target && acc[i].kind == VmSafe.AccountAccessKind.Call, "target was called"
            );
        }
    }

    function _snap() internal view returns (Snap memory) {
        return Snap(treasury.balance, musdt.balanceOf(treasury), vault.blockedCount(), vault.executedCount());
    }

    /// Asserts: returns (false, reason) · ActionBlocked with that reason · target never called
    /// with this calldata · treasury receives nothing · no revert.
    function _expectBlocked(address target, uint256 value, bytes memory data, uint8 reason)
        internal
        returns (Blocked memory b)
    {
        Snap memory s0 = _snap();

        vm.startStateDiffRecording();
        vm.recordLogs();
        (bool executed, uint8 r) = _propose(target, value, data);
        _assertNeverCalled(vm.stopAndReturnStateDiff(), target);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertFalse(executed, "executed");
        assertEq(r, reason, "returned reason");
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(vault) && logs[i].topics[0] == PagarVault.ActionBlocked.selector) {
                b = abi.decode(logs[i].data, (Blocked));
                found = true;
            }
            assertTrue(logs[i].topics[0] != PagarVault.FeeCollected.selector, "fee on blocked");
        }
        assertTrue(found, "ActionBlocked not emitted");
        assertEq(b.reason, reason, "event reason");
        assertEq(treasury.balance, s0.tBnb, "treasury BNB changed");
        assertEq(musdt.balanceOf(treasury), s0.tUsdt, "treasury mUSDT changed");
        assertEq(vault.blockedCount(), s0.blocked + 1, "blockedCount");
        assertEq(vault.executedCount(), s0.executed, "executedCount");
    }

    // ------------------------------------------------------------------ auth & freeze
    function testAuth_NonAgentReverts() public {
        vm.prank(bad);
        vm.expectRevert(PagarVault.NotAgent.selector);
        vault.propose(alice, 0.01 ether, "");
    }

    function testAuth_FrozenRevertsEvenIfPolicyPasses() public {
        vm.prank(owner);
        vault.setFrozen(true);
        vm.prank(agentAddr);
        vm.expectRevert(PagarVault.VaultFrozen.selector);
        vault.propose(alice, 0.01 ether, "");
    }

    function testFrozen_OwnerCanStillWithdraw() public {
        vm.prank(owner);
        vault.setFrozen(true);
        vm.prank(owner);
        vault.withdraw(0.2 ether);
        assertEq(owner.balance, 0.2 ether);
        vm.prank(owner);
        vault.withdrawToken(address(musdt), 20e18);
        assertEq(musdt.balanceOf(owner), 20e18);
    }

    // ------------------------------------------------------------------ reason codes + order
    function testReason1_TargetSelectorNotAllowed() public {
        bytes memory d = abi.encodeWithSelector(SEL_TRANSFER_FROM, address(vault), bad, 1e18);
        _expectBlocked(address(musdt), 0, d, 1);
        MockUSDT other = new MockUSDT();
        other.mint(address(vault), 10e18);
        _expectBlocked(address(other), 0, _transferData(alice, 1e18), 1);
    }

    function testReason2_ExceedsMaxPerTx() public {
        _expectBlocked(alice, BNB_MAX + 1, "", 2);
    }

    function testReason3_DailyCapExceeded() public {
        for (uint256 i; i < 3; i++) {
            (bool ok,) = _propose(alice, BNB_MAX, "");
            assertTrue(ok);
        }
        _expectBlocked(alice, 0.01 ether, "", 3);
    }

    function testDailyWindow_Boundary_86399NoReset_86400Reset() public {
        for (uint256 i; i < 3; i++) {
            (bool ok,) = _propose(alice, BNB_MAX, "");
            assertTrue(ok);
        }
        vm.warp(T0 + 86_399);
        _expectBlocked(alice, 0.01 ether, "", 3);
        assertEq(vault.remainingToday(address(0)), 0);
        vm.warp(T0 + 86_400);
        assertEq(vault.remainingToday(address(0)), BNB_CAP);
        (bool ok2,) = _propose(alice, 0.01 ether, "");
        assertTrue(ok2);
    }

    function testReason4_NativeSendFullBalanceToBad() public {
        uint256 bal = address(vault).balance; // 0.5 BNB > maxPerTx, still reason 4
        Blocked memory b = _expectBlocked(bad, bal, "", 4);
        assertEq(b.asset, address(0));
        assertEq(b.counterparty, bad);
        assertEq(b.amount, bal);
        assertEq(b.selector, bytes4(0));
    }

    function testReason4_TokenTransferRecipientNotAllowed() public {
        Blocked memory b = _expectBlocked(address(musdt), 0, _transferData(bad, 10e18), 4);
        assertEq(b.asset, address(musdt));
        assertEq(b.counterparty, bad);
        assertEq(b.amount, 10e18);
    }

    function testReason4_SwapToNotVault() public {
        _expectBlocked(address(router), 0.05 ether, _swapData(49.5e18, bad), 4);
    }

    function testReason5_UnlimitedApproveToAllowedSpender() public {
        Blocked memory b = _expectBlocked(address(musdt), 0, _approveData(address(router), type(uint256).max), 5);
        assertEq(b.counterparty, address(router));
        assertEq(b.amount, type(uint256).max);
    }

    function testReason6_UnlimitedApproveToUnknownSpender() public {
        _expectBlocked(address(musdt), 0, _approveData(bad, type(uint256).max), 6);
    }

    function testReason7_SlippageMinOutZero() public {
        _expectBlocked(address(router), 0.05 ether, _swapData(0, address(vault)), 7);
    }

    function testReason7_QuoteFails() public {
        address[] memory p = new address[](2);
        p[0] = wbnb;
        p[1] = bad; // router.getAmountsOut reverts BadPath
        bytes memory d = abi.encodeWithSelector(SEL_SWAP, 49.5e18, p, address(vault), block.timestamp + 600);
        _expectBlocked(address(router), 0.05 ether, d, 7);
    }

    function testReason8_ShortCalldata() public {
        Blocked memory b = _expectBlocked(address(musdt), 0, hex"a905", 8);
        assertEq(b.selector, bytes4(0));
    }

    function testReason8_WhitelistedSelectorWithoutDecoder() public {
        vm.prank(owner);
        vault.setAllowedCall(address(musdt), SEL_TRANSFER_FROM, true);
        _expectBlocked(address(musdt), 0, abi.encodeWithSelector(SEL_TRANSFER_FROM, address(vault), bad, 1e18), 8);
    }

    function testReason8_MalformedCalldataDoesNotRevert() public {
        _expectBlocked(address(musdt), 0, abi.encodePacked(SEL_TRANSFER, uint8(1)), 8);
        _expectBlocked(address(musdt), 0, abi.encodePacked(SEL_APPROVE, bytes31(0)), 8);
        _expectBlocked(address(router), 0.05 ether, abi.encodePacked(SEL_SWAP, uint256(1), uint256(0xffff)), 8);
        // dirty upper bits in the address word -> abi.decode reverts inside the self-call
        _expectBlocked(address(musdt), 0, abi.encodePacked(SEL_TRANSFER, bytes32(type(uint256).max), uint256(1)), 8);
        // path with a single hop
        address[] memory p = new address[](1);
        p[0] = wbnb;
        _expectBlocked(
            address(router),
            0.05 ether,
            abi.encodeWithSelector(SEL_SWAP, 1, p, address(vault), block.timestamp + 600),
            8
        );
    }

    function testReason8_ValueOnTokenCall() public {
        _expectBlocked(address(musdt), 1, _transferData(alice, 1e18), 8);
    }

    function testApprove_NearMaxCaughtByReason2() public {
        _expectBlocked(address(musdt), 0, _approveData(address(router), type(uint256).max - 1), 2);
    }

    // ------------------------------------------------------------------ decoder & accounting
    function testDecoder_MatchesCastCalldata() public view {
        // generated with `cast calldata ...` (Foundry 1.5.1)
        bytes memory t =
            hex"a9059cbb00000000000000000000000099999999999999999999999999999999999999990000000000000000000000000000000000000000000000000de0b6b3a7640000";
        bytes memory a =
            hex"095ea7b30000000000000000000000008888888888888888888888888888888888888888ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        bytes memory s =
            hex"7ff36ab5000000000000000000000000000000000000000000000002aef353bcddd600000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000555555555555555555555555555555555555555500000000000000000000000000000000000000000000000000000002540be3ff000000000000000000000000000000000000000000000000000000000000000200000000000000000000000077777777777777777777777777777777777777770000000000000000000000006666666666666666666666666666666666666666";

        (address who, uint256 amt) = vault.decodeAddrAmount(t);
        assertEq(who, 0x9999999999999999999999999999999999999999);
        assertEq(amt, 1e18);
        assertEq(t, abi.encodeWithSelector(SEL_TRANSFER, who, amt));

        (who, amt) = vault.decodeAddrAmount(a);
        assertEq(who, 0x8888888888888888888888888888888888888888);
        assertEq(amt, type(uint256).max);
        assertEq(a, abi.encodeWithSelector(SEL_APPROVE, who, amt));

        (uint256 minOut, address[] memory path, address to, uint256 deadline) = vault.decodeSwap(s);
        assertEq(minOut, 49.5e18);
        assertEq(path.length, 2);
        assertEq(path[0], 0x7777777777777777777777777777777777777777);
        assertEq(path[1], 0x6666666666666666666666666666666666666666);
        assertEq(to, 0x5555555555555555555555555555555555555555);
        assertEq(deadline, 9_999_999_999);
        assertEq(s, abi.encodeWithSelector(SEL_SWAP, minOut, path, to, deadline));
    }

    function testCaps_ArePerAsset() public {
        // 40 mUSDT would exceed the BNB cap (0.1e18) if caps were shared
        (bool ok,) = _propose(address(musdt), 0, _transferData(alice, 40e18));
        assertTrue(ok);
        assertEq(vault.remainingToday(address(musdt)), USDT_CAP - 40e18);
        assertEq(vault.remainingToday(address(0)), BNB_CAP);
        _expectBlocked(alice, BNB_MAX + 1, "", 2);
        _expectBlocked(address(musdt), 0, _transferData(alice, USDT_MAX + 1), 2);
    }

    function testSpent_OnlyIncreasesOnPass() public {
        for (uint256 i; i < 10; i++) {
            _expectBlocked(bad, BNB_MAX, "", 4);
        }
        assertEq(vault.remainingToday(address(0)), BNB_CAP);
        (bool ok,) = _propose(alice, 0.1 ether, "");
        assertTrue(ok);
        (ok,) = _propose(alice, 0.1 ether, "");
        assertTrue(ok);
        (ok,) = _propose(alice, 0.05 ether, "");
        assertTrue(ok);
        for (uint256 i; i < 10; i++) {
            _expectBlocked(alice, 0.1 ether, "", 3);
        }
        assertEq(vault.remainingToday(address(0)), 0.05 ether);
    }

    function testNonce_IncrementsOnBlockedAndExecuted() public {
        _expectBlocked(bad, 0.01 ether, "", 4);
        assertEq(vault.nonce(), 1);
        (bool ok,) = _propose(alice, 0.01 ether, "");
        assertTrue(ok);
        assertEq(vault.nonce(), 2);
    }

    // ------------------------------------------------------------------ fee
    function testFee_OnlyOnExecuted() public {
        _expectBlocked(bad, 0.05 ether, "", 4); // asserts treasury unchanged
        assertEq(vault.feesCollected(address(0)), 0);
        (bool ok,) = _propose(alice, 0.05 ether, "");
        assertTrue(ok);
        assertEq(treasury.balance, 0.00005 ether);
    }

    function testFee_OnTopNative() public {
        uint256 v0 = address(vault).balance;
        vm.expectEmit(true, true, false, true, address(vault));
        emit PagarVault.ActionExecuted(1, agentAddr, alice, bytes4(0), address(0), alice, 0.05 ether, 0.00005 ether);
        (bool ok, uint8 r) = _propose(alice, 0.05 ether, "");
        assertTrue(ok);
        assertEq(r, 0);
        assertEq(alice.balance, 0.05 ether, "recipient gets full value");
        assertEq(treasury.balance, 0.00005 ether, "treasury gets fee");
        assertEq(address(vault).balance, v0 - 0.05005 ether, "vault pays value + fee");
    }

    function testFee_OnTopToken() public {
        uint256 v0 = musdt.balanceOf(address(vault));
        (bool ok,) = _propose(address(musdt), 0, _transferData(alice, 10e18));
        assertTrue(ok);
        assertEq(musdt.balanceOf(alice), 10e18);
        assertEq(musdt.balanceOf(treasury), 0.01e18);
        assertEq(musdt.balanceOf(address(vault)), v0 - 10.01e18);
    }

    function testFee_SwapRouterGetsFullValue() public {
        uint256 v0 = address(vault).balance;
        (bool ok,) = _propose(address(router), 0.05 ether, _swapData(49.5e18, address(vault)));
        assertTrue(ok);
        assertEq(address(router).balance, 0.05 ether, "router gets full value");
        assertEq(treasury.balance, 0.00005 ether);
        assertEq(address(vault).balance, v0 - 0.05005 ether);
        assertEq(musdt.balanceOf(address(vault)), 250e18, "swap output lands in vault");
    }

    function testFee_ApproveIsZero() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit PagarVault.ActionExecuted(1, agentAddr, address(musdt), SEL_APPROVE, address(musdt), address(router), 10e18, 0);
        (bool ok,) = _propose(address(musdt), 0, _approveData(address(router), 10e18));
        assertTrue(ok);
        assertEq(musdt.allowance(address(vault), address(router)), 10e18);
        assertEq(musdt.balanceOf(treasury), 0);
        (, uint256 spent) = vault.windowOf(address(musdt));
        assertEq(spent, 10e18, "approve counts toward the cap");
    }

    function testFee_OnlyProtocolAdminCanSet() public {
        vm.prank(owner);
        vm.expectRevert(PagarVault.NotProtocolAdmin.selector);
        vault.setFeeConfig(owner, 0);
        vm.prank(admin);
        vault.setFeeConfig(treasury, 50);
        assertEq(vault.feeBps(), 50);
    }

    function testFee_CapAt100Bps() public {
        vm.prank(admin);
        vm.expectRevert(PagarVault.FeeTooHigh.selector);
        vault.setFeeConfig(treasury, 101);
        vm.prank(admin);
        vault.setFeeConfig(treasury, 100);
        vm.expectRevert(PagarVault.FeeTooHigh.selector);
        new PagarVault(owner, agentAddr, admin, treasury, 101);
    }

    function testFee_ZeroBpsNoTransfer() public {
        vm.prank(admin);
        vault.setFeeConfig(treasury, 0);
        vm.recordLogs();
        (bool ok,) = _propose(alice, 0.05 ether, "");
        assertTrue(ok);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != PagarVault.FeeCollected.selector);
        }
        assertEq(treasury.balance, 0);
        assertEq(vault.feesCollected(address(0)), 0);
    }

    function testFeesCollected_AccumulatesPerAsset() public {
        _propose(address(router), 0.05 ether, _swapData(49.5e18, address(vault)));
        _propose(alice, 0.02 ether, "");
        _propose(address(musdt), 0, _transferData(bob, 10e18));
        assertEq(vault.feesCollected(address(0)), 0.00007 ether);
        assertEq(vault.feesCollected(address(musdt)), 0.01e18);
    }

    // ------------------------------------------------------------------ execution & security
    function testExecutionFailure_RevertsAndRollsBackState() public {
        RevertingReceiver rr = new RevertingReceiver();
        vm.prank(owner);
        vault.setAllowedRecipient(address(rr), true);
        vm.prank(agentAddr);
        vm.expectPartialRevert(PagarVault.ExecutionFailed.selector);
        vault.propose(address(rr), 0.01 ether, "");
        assertEq(vault.nonce(), 0);
        assertEq(vault.executedCount(), 0);
        assertEq(vault.feesCollected(address(0)), 0);
        (, uint256 spent) = vault.windowOf(address(0));
        assertEq(spent, 0);
        assertEq(treasury.balance, 0);
    }

    function testExecutionFailure_TokenInsufficientBalance() public {
        vm.prank(owner);
        vault.setLimit(address(musdt), 1_000e18, 1_000e18);
        vm.prank(agentAddr);
        vm.expectRevert(); // fee transfer or token transfer fails -> whole tx reverts
        vault.propose(address(musdt), 0, _transferData(alice, 500e18));
        assertEq(vault.nonce(), 0);
    }

    function testFeeTransferFailure_Reverts() public {
        RevertingReceiver rr = new RevertingReceiver();
        vm.prank(admin);
        vault.setFeeConfig(address(rr), 10);
        vm.prank(agentAddr);
        vm.expectRevert(PagarVault.FeeTransferFailed.selector);
        vault.propose(alice, 0.01 ether, "");
    }

    function testReentrancy_ProposeGuarded() public {
        ReentrantAgent ra = new ReentrantAgent(vault);
        vm.startPrank(owner);
        vault.setAgent(address(ra));
        vault.setAllowedRecipient(address(ra), true);
        vm.stopPrank();
        vm.expectRevert(
            abi.encodeWithSelector(
                PagarVault.ExecutionFailed.selector,
                abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
            )
        );
        ra.attack(0.01 ether);
        assertEq(vault.nonce(), 0);
        assertEq(vault.executedCount(), 0);
    }

    function testWithdraw_OnlyOwner() public {
        vm.prank(agentAddr);
        vm.expectRevert(PagarVault.NotOwner.selector);
        vault.withdraw(0.1 ether);
        vm.prank(owner);
        vault.withdraw(0.1 ether);
        assertEq(owner.balance, 0.1 ether);
    }

    function testWithdrawToken_OnlyOwner() public {
        vm.prank(agentAddr);
        vm.expectRevert(PagarVault.NotOwner.selector);
        vault.withdrawToken(address(musdt), 1e18);
        vm.prank(owner);
        vault.withdrawToken(address(musdt), 1e18);
        assertEq(musdt.balanceOf(owner), 1e18);
    }

    function testSetters_OnlyOwner() public {
        address[2] memory callers = [agentAddr, admin];
        for (uint256 i; i < 2; i++) {
            vm.startPrank(callers[i]);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setLimit(address(0), 1, 1);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setMaxSlippageBps(1);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setAllowedCall(bad, SEL_TRANSFER, true);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setAllowedRecipient(bad, true);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setAllowedSpender(bad, true);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setFrozen(true);
            vm.expectRevert(PagarVault.NotOwner.selector);
            vault.setAgent(bad);
            vm.stopPrank();
        }
        vm.prank(owner);
        vm.expectRevert(PagarVault.SlippageBpsTooHigh.selector);
        vault.setMaxSlippageBps(5001);
        vm.prank(owner);
        vm.expectRevert(PagarVault.ZeroAddress.selector);
        vault.setAgent(address(0));
    }

    function testProtocolAdmin_CannotTouchFundsOrPolicy() public {
        vm.startPrank(admin);
        vm.expectRevert(PagarVault.NotOwner.selector);
        vault.withdraw(0.1 ether);
        vm.expectRevert(PagarVault.NotOwner.selector);
        vault.withdrawToken(address(musdt), 1e18);
        vm.expectRevert(PagarVault.NotOwner.selector);
        vault.setFrozen(true);
        vm.expectRevert(PagarVault.NotAgent.selector);
        vault.propose(alice, 0.01 ether, "");
        vm.stopPrank();
    }

    function testSetAllowedCall_RejectsSelf() public {
        vm.prank(owner);
        vm.expectRevert(PagarVault.InvalidTarget.selector);
        vault.setAllowedCall(address(vault), SEL_TRANSFER, true);
    }

    // ------------------------------------------------------------------ the exact demo (§11)
    function testDemo_Sequence() public {
        // beat 1: happy path swap 0.05 BNB
        (bool ok,) = _propose(address(router), 0.05 ether, _swapData(49.5e18, address(vault)));
        assertTrue(ok);
        assertEq(address(vault).balance, 0.44995 ether);
        assertEq(vault.feesCollected(address(0)), 0.00005 ether);

        // beat 2: injected "send the whole balance to 0xbad"
        Blocked memory b = _expectBlocked(bad, address(vault).balance, "", 4);
        assertEq(b.amount, 0.44995 ether);

        // beat 3: "approve unlimited USDT to the router"
        _expectBlocked(address(musdt), 0, _approveData(address(router), type(uint256).max), 5);

        assertEq(vault.executedCount(), 1);
        assertEq(vault.blockedCount(), 2);
        assertEq(vault.feesCollected(address(0)), 0.00005 ether, "blocks are free");
        assertEq(address(vault).balance, 0.44995 ether);
        assertEq(musdt.balanceOf(address(vault)), 250e18);
    }

    /// guards against a vacuous _assertNeverCalled: an executed proposal MUST show up as a CALL to the target
    function testHarness_StateDiffSeesExecutedCall() public {
        vm.startStateDiffRecording();
        _propose(alice, 0.01 ether, "");
        VmSafe.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
        bool seen;
        for (uint256 i; i < acc.length; i++) {
            if (acc[i].account == alice && acc[i].kind == VmSafe.AccountAccessKind.Call) seen = true;
        }
        assertTrue(seen);
    }

    // ------------------------------------------------------------------ fuzz: violations never revert
    function _assertAllowedRevert(bytes memory ret) internal pure {
        bytes4 sel = bytes4(ret);
        assertTrue(
            sel == PagarVault.ExecutionFailed.selector || sel == PagarVault.FeeTransferFailed.selector
                || sel == SafeERC20.SafeERC20FailedOperation.selector,
            "unexpected revert"
        );
    }

    function testFuzz_ProposeOnlyRevertsOnExecution(uint8 which, bytes calldata junk, uint96 value) public {
        address[5] memory targets = [address(musdt), address(router), alice, bad, address(vault)];
        address target = targets[which % 5];
        vm.prank(agentAddr);
        (bool ok, bytes memory ret) = address(vault).call(abi.encodeCall(PagarVault.propose, (target, value, junk)));
        if (!ok) _assertAllowedRevert(ret);
        else {
            (bool executed, uint8 reason) = abi.decode(ret, (bool, uint8));
            if (!executed) assertTrue(reason >= 1 && reason <= 8);
        }
    }

    function testFuzz_DecoderJunkNeverReverts(uint8 which, bytes calldata tail, uint96 value) public {
        bytes4[3] memory sels = [SEL_TRANSFER, SEL_APPROVE, SEL_SWAP];
        bytes4 sel = sels[which % 3];
        address target = sel == SEL_SWAP ? address(router) : address(musdt);
        bytes memory data = abi.encodePacked(sel, tail);
        vm.prank(agentAddr);
        (bool ok, bytes memory ret) = address(vault).call(abi.encodeCall(PagarVault.propose, (target, value, data)));
        if (!ok) _assertAllowedRevert(ret);
    }
}
