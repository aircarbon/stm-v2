// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { TokenLib } from "../libraries/TokenLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StBurnableFacet {
	/**
	 * @dev returns the security token total burned quantity
	 * @return totalBurnedQty
	 * @param totalBurnedQty returns the security token total burned quantity
	 */
	function getSecToken_totalBurnedQty() external view returns (uint256 totalBurnedQty) {
		return LibMainStorage.getStorage().ld._spot_totalBurnedQty;
	}

	/**
	 * @dev burning of security tokens
	 * @param ledgerOwner account address of the ledger owner of the security token batch
	 * @param tokTypeId token type of the token batch
	 * @param burnQty amount to be burned
	 * @param stIds sum of supplied STs current qty must equal supplied burnQty
	 */
	function burnTokens(
		address ledgerOwner,
		uint256 tokTypeId,
		int256 burnQty,
		uint256[] memory stIds // IFF supplied (len > 0): sum of supplied STs current qty must == supplied burnQty
	) public {
		_burnTokens(ledgerOwner, tokTypeId, burnQty, stIds, false, 0, 0);
	}

	function burnTokensCustomFee(
		address ledgerOwner,
		uint256 tokTypeId,
		int256 burnQty,
		uint256[] memory stIds,
		uint ccyTypeId,
		uint fee
	) public {
		_burnTokens(ledgerOwner, tokTypeId, burnQty, stIds, true, ccyTypeId, fee);
	}

	function _burnTokens(
		address ledgerOwner,
		uint256 tokTypeId,
		int256 burnQty,
		uint256[] memory stIds,
		bool applyCustomFee,
		uint ccyTypeId,
		uint fee
	) internal {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateHasEntity(ledgerOwner);

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		TokenLib.burnTokens(
			s.ld,
			s.std,
			TokenLib.BurnTokenArgs({
				ledgerOwner: ledgerOwner,
				tokTypeId: tokTypeId,
				burnQty: burnQty,
				k_stIds: stIds
			}),
			StructLib.CustomCcyFee({
				ccyTypeId: ccyTypeId,
				fee: fee,
				applyCustomFee: applyCustomFee
			}),
			false
		);
	}
}
