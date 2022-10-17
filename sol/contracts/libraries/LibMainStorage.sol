// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import { StructLib } from "./StructLib.sol";

library LibMainStorage {
	struct MainStorage {
		address payable deploymentOwner;
		bool readOnlyState;
		address[] owners;
		StructLib.CustodyType custodyType;
		StructLib.Erc20Struct erc20d;
		string symbol;
		uint8 decimals;
		StructLib.LedgerStruct ld;
		StructLib.StTypesStruct std;
		StructLib.CcyTypesStruct ctd;
		mapping(address => uint256) entitiesPerAddress;
		mapping(uint256 => address[]) addressesPerEntity;
		string name;
		string version;
		string unit; // the smallest (integer, non-divisible) security token unit, e.g. "KGs" or "TONS"
		mapping(uint => StructLib.FeeStruct) entityGlobalFees;
		mapping(uint => bool) entityExists;
		uint[] entities;
		mapping(uint => address) feeAddrPerEntity;
	}

	bytes32 constant STORAGE_POSITION = keccak256("diamond.standard.diamond.storage1");

	function getStorage() public pure returns (MainStorage storage ds) {
		bytes32 position = STORAGE_POSITION;
		assembly {
			ds.slot := position
		}
	}
}
