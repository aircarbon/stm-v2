// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import "./dcOwned.sol";

import "../Interfaces/StructLib.sol";

abstract contract dcStLedger is dcOwned {
	StructLib.LedgerStruct ld;
	StructLib.StTypesStruct std;
	StructLib.CcyTypesStruct ctd;

	mapping(address => uint) internal entities;
	mapping(uint => address[]) internal addressesPerEntity;
}
