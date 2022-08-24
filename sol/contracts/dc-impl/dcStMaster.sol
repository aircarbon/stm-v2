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
		// hasEntity(ledgerOwner) // TODO: After modularization, check that every passed address has entity
	{
		SpotFeeLib.setFee_CcyTypeBatch(ld, ctd, globalFees, params);
	}

	function setFee_TokTypeBatch(
		uint256[] calldata tokTypeId,
		address[] calldata ledgerOwner,
		StructLib.SetFeeArgs[] calldata feeArgs
	) public onlyOwner onlyWhenReadWrite 
		// hasEntity(ledgerOwner) // TODO: After modularization, check that every passed address has entity
	{
		SpotFeeLib.setFee_TokTypeBatch(ld, std, globalFees, tokTypeId, ledgerOwner, feeArgs);
	}

	/**
	 * @dev load a single or multiple security token batch(es)
	 * @param batches takes an array of security token batches
	 * @param _batches_currentMax_id total count of existing batches
	 */
	 function loadSecTokenBatch(
		StructLib.SecTokenBatch[] memory batches,
		uint64 _batches_currentMax_id
	) public onlyOwner {
		LoadLib.loadSecTokenBatch(ld, batches, _batches_currentMax_id);
	}
}
