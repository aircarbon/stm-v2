// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { LoadLib } from "../libraries/LoadLib.sol";
import { OwnedLib } from "../libraries/OwnedLib.sol";

contract DataLoadableFacet {

	function createLedgerEntryBatch(StructLib.CreateLedgerEntryArgs[] calldata params) external {
		OwnedLib.onlyOwner();
		uint len = params.length;
		StructLib.LedgerStruct storage ld = LibMainStorage.getStorage().ld;

		for(uint i = 0; i < len; i++) {
			StructLib.CreateLedgerEntryArgs memory currParam = params[i];
			// setEntity(currParam.ledgerEntryOwner, currParam.entityId); // TODO: Set entity
			LoadLib.createLedgerEntry(ld, currParam.ledgerEntryOwner, currParam.ccys, currParam.spot_sumQtyMinted, currParam.spot_sumQtyBurned);
		}
	}

	/**
	 * @dev add an entry to the ledger
	 * @param ledgerEntryOwner account address of the ledger owner for the entry
	 * @param ccys ledger entries for currency types structure that includes currency identifier, name, unit, balance, reserved
	 * @param spot_sumQtyMinted spot exchange total assets minted quantity
	 * @param spot_sumQtyBurned spot exchange total assets burned quantity
	 */
	function createLedgerEntry(
		address ledgerEntryOwner,
		StructLib.LedgerCcyReturn[] memory ccys,
		uint256 spot_sumQtyMinted,
		uint256 spot_sumQtyBurned,
		uint entityId
	) public {
		OwnedLib.onlyOwner();
		// setEntity(ledgerEntryOwner, entityId); // TODO: Set entity
		LoadLib.createLedgerEntry(LibMainStorage.getStorage().ld, ledgerEntryOwner, ccys, spot_sumQtyMinted, spot_sumQtyBurned);
	}

	/**
	 * @dev add a new security token
	 * @param ledgerEntryOwner account address of the ledger entry owner
	 * @param batchId unique batch identifier for each security token type
	 * @param stId security token identifier of the batch
	 * @param tokTypeId token type of the batch
	 * @param mintedQty existence check field: should never be non-zero
	 * @param currentQty current (variable) unit qty in the ST (i.e. burned = currentQty - mintedQty)
	 * @param ft_price becomes average price after combining [futures only]
	 * @param ft_lastMarkPrice last mark price [futures only]
	 * @param ft_ledgerOwner for takePay() lookup of ledger owner by ST [futures only]
	 * @param ft_PL running total P&L [futures only]
	 */
	function addSecToken(
		address ledgerEntryOwner,
		uint64 batchId,
		uint256 stId,
		uint256 tokTypeId,
		int64 mintedQty,
		int64 currentQty,
		int128 ft_price,
		int128 ft_lastMarkPrice,
		address ft_ledgerOwner,
		int128 ft_PL
	) public {
		OwnedLib.onlyOwner();
		LoadLib.addSecToken(
			LibMainStorage.getStorage().ld,
			ledgerEntryOwner,
			batchId,
			stId,
			tokTypeId,
			mintedQty,
			currentQty,
			ft_price,
			ft_lastMarkPrice,
			ft_ledgerOwner,
			ft_PL
		);
	}

	/**
	 * @dev setting totals for security token
	 * @param base_id 1-based - assigned (once, when set to initial zero value) by Mint()
	 * @param currentMax_id 1-based identifiers updated by Mint() and by transferSplitSecTokens()
	 * @param totalMintedQty total burned quantity in the spot exchange
	 * @param totalBurnedQty total burned quantity in the spot exchange
	 */
	function setTokenTotals(
		//uint80 packed_ExchangeFeesPaidQty, uint80 packed_OriginatorFeesPaidQty, uint80 packed_TransferedQty,
		uint256 base_id,
		uint256 currentMax_id,
		uint256 totalMintedQty,
		uint256 totalBurnedQty
	) public {
		OwnedLib.onlyOwner();
		LoadLib.setTokenTotals(
			LibMainStorage.getStorage().ld,
			//packed_ExchangeFeesPaidQty, packed_OriginatorFeesPaidQty, packed_TransferedQty,
			base_id,
			currentMax_id,
			totalMintedQty,
			totalBurnedQty
		);
	}
}
