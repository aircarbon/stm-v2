// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";

library LoadLib {
	function loadSecTokenBatch(
		StructLib.LedgerStruct storage ld,
		StructLib.SecTokenBatch[] memory batches,
		uint64 _batches_currentMax_id
	) public {
		require(!ld._contractSealed, "Contract is sealed");
		for (uint256 i = 0; i < batches.length; i++) {
			ld._batches[batches[i].id] = batches[i];
		}
		ld._batches_currentMax_id = _batches_currentMax_id;
	}

	// Add another param "entity ID"
	function createLedgerEntry(
		StructLib.LedgerStruct storage ld,
		address ledgerEntryOwner,
		StructLib.LedgerCcyReturn[] memory ccys,
		uint256 spot_sumQtyMinted,
		uint256 spot_sumQtyBurned
	) public // uint entityId
	{
		require(!ld._contractSealed, "Contract is sealed");

		if (!ld._ledger[ledgerEntryOwner].exists) {
			ld._ledgerOwners.push(ledgerEntryOwner);
		}

		StructLib.Ledger storage entry = ld._ledger[ledgerEntryOwner];

		entry.exists = true;
		entry.spot_sumQtyMinted = spot_sumQtyMinted;
		entry.spot_sumQtyBurned = spot_sumQtyBurned;

		for (uint256 i = 0; i < ccys.length; i++) {
			uint256 ccyTypeId = ccys[i].ccyTypeId;
			ld._ledger[ledgerEntryOwner].ccyType_balance[ccyTypeId] = ccys[i].balance;
			ld._ledger[ledgerEntryOwner].ccyType_reserved[ccyTypeId] = ccys[i].reserved;
		}
	}

	function addSecTokenBatch(
		StructLib.LedgerStruct storage ld,
		StructLib.AddSecTokenBatchArgs[] memory params
	) public {
		uint256 len = params.length;

		for (uint256 i = 0; i < len; i++) {
			StructLib.AddSecTokenBatchArgs memory currParam = params[i];

			addSecToken(
				ld,
				currParam.ledgerEntryOwner,
				currParam.batchId,
				currParam.stId,
				currParam.tokTypeId,
				currParam.mintedQty,
				currParam.currentQty,
				currParam.ft_price,
				currParam.ft_lastMarkPrice,
				currParam.ft_ledgerOwner,
				currParam.ft_PL
			);
		}
	}

	function addSecToken(
		StructLib.LedgerStruct storage ld,
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
		require(!ld._contractSealed, "Contract is sealed");
		ld._sts[stId].batchId = batchId;
		ld._sts[stId].mintedQty = mintedQty;
		ld._sts[stId].currentQty = currentQty;
		ld._sts[stId].ft_price = ft_price;
		ld._sts[stId].ft_ledgerOwner = ft_ledgerOwner;
		ld._sts[stId].ft_lastMarkPrice = ft_lastMarkPrice;
		ld._sts[stId].ft_PL = ft_PL;

		// v1.1 bugfix
		// burned tokens don't exist against any ledger entry, (but do exist
		// on the master _sts global list); this conditional allows us to use the
		// null-address to correctly represent these burned tokens in the target contract
		if (ledgerEntryOwner != 0x0000000000000000000000000000000000000000) {
			// v1.1 bugfix
			ld._ledger[ledgerEntryOwner].tokenType_stIds[tokTypeId].push(stId);
		}
	}

	function setTokenTotals(
		StructLib.LedgerStruct storage ld,
		//uint80 packed_ExchangeFeesPaidQty, uint80 packed_OriginatorFeesPaidQty, uint80 packed_TransferedQty,
		uint256 base_id,
		uint256 currentMax_id,
		uint256 totalMintedQty,
		uint256 totalBurnedQty
	) public {
		require(!ld._contractSealed, "Contract is sealed");

		ld._tokens_base_id = base_id;
		ld._tokens_currentMax_id = currentMax_id;
		ld._spot_totalMintedQty = totalMintedQty;
		ld._spot_totalBurnedQty = totalBurnedQty;
	}
}
