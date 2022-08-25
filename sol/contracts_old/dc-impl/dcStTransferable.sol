// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
pragma solidity 0.8.5;

import "./dcStErc20.sol";
import "./dcOwned.sol";

import "../Interfaces/ReentrancyGuard.sol";

abstract contract dcStTransferable is dcOwned, dcStErc20, ReentrancyGuard {
	uint256 constant MAX_BATCHES_PREVIEW = 128; // library constants not accessible in contract; must duplicate TransferLib value
}
