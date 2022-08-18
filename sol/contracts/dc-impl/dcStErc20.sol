// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import "./dcStFees.sol";

import "../Interfaces/StructLib.sol";

abstract contract dcStErc20 is dcStFees {
	StructLib.Erc20Struct erc20d;
	string public symbol;
	uint8 public decimals;
}
