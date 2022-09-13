// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { SpotFeeLib } from "../libraries/SpotFeeLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StFeesFacet {
	/**
	 * @dev returns fee structure
	 * @param feeType 0: currency fee<br/>1: token fee
	 * @param typeId fee type unique identifier
	 * @param ledgerOwner account address of the ledger owner
	 * @return fee
	 * @param fee returns the fees structure based on fee type selection args
	 */
	function getFee(
		StructLib.GetFeeType feeType,
		uint256 entityId,
		uint256 typeId,
		address ledgerOwner
	) external view returns (StructLib.SetFeeArgs memory fee) {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		StructLib.FeeStruct storage fs;

		if(ledgerOwner == address(0x0)) {
			ValidationLib.validateEntityExists(entityId);
			fs = LibMainStorage.getStorage2().feesPerEntity[entityId];
		} else {
			fs = s.ld._ledger[ledgerOwner].spot_customFees;
		}
		
		mapping(uint256 => StructLib.SetFeeArgs) storage fa = feeType == StructLib.GetFeeType.CCY
			? fs.ccy
			: fs.tok;
		return
			StructLib.SetFeeArgs({
				fee_fixed: uint256(fa[typeId].fee_fixed),
				fee_percBips: uint256(fa[typeId].fee_percBips),
				fee_min: uint256(fa[typeId].fee_min),
				fee_max: uint256(fa[typeId].fee_max),
				ccy_perMillion: uint256(fa[typeId].ccy_perMillion),
				ccy_mirrorFee: fa[typeId].ccy_mirrorFee
			});
	}

	/**
	 * @dev set fee for a token type
	 * @param tokTypeId token type identifier
	 * @param ledgerOwner account address of the ledger owner
	 * @param feeArgs fee_fixed: fixed fee on transfer or trade</br>
	 * fee_percBips: fixed fee % on transfer or trade</br>
	 * fee_min: minimum fee on transfer or trade - collar/br>
	 * fee_max: maximum fee on transfer or trade - cap</br>
	 * ccy_perMillion: N/A</br>
	 * ccy_mirrorFee: N/A
	 */
	function setFee_TokType(
		uint entityId,
		uint256 tokTypeId,
		address ledgerOwner,
		StructLib.SetFeeArgs memory feeArgs
	) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateEntityExists(entityId);
		ValidationLib.validateHasEntity(ledgerOwner);

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		SpotFeeLib.setFee_TokType(s.ld, s.std, LibMainStorage.getStorage2().feesPerEntity, entityId, tokTypeId, ledgerOwner, feeArgs);
	}

	function setFee_TokTypeBatch(
		uint256[] calldata entityId,
		uint256[] calldata tokTypeId,
		address[] calldata ledgerOwner,
		StructLib.SetFeeArgs[] calldata feeArgs
	) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		uint256 len = ledgerOwner.length;
		for (uint256 i = 0; i < len; i++) {
			ValidationLib.validateEntityExists(entityId[i]);
			ValidationLib.validateHasEntity(ledgerOwner[i]);
		}

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		SpotFeeLib.setFee_TokTypeBatch(s.ld, s.std, LibMainStorage.getStorage2().feesPerEntity, entityId, tokTypeId, ledgerOwner, feeArgs);
	}

	/**
	 * @dev set fee for a currency type
	 * @param ccyTypeId currency type identifier
	 * @param ledgerOwner account address of the ledger owner
	 * @param feeArgs fee_fixed: fixed fee on transfer or trade</br>
	 * fee_percBips: fixed fee % on transfer or trade</br>
	 * fee_min: minimum fee on transfer or trade - collar/br>
	 * fee_max: maximum fee on transfer or trade - cap</br>
	 * ccy_perMillion: trade - fixed ccy fee per million of trade counterparty's consideration token qty</br>
	 * ccy_mirrorFee: trade - apply this ccy fee structure to counterparty's ccy balance, post trade
	 */
	function setFee_CcyType(
		uint entityId,
		uint256 ccyTypeId,
		address ledgerOwner,
		StructLib.SetFeeArgs memory feeArgs
	) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateEntityExists(entityId);
		ValidationLib.validateHasEntity(ledgerOwner);

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		SpotFeeLib.setFee_CcyType(s.ld, s.ctd, LibMainStorage.getStorage2().feesPerEntity, entityId, ccyTypeId, ledgerOwner, feeArgs);
	}

	function setFee_CcyTypeBatch(StructLib.SetFeeCcyTypeBatchArgs[] calldata params) external {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		uint256 len = params.length;
		for (uint256 i = 0; i < len; i++) {
			ValidationLib.validateHasEntity(params[i].ledgerOwner);
			ValidationLib.validateEntityExists(params[i].entityId);
		}

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		SpotFeeLib.setFee_CcyTypeBatch(s.ld, s.ctd, LibMainStorage.getStorage2().feesPerEntity, params);
	}
}
