// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import "./dcStLedger.sol";

import "../Interfaces/StructLib.sol";
abstract contract dcStFees is dcStLedger {
	enum GetFeeType {
		CCY,
		TOK
	}

	// GLOBAL FEES
	StructLib.FeeStruct globalFees;
}
