// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

/// @title PagarVault — reference implementation of PRD v3 §4
/// @notice Agent can only PROPOSE. Policy violations are logged (ActionBlocked), never reverted.
contract PagarVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- reason codes (§4.2)
    uint8 public constant OK = 0;
    uint8 public constant TARGET_NOT_ALLOWED = 1;
    uint8 public constant EXCEEDS_MAX_PER_TX = 2;
    uint8 public constant DAILY_CAP_EXCEEDED = 3;
    uint8 public constant RECIPIENT_NOT_ALLOWED = 4;
    uint8 public constant UNLIMITED_APPROVAL = 5;
    uint8 public constant SPENDER_NOT_ALLOWED = 6;
    uint8 public constant SLIPPAGE_TOO_HIGH = 7;
    uint8 public constant UNDECODABLE_CALLDATA = 8;

    bytes4 internal constant SEL_TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 internal constant SEL_APPROVE = 0x095ea7b3; // approve(address,uint256)
    bytes4 internal constant SEL_SWAP = 0x7ff36ab5; // swapExactETHForTokens(uint256,address[],address,uint256)

    enum Kind {
        NATIVE,
        TRANSFER,
        APPROVE,
        SWAP
    }

    struct Action {
        Kind kind;
        bytes4 selector;
        address asset;
        address counterparty;
        uint256 amount;
        uint256 minOut;
        address[] path;
    }

    struct Limit {
        uint256 maxPerTx;
        uint256 dailyCap;
    }

    struct Window {
        uint64 start;
        uint256 spent;
    }

    // ---------------------------------------------------------------- roles
    address public immutable protocolAdmin;
    address public owner;
    address public agent;
    address public treasury;
    uint16 public feeBps;
    uint16 public constant MAX_FEE_BPS = 100;
    uint16 public constant MAX_SLIPPAGE_BPS = 5000;

    // ---------------------------------------------------------------- state
    bool public frozen;
    uint256 public nonce;
    uint256 public executedCount;
    uint256 public blockedCount;

    mapping(address => Limit) public limitOf;
    mapping(address => Window) public windowOf;
    uint16 public maxSlippageBps;

    mapping(address => mapping(bytes4 => bool)) public allowedCall;
    mapping(address => bool) public allowedRecipient;
    mapping(address => bool) public allowedSpender;

    mapping(address => uint256) public feesCollected;

    // ---------------------------------------------------------------- events
    event ActionExecuted(
        uint256 indexed nonce,
        address indexed agent,
        address target,
        bytes4 selector,
        address asset,
        address counterparty,
        uint256 amount,
        uint256 fee
    );
    event ActionBlocked(
        uint256 indexed nonce,
        address indexed agent,
        address target,
        bytes4 selector,
        address asset,
        address counterparty,
        uint256 amount,
        uint8 reason
    );
    event FeeCollected(address indexed treasury, address indexed asset, uint256 amount);
    event FeeConfigSet(address treasury, uint16 feeBps);
    event LimitSet(address indexed asset, uint256 maxPerTx, uint256 dailyCap);
    event MaxSlippageSet(uint16 bps);
    event AllowedCallSet(address indexed target, bytes4 indexed selector, bool ok);
    event AllowedRecipientSet(address indexed to, bool ok);
    event AllowedSpenderSet(address indexed spender, bool ok);
    event FrozenSet(bool frozen, address by);
    event AgentSet(address agent);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed asset, uint256 amount);

    // ---------------------------------------------------------------- errors
    error NotAgent();
    error NotOwner();
    error NotProtocolAdmin();
    error VaultFrozen();
    error ZeroAddress();
    error FeeTooHigh();
    error SlippageBpsTooHigh();
    error InvalidTarget();
    error ExecutionFailed(bytes returnData);
    error FeeTransferFailed();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProtocolAdmin() {
        if (msg.sender != protocolAdmin) revert NotProtocolAdmin();
        _;
    }

    constructor(address owner_, address agent_, address protocolAdmin_, address treasury_, uint16 feeBps_) {
        if (owner_ == address(0) || agent_ == address(0) || protocolAdmin_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        owner = owner_;
        agent = agent_;
        protocolAdmin = protocolAdmin_;
        treasury = treasury_;
        feeBps = feeBps_;
        emit AgentSet(agent_);
        emit FeeConfigSet(treasury_, feeBps_);
    }

    // ================================================================ entry point (§4.3)
    function propose(address target, uint256 value, bytes calldata data)
        external
        nonReentrant
        returns (bool executed, uint8 reason)
    {
        if (msg.sender != agent) revert NotAgent();
        if (frozen) revert VaultFrozen();
        uint256 n = ++nonce;

        Action memory a;
        a.amount = value; // default for fields not yet decoded

        // ---- A. classify & decode
        if (data.length == 0) {
            a.kind = Kind.NATIVE;
            a.counterparty = target; // asset = address(0), selector = 0x00000000
        } else {
            if (data.length < 4) return _block(n, target, a, UNDECODABLE_CALLDATA);
            a.selector = bytes4(data[:4]);
            if (!allowedCall[target][a.selector]) return _block(n, target, a, TARGET_NOT_ALLOWED);

            if (a.selector == SEL_TRANSFER || a.selector == SEL_APPROVE) {
                try this.decodeAddrAmount(data) returns (address who, uint256 amt) {
                    if (value != 0) return _block(n, target, a, UNDECODABLE_CALLDATA);
                    a.kind = a.selector == SEL_TRANSFER ? Kind.TRANSFER : Kind.APPROVE;
                    a.asset = target;
                    a.amount = amt;
                    a.counterparty = who;
                } catch {
                    return _block(n, target, a, UNDECODABLE_CALLDATA);
                }
            } else if (a.selector == SEL_SWAP) {
                try this.decodeSwap(data) returns (uint256 minOut, address[] memory path, address to, uint256) {
                    if (path.length < 2) return _block(n, target, a, UNDECODABLE_CALLDATA);
                    a.kind = Kind.SWAP;
                    a.counterparty = to; // asset = address(0), amount = value
                    a.minOut = minOut;
                    a.path = path;
                } catch {
                    return _block(n, target, a, UNDECODABLE_CALLDATA);
                }
            } else {
                return _block(n, target, a, UNDECODABLE_CALLDATA);
            }
        }

        // ---- B. counterparty
        if (a.kind == Kind.NATIVE || a.kind == Kind.TRANSFER) {
            if (!allowedRecipient[a.counterparty]) return _block(n, target, a, RECIPIENT_NOT_ALLOWED);
        } else if (a.kind == Kind.SWAP) {
            if (a.counterparty != address(this)) return _block(n, target, a, RECIPIENT_NOT_ALLOWED);
        } else {
            if (!allowedSpender[a.counterparty]) return _block(n, target, a, SPENDER_NOT_ALLOWED);
            if (a.amount == type(uint256).max) return _block(n, target, a, UNLIMITED_APPROVAL);
        }

        // ---- C. amount, per asset
        Limit memory lim = limitOf[a.asset];
        if (a.amount > lim.maxPerTx) return _block(n, target, a, EXCEEDS_MAX_PER_TX);
        Window storage w = windowOf[a.asset];
        if (block.timestamp >= uint256(w.start) + 1 days) {
            w.start = uint64(block.timestamp);
            w.spent = 0;
        }
        // overflow-safe form of: w.spent + a.amount > lim.dailyCap
        if (w.spent > lim.dailyCap || a.amount > lim.dailyCap - w.spent) {
            return _block(n, target, a, DAILY_CAP_EXCEEDED);
        }

        // ---- D. slippage (SWAP only)
        if (a.kind == Kind.SWAP) {
            try IRouter(target).getAmountsOut(a.amount, a.path) returns (uint256[] memory amounts) {
                if (amounts.length == 0) return _block(n, target, a, SLIPPAGE_TOO_HIGH);
                uint256 floor = Math.mulDiv(amounts[amounts.length - 1], 10_000 - maxSlippageBps, 10_000);
                if (a.minOut < floor) return _block(n, target, a, SLIPPAGE_TOO_HIGH);
            } catch {
                return _block(n, target, a, SLIPPAGE_TOO_HIGH);
            }
        }

        // ---- E. PASS
        return _execute(n, target, value, data, a);
    }

    // ================================================================ execution (§4.4)
    function _execute(uint256 n, address target, uint256 value, bytes calldata data, Action memory a)
        internal
        returns (bool, uint8)
    {
        windowOf[a.asset].spent += a.amount; // ONLY here
        uint256 fee = (a.kind == Kind.APPROVE || feeBps == 0) ? 0 : Math.mulDiv(a.amount, feeBps, 10_000);
        if (fee > 0) feesCollected[a.asset] += fee;
        executedCount++;
        // ---- all state changes done before external calls (CEI)

        if (fee > 0) {
            if (a.asset == address(0)) {
                (bool okFee,) = treasury.call{value: fee}("");
                if (!okFee) revert FeeTransferFailed();
            } else {
                IERC20(a.asset).safeTransfer(treasury, fee);
            }
            emit FeeCollected(treasury, a.asset, fee);
        }

        (bool ok, bytes memory ret) = target.call{value: value}(data); // agent calldata, VERBATIM
        if (!ok) revert ExecutionFailed(ret);
        if (a.kind == Kind.TRANSFER || a.kind == Kind.APPROVE) {
            if (ret.length == 0) {
                if (target.code.length == 0) revert ExecutionFailed(ret);
            } else if (ret.length != 32 || abi.decode(ret, (uint256)) != 1) {
                revert ExecutionFailed(ret);
            }
        }

        emit ActionExecuted(n, msg.sender, target, a.selector, a.asset, a.counterparty, a.amount, fee);
        return (true, OK);
    }

    function _block(uint256 n, address target, Action memory a, uint8 reason) internal returns (bool, uint8) {
        blockedCount++;
        emit ActionBlocked(n, msg.sender, target, a.selector, a.asset, a.counterparty, a.amount, reason);
        return (false, reason);
    }

    // ================================================================ decoders (§4.5)
    function decodeAddrAmount(bytes calldata data) external pure returns (address who, uint256 amount) {
        return abi.decode(data[4:], (address, uint256));
    }

    function decodeSwap(bytes calldata data)
        external
        pure
        returns (uint256 minOut, address[] memory path, address to, uint256 deadline)
    {
        return abi.decode(data[4:], (uint256, address[], address, uint256));
    }

    // ================================================================ views
    function remainingToday(address asset) external view returns (uint256) {
        Limit memory lim = limitOf[asset];
        Window memory w = windowOf[asset];
        if (block.timestamp >= uint256(w.start) + 1 days) return lim.dailyCap;
        return w.spent >= lim.dailyCap ? 0 : lim.dailyCap - w.spent;
    }

    // ================================================================ anyone
    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ================================================================ owner only
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(address(0), amount);
    }

    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner, amount);
        emit Withdrawn(token, amount);
    }

    function setLimit(address asset, uint256 maxPerTx, uint256 dailyCap) external onlyOwner {
        limitOf[asset] = Limit(maxPerTx, dailyCap);
        emit LimitSet(asset, maxPerTx, dailyCap);
    }

    function setMaxSlippageBps(uint16 bps) external onlyOwner {
        if (bps > MAX_SLIPPAGE_BPS) revert SlippageBpsTooHigh();
        maxSlippageBps = bps;
        emit MaxSlippageSet(bps);
    }

    function setAllowedCall(address target, bytes4 selector, bool ok) external onlyOwner {
        if (target == address(this)) revert InvalidTarget();
        allowedCall[target][selector] = ok;
        emit AllowedCallSet(target, selector, ok);
    }

    function setAllowedRecipient(address to, bool ok) external onlyOwner {
        allowedRecipient[to] = ok;
        emit AllowedRecipientSet(to, ok);
    }

    function setAllowedSpender(address spender, bool ok) external onlyOwner {
        allowedSpender[spender] = ok;
        emit AllowedSpenderSet(spender, ok);
    }

    function setFrozen(bool f) external onlyOwner {
        frozen = f;
        emit FrozenSet(f, msg.sender);
    }

    function setAgent(address a) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        agent = a;
        emit AgentSet(a);
    }

    // ================================================================ protocol admin only
    function setFeeConfig(address treasury_, uint16 feeBps_) external onlyProtocolAdmin {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        treasury = treasury_;
        feeBps = feeBps_;
        emit FeeConfigSet(treasury_, feeBps_);
    }
}
