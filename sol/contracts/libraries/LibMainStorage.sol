// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
/******************************************************************************/
import { IDiamondCut } from "../interfaces/IDiamondCut.sol";
import { StructLib } from "./StructLib.sol";

// Remember to add the loupe functions from DiamondLoupeFacet to the diamond.
// The loupe functions are required by the EIP2535 Diamonds standard

library LibMainStorage {
    enum GetFeeType {
		CCY,
		TOK
	}

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

        mapping(address => uint) entities;
        mapping(uint => address[]) addressesPerEntity;

        string name;
        string version;
        string unit; // the smallest (integer, non-divisible) security token unit, e.g. "KGs" or "TONS"
    }

    bytes32 constant STORAGE_POSITION = keccak256("diamond.standard.diamond.storage1");

    function getStorage() public pure returns (MainStorage storage ds) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}