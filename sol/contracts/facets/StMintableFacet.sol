// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LedgerLib } from "../libraries/LedgerLib.sol";
import { SpotFeeLib } from "../libraries/SpotFeeLib.sol";
import { TokenLib } from "../libraries/TokenLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StMintableFacet {
	/**
	 * @dev add additional meta data to a security token batch
	 * @param batchId unique identifier of the security token batch
	 * @param metaKeyNew new meta-data key
	 * @param metaValueNew new meta-data value
	 */
	function addMetaSecTokenBatch(
		uint64 batchId,
		string calldata metaKeyNew,
		string calldata metaValueNew
	) external {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		TokenLib.addMetaSecTokenBatch(
			LibMainStorage.getStorage().ld,
			batchId,
			metaKeyNew,
			metaValueNew
		);
	}

	/**
	 * @dev add additional meta data to a security token batch
	 * @param batchId unique identifier of the security token batch
	 * @param originatorFee set new originator fee value
	 */
	function setOriginatorFeeTokenBatch(uint64 batchId, StructLib.SetFeeArgs calldata originatorFee)
		external
	{
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		TokenLib.setOriginatorFeeTokenBatch(LibMainStorage.getStorage().ld, batchId, originatorFee);
	}

	/**a
	 * @dev add additional meta data to a security token batch
	 * @param batchId unique identifier of the security token batch
	 * @param origCcyFee_percBips_ExFee set new originator fee % (bips)
	 */
	function setOriginatorFeeCurrencyBatch(uint64 batchId, uint16 origCcyFee_percBips_ExFee)
		external
	{
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		TokenLib.setOriginatorFeeCurrencyBatch(
			LibMainStorage.getStorage().ld,
			batchId,
			origCcyFee_percBips_ExFee
		);
	}

	// 24k
	/**
	 * @dev returns the security token total minted quantity
	 * @return totalMintedQty
	 * @param totalMintedQty returns the security token total burned quantity
	 */
	function getSecToken_totalMintedQty() external view returns (uint256 totalMintedQty) {
		return LibMainStorage.getStorage().ld._spot_totalMintedQty;
	}

	/**
	 * @dev mint a fresh security token batch
	 * @param tokTypeId token type
	 * @param mintQty unit quantity of tokens to be minted
	 * @param mintSecTokenCount set as 1
	 * @param batchOwner account address of the issuer or batch originator
	 * @param originatorFee batch originator token fee setting on all transfers of tokens from this batch
	 * @param origCcyFee_percBips_ExFee batch originator currency fee setting on all transfers of tokens from this batch - % of exchange currency
	 * @param metaKeys meta-data keys that attribute to partial fungibility of the tokens
	 * @param metaValues meta-data values that attribute to partial fungibility of the tokens
	 */

	function mintSecTokenBatch(
		uint256 tokTypeId,
		uint256 mintQty,
		int64 mintSecTokenCount,
		address payable batchOwner,
		StructLib.SetFeeArgs memory originatorFee,
		uint16 origCcyFee_percBips_ExFee,
		string[] memory metaKeys,
		string[] memory metaValues
	) public {
		_mintSecTokenBatch(
			tokTypeId, 
			mintQty,
			mintSecTokenCount,
			batchOwner,
			originatorFee,
			origCcyFee_percBips_ExFee,
			metaKeys,
			metaValues,
			false,
			0,
			0
		);
	}

	function mintSecTokenBatchCustomFee(
		uint256 tokTypeId,
		uint256 mintQty,
		int64 mintSecTokenCount,
		address payable batchOwner,
		StructLib.SetFeeArgs memory originatorFee,
		uint16 origCcyFee_percBips_ExFee,
		string[] memory metaKeys,
		string[] memory metaValues,
		uint ccyTypeId,
		uint fee
	) public {
		_mintSecTokenBatch(
			tokTypeId, 
			mintQty,
			mintSecTokenCount,
			batchOwner,
			originatorFee,
			origCcyFee_percBips_ExFee,
			metaKeys,
			metaValues,
			true,
			ccyTypeId,
			fee
		);
	}

	 function _mintSecTokenBatch(
		uint256 tokTypeId,
		uint256 mintQty,
		int64 mintSecTokenCount,
		address payable batchOwner,
		StructLib.SetFeeArgs memory originatorFee,
		uint16 origCcyFee_percBips_ExFee,
		string[] memory metaKeys,
		string[] memory metaValues,
		bool applyCustFee,
		uint ccyTypeId,
		uint fee
	) internal {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateHasEntity(batchOwner);

		TokenLib.MintSecTokenBatchArgs memory args = TokenLib.MintSecTokenBatchArgs({
			tokTypeId: tokTypeId,
			mintQty: mintQty,
			mintSecTokenCount: mintSecTokenCount,
			batchOwner: batchOwner,
			origTokFee: originatorFee,
			origCcyFee_percBips_ExFee: origCcyFee_percBips_ExFee,
			metaKeys: metaKeys,
			metaValues: metaValues
		});

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		TokenLib.mintSecTokenBatch(s.ld, s.std, args, applyCustFee, ccyTypeId, fee, false);
	}
}
