// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import "./dcStLedger.sol";
import "./dcStTransferable.sol";
import "../Interfaces/StructLib.sol";
import "../Libs/LoadLib.sol";
import "../Libs/CcyLib.sol";
import "../Libs/SpotFeeLib.sol";

contract dcStMaster is dcStLedger, dcStTransferable {
	// contract properties
	string public name;
	string public version;
	string public unit; // the smallest (integer, non-divisible) security token unit, e.g. "KGs" or "TONS"

	function addSecTokenBatch(StructLib.AddSecTokenBatchArgs[] calldata params) external onlyOwner {
		LoadLib.addSecTokenBatch(ld, params);
	}

	function addCcyTypeBatch(
		string[] calldata _name,
		string[] calldata _unit,
		uint16[] calldata _decimals
	) external onlyOwner onlyWhenReadWrite {
		CcyLib.addCcyTypeBatch(ld, ctd, _name, _unit, _decimals);
	}

	function setFee_CcyTypeBatch(StructLib.SetFeeCcyTypeBatchArgs[] calldata params) 
		external 
		onlyOwner 
		onlyWhenReadWrite 
		// hasEntity(ledgerOwner) 
	{
		SpotFeeLib.setFee_CcyTypeBatch(ld, ctd, globalFees, params);
	}

	function setFee_TokType(
		uint256[] calldata tokTypeId,
		address[] calldata ledgerOwner,
		StructLib.SetFeeArgs[] calldata feeArgs
	) public onlyOwner onlyWhenReadWrite 
		// hasEntity(ledgerOwner) 
	{
		SpotFeeLib.setFee_TokTypeBatch(ld, std, globalFees, tokTypeId, ledgerOwner, feeArgs);
	}

	// function test1() external view returns(string memory) {
	// 	return unit;
	// }

	// function test2(string calldata newunit) external {
	// 	unit = newunit;
	// }
}
