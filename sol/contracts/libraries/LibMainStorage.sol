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
		StructLib.FeeStruct globalFees;
		StructLib.LedgerStruct ld;
		StructLib.StTypesStruct std;
		StructLib.CcyTypesStruct ctd;
		mapping(address => uint256) entities;
		mapping(uint256 => address[]) addressesPerEntity;
		string name;
		string version;
		string unit; // the smallest (integer, non-divisible) security token unit, e.g. "KGs" or "TONS"
	}

	struct MainStorage2 {
		mapping(uint => StructLib.FeeStruct) entityGlobalFees;
	}

	struct MainStorage3 {
		mapping(uint => bool) entityExists;
		uint[] entities;
		mapping(uint => address) feeAddrPerEntity;
	}

	bytes32 constant STORAGE_POSITION = keccak256("diamond.standard.diamond.storage1");
	bytes32 constant STORAGE_POSITION_2 = keccak256("diamond.standard.diamond.storage2");
	bytes32 constant STORAGE_POSITION_3 = keccak256("diamond.standard.diamond.storage3");

	function getStorage() public pure returns (MainStorage storage ds) {
		bytes32 position = STORAGE_POSITION;
		assembly {
			ds.slot := position
		}
	}

	function getStorage2() public pure returns (MainStorage2 storage ds) {
		bytes32 position = STORAGE_POSITION_2;
		assembly {
			ds.slot := position
		}
	}

	function getStorage3() public pure returns (MainStorage3 storage ds) {
		bytes32 position = STORAGE_POSITION_3;
		assembly {
			ds.slot := position
		}
	}
}
