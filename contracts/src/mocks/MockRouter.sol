// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDT} from "./MockUSDT.sol";

/// @notice PancakeSwap-V2-compatible selectors, fixed rate, mints mUSDT. TESTNET ONLY.
contract MockRouter {
    address public immutable WETH; // WBNB testnet or a dummy — only used to validate the path
    MockUSDT public immutable token;
    address public immutable admin;
    uint256 public rate; // mUSDT per 1 BNB (1e18)

    error NotAdmin();
    error BadPath();
    error Expired();
    error InsufficientOutput();
    error SweepFailed();

    constructor(address weth_, MockUSDT token_, uint256 rate_) {
        WETH = weth_;
        token = token_;
        rate = rate_;
        admin = msg.sender;
    }

    function setRate(uint256 r) external {
        if (msg.sender != admin) revert NotAdmin();
        rate = r;
    }

    /// @notice recover tBNB collected by swaps (testnet faucets are rate-limited)
    function sweep(address payable to) external {
        if (msg.sender != admin) revert NotAdmin();
        (bool ok,) = to.call{value: address(this).balance}("");
        if (!ok) revert SweepFailed();
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) public view returns (uint256[] memory amounts) {
        if (path.length != 2 || path[0] != WETH || path[1] != address(token)) revert BadPath();
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn * rate / 1e18;
    }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        if (deadline < block.timestamp) revert Expired();
        amounts = getAmountsOut(msg.value, path);
        if (amounts[1] < amountOutMin) revert InsufficientOutput();
        token.mint(to, amounts[1]);
    }
}
