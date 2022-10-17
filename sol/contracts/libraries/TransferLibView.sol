// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";

import { StTransferableFacet } from "../facets/StTransferableFacet.sol";
import { TransferLib } from "./TransferLib.sol";

library TransferLibView {
	uint256 constant MAX_BATCHES_PREVIEW = 128; // for fee previews: max distinct batch IDs that can participate in one side of a trade fee preview
	struct TransferVars {
		// misc. working vars for transfer() fn - struct packed to preserve stack slots
		TransferSplitPreviewReturn[2] ts_previews; // [0] = A->B, [1] = B->A
		TransferSplitArgs[2] ts_args;
		uint256[2] totalOrigFee;
		uint80 transferedQty;
		uint80 exchangeFeesPaidQty;
		uint80 originatorFeesPaidQty;
	}

	/**
	 * @dev Previews token transfer across ledger owners
	 * @param a TransferSplitArgs args
	 * @return The distinct transfer-from batch IDs and the total quantity of tokens that would be transfered from each batch
	 */
	struct TransferSplitPreviewReturn {
		uint64[MAX_BATCHES_PREVIEW] batchIds; // todo: pack these - quadratic gas cost for fixed memory
		uint256[MAX_BATCHES_PREVIEW] transferQty;
		uint256 batchCount;
		// calc fields for batch originator ccy fee - % of exchange currency fee
		uint256 TC; // total cut        - sum originator batch origCcyFee_percBips_ExFee for all batches
		uint256 TC_capped; // total cut capped - capped (10000 bps) total cut
	}

	struct TransferSplitArgs {
		address from;
		address to;
		uint256 tokTypeId;
		uint256 qtyUnit;
		StructLib.TransferType transferType;
		uint256 maxStId;
		uint256[] k_stIds_take; // IFF len>0: only use these specific tokens (skip any others)
		//uint256[]              k_stIds_skip; // IFF len>0: don't use these specific tokens (use any others) -- UNUSED, CAN REMOVE
	}

	struct TransferSpltVars {
		uint256 ndx;
		int64 remainingToTransfer;
		bool mergedExisting;
		int64 stQty;
	}

	event TransferedFullSecToken(
		address indexed from,
		address indexed to,
		uint256 indexed stId,
		uint256 mergedToSecTokenId,
		uint256 qty,
		StructLib.TransferType transferType
	);

	event TransferedPartialSecToken(
		address indexed from,
		address indexed to,
		uint256 indexed splitFromSecTokenId,
		uint256 newSecTokenId,
		uint256 mergedToSecTokenId,
		uint256 qty,
		StructLib.TransferType transferType
	);

	event TradedCcyTok(
		uint256 ccyTypeId,
		uint256 ccyAmount,
		uint256 tokTypeId,
		address indexed from, // tokens
		address indexed to, // tpkens
		uint256 tokQty,
		uint256 ccyFeeFrom,
		uint256 ccyFeeTo
	);

	//
	// PUBLIC - fee preview (FULL - includes originator token fees)
	//
	function transfer_feePreview(
		StructLib.LedgerStruct storage ld,
		StructLib.StTypesStruct storage std,
		mapping(uint => StructLib.FeeStruct) storage entityGlobalFees,
		mapping(address => uint256) storage entities,
		address feeAddrOwner,
		StructLib.TransferArgs memory a
	)
		public
		view
		returns (
			// 1 exchange fee (single destination) + maximum of MAX_BATCHES_PREVIEW of originator fees on each side (x2) of the transfer
			StructLib.FeesCalc[1 + MAX_BATCHES_PREVIEW * 2] memory feesAll
		)
	//
	// SPLITTING
	// want to *also* return the # of full & partial ST transfers, involved in *ALL* the transfer actions (not just fees)
	// each set of { partialCount, fullCount } should be grouped by transfer-type: USER, EX_FEE, ORIG_FEE
	// transfer could then take params: { StructLib.TransferType: partialStart, partialEnd, fullStart, fullEnd } -- basically pagination of the sub-transfers
	//
	// TEST SETUP COULD BE: ~100 minted batches 1 ton each, and move 99 tons A-B (type USER, multi-batch)
	//       try to make orchestrator that batches by (eg.) 10...
	//       (exactly the same for type ORIG_FEE multi-batch)
	//
	{
		uint256 ndx = 0;

		// transfer by ST ID: check supplied STs belong to supplied owner(s), and implied quantities match supplied quantities
		if (ld.contractType != StructLib.ContractType.CASHFLOW_CONTROLLER) {
			//**
			TransferLib.checkStIds(ld, a);
		}

		// exchange fee
		StructLib.FeeStruct storage exFeeStruct_ccy_A = ld
			._ledger[a.ledger_A]
			.spot_customFees
			.ccyType_Set[a.ccyTypeId_A]
			? ld._ledger[a.ledger_A].spot_customFees
			: entityGlobalFees[entities[a.ledger_A]];
		StructLib.FeeStruct storage exFeeStruct_tok_A = ld
			._ledger[a.ledger_A]
			.spot_customFees
			.tokType_Set[a.tokTypeId_A]
			? ld._ledger[a.ledger_A].spot_customFees
			: entityGlobalFees[entities[a.ledger_A]];
		StructLib.FeeStruct storage exFeeStruct_ccy_B = ld
			._ledger[a.ledger_B]
			.spot_customFees
			.ccyType_Set[a.ccyTypeId_B]
			? ld._ledger[a.ledger_B].spot_customFees
			: entityGlobalFees[entities[a.ledger_B]];
		StructLib.FeeStruct storage exFeeStruct_tok_B = ld
			._ledger[a.ledger_B]
			.spot_customFees
			.tokType_Set[a.tokTypeId_B]
			? ld._ledger[a.ledger_B].spot_customFees
			: entityGlobalFees[entities[a.ledger_B]];
		feesAll[ndx++] = StructLib.FeesCalc({
			fee_ccy_A: a.ledger_A != a.feeAddrOwner_A && a.ccy_amount_A > 0
				? TransferLib.calcFeeWithCapCollar(
					exFeeStruct_ccy_A.ccy[a.ccyTypeId_A],
					uint256(a.ccy_amount_A),
					a.qty_B
				)
				: 0,
			fee_ccy_B: a.ledger_B != a.feeAddrOwner_B && a.ccy_amount_B > 0
				? TransferLib.calcFeeWithCapCollar(
					exFeeStruct_ccy_B.ccy[a.ccyTypeId_B],
					uint256(a.ccy_amount_B),
					a.qty_A
				)
				: 0,
			fee_tok_A: a.ledger_A != a.feeAddrOwner_A && a.qty_A > 0
				? TransferLib.calcFeeWithCapCollar(exFeeStruct_tok_A.tok[a.tokTypeId_A], a.qty_A, 0)
				: 0,
			fee_tok_B: a.ledger_B != a.feeAddrOwner_B && a.qty_B > 0
				? TransferLib.calcFeeWithCapCollar(exFeeStruct_tok_B.tok[a.tokTypeId_B], a.qty_B, 0)
				: 0,
			fee_to_A: feeAddrOwner,
			fee_to_B: feeAddrOwner,
			origTokFee_qty: 0,
			origTokFee_batchId: 0,
			origTokFee_struct: StructLib.SetFeeArgs({
				fee_fixed: 0,
				fee_percBips: 0,
				fee_min: 0,
				fee_max: 0,
				ccy_perMillion: 0,
				ccy_mirrorFee: false
			})
		});

		// apply exchange ccy fee mirroring - only ever from one side to the other
		if (feesAll[0].fee_ccy_A > 0 && feesAll[0].fee_ccy_B == 0) {
			if (exFeeStruct_ccy_A.ccy[a.ccyTypeId_A].ccy_mirrorFee == true) {
				a.ccyTypeId_B = a.ccyTypeId_A;
				//feesAll[0].fee_ccy_B = feesAll[0].fee_ccy_A; // symmetric mirror

				// asymmetric mirror
				exFeeStruct_ccy_B = ld._ledger[a.ledger_B].spot_customFees.ccyType_Set[
					a.ccyTypeId_B
				]
					? ld._ledger[a.ledger_B].spot_customFees
					: entityGlobalFees[entities[a.ledger_B]];
				feesAll[0].fee_ccy_B = a.ledger_B != a.feeAddrOwner_B
					? TransferLib.calcFeeWithCapCollar(
						exFeeStruct_ccy_B.ccy[a.ccyTypeId_B],
						uint256(a.ccy_amount_A),
						a.qty_B
					)
					: 0; // ??!
			}
		} else if (feesAll[0].fee_ccy_B > 0 && feesAll[0].fee_ccy_A == 0) {
			if (exFeeStruct_ccy_B.ccy[a.ccyTypeId_B].ccy_mirrorFee == true) {
				a.ccyTypeId_A = a.ccyTypeId_B;
				//feesAll[0].fee_ccy_A = feesAll[0].fee_ccy_B; // symmetric mirror

				// asymmetric mirror
				exFeeStruct_ccy_A = ld._ledger[a.ledger_A].spot_customFees.ccyType_Set[
					a.ccyTypeId_A
				]
					? ld._ledger[a.ledger_A].spot_customFees
					: entityGlobalFees[entities[a.ledger_A]];
				feesAll[0].fee_ccy_A = a.ledger_A != a.feeAddrOwner_A
					? TransferLib.calcFeeWithCapCollar(
						exFeeStruct_ccy_A.ccy[a.ccyTypeId_A],
						uint256(a.ccy_amount_B),
						a.qty_A
					)
					: 0; // ??!
			}
		}

		// originator token fee(s) - per batch
		if (ld.contractType != StructLib.ContractType.CASHFLOW_CONTROLLER) {
			//**
			uint256 maxStId = ld._tokens_currentMax_id;
			if (a.qty_A > 0) {
				TransferLib.TransferSplitPreviewReturn memory preview = TransferLib.transferSplitSecTokens_Preview(
					ld,
					TransferLib.TransferSplitArgs({
						from: a.ledger_A,
						to: a.ledger_B,
						tokTypeId: a.tokTypeId_A,
						qtyUnit: a.qty_A,
						transferType: StructLib.TransferType.User,
						maxStId: maxStId,
						k_stIds_take: a.k_stIds_A /*, k_stIds_skip: new uint256[](0)*/
					})
				);
				for (uint256 i = 0; i < preview.batchCount; i++) {
					StructLib.SecTokenBatch storage batch = ld._batches[preview.batchIds[i]];
					if (a.ledger_A != batch.originator) {
						feesAll[ndx++] = StructLib.FeesCalc({
							fee_ccy_A: 0,
							fee_ccy_B: 0,
							fee_tok_A: TransferLib.calcFeeWithCapCollar(
								batch.origTokFee,
								preview.transferQty[i],
								0
							),
							fee_tok_B: 0,
							fee_to_A: batch.originator,
							fee_to_B: batch.originator,
							origTokFee_qty: preview.transferQty[i],
							origTokFee_batchId: preview.batchIds[i],
							origTokFee_struct: batch.origTokFee
						});
					}
				}
			}
			if (a.qty_B > 0) {
				TransferLib.TransferSplitPreviewReturn memory preview = TransferLib.transferSplitSecTokens_Preview(
					ld,
					TransferLib.TransferSplitArgs({
						from: a.ledger_B,
						to: a.ledger_A,
						tokTypeId: a.tokTypeId_B,
						qtyUnit: a.qty_B,
						transferType: StructLib.TransferType.User,
						maxStId: maxStId,
						k_stIds_take: a.k_stIds_B /*, k_stIds_skip: new uint256[](0)*/
					})
				);
				for (uint256 i = 0; i < preview.batchCount; i++) {
					StructLib.SecTokenBatch storage batch = ld._batches[preview.batchIds[i]];
					if (a.ledger_B != batch.originator) {
						feesAll[ndx++] = StructLib.FeesCalc({
							fee_ccy_A: 0,
							fee_ccy_B: 0,
							fee_tok_A: 0,
							fee_tok_B: TransferLib.calcFeeWithCapCollar(
								batch.origTokFee,
								preview.transferQty[i],
								0
							),
							fee_to_A: batch.originator,
							fee_to_B: batch.originator,
							origTokFee_qty: preview.transferQty[i],
							origTokFee_batchId: preview.batchIds[i],
							origTokFee_struct: batch.origTokFee
						});
					}
				}
			}
		} else {
			// controller - delegate token fee previews to base type(s) & merge results
			if (a.qty_A > 0) {
				StTransferableFacet base_A = StTransferableFacet(std._tt_addr[a.tokTypeId_A]);
				StructLib.FeesCalc[1 + MAX_BATCHES_PREVIEW * 2] memory feesBase = base_A
					.transfer_feePreview(
						StructLib.TransferArgs({
							ledger_A: a.ledger_A,
							ledger_B: a.ledger_B,
							qty_A: a.qty_A,
							k_stIds_A: a.k_stIds_A,
							tokTypeId_A: 1, /*a.tokTypeId_A*/ // base: UNI_TOKEN (controller does type ID mapping for clients)
							qty_B: a.qty_B,
							k_stIds_B: a.k_stIds_B,
							tokTypeId_B: a.tokTypeId_B,
							ccy_amount_A: a.ccy_amount_A,
							ccyTypeId_A: a.ccyTypeId_A,
							ccy_amount_B: a.ccy_amount_B,
							ccyTypeId_B: a.ccyTypeId_B,
							applyFees: a.applyFees,
							feeAddrOwner_A: a.feeAddrOwner_A,
							feeAddrOwner_B: a.feeAddrOwner_B,
							transferType: a.transferType
						})
					);
				for (uint256 i = 1; i < feesBase.length; i++) {
					if (feesBase[i].fee_tok_A > 0) {
						feesAll[i] = feesBase[i];
					}
				}
			}
			if (a.qty_B > 0) {
				StTransferableFacet base_B = StTransferableFacet(std._tt_addr[a.tokTypeId_B]);
				StructLib.FeesCalc[1 + MAX_BATCHES_PREVIEW * 2] memory feesBase = base_B
					.transfer_feePreview(
						StructLib.TransferArgs({
							ledger_A: a.ledger_A,
							ledger_B: a.ledger_B,
							qty_A: a.qty_A,
							k_stIds_A: a.k_stIds_A,
							tokTypeId_A: a.tokTypeId_A,
							qty_B: a.qty_B,
							k_stIds_B: a.k_stIds_B,
							tokTypeId_B: 1, /*a.tokTypeId_B*/ // base: UNI_TOKEN (controller does type ID mapping for clients)
							ccy_amount_A: a.ccy_amount_A,
							ccyTypeId_A: a.ccyTypeId_A,
							ccy_amount_B: a.ccy_amount_B,
							ccyTypeId_B: a.ccyTypeId_B,
							applyFees: a.applyFees,
							feeAddrOwner_A: a.feeAddrOwner_A,
							feeAddrOwner_B: a.feeAddrOwner_B,
							transferType: a.transferType
						})
					);
				for (uint256 i = 1; i < feesBase.length; i++) {
					if (feesBase[i].fee_tok_B > 0) {
						feesAll[i] = feesBase[i];
					}
				}
			}
		}
	}

	//
	// PUBLIC - fee preview (FAST - returns only the exchange fee[s])
	//
	function transfer_feePreview_ExchangeOnly(
		StructLib.LedgerStruct storage ld,
		mapping(uint => StructLib.FeeStruct) storage entityGlobalFees,
		mapping(address => uint256) storage entities,
		address feeAddrOwner,
		StructLib.TransferArgs memory a
	) public view returns (StructLib.FeesCalc[1] memory feesAll) {
		// 1 exchange fee only (single destination)
		uint256 ndx = 0;

		// transfer by ST ID: check supplied STs belong to supplied owner(s), and implied quantities match supplied quantities
		if (ld.contractType != StructLib.ContractType.CASHFLOW_CONTROLLER) {
			//**
			TransferLib.checkStIds(ld, a);
		}

		// TODO: refactor - this is common/identical to transfer_feePreview...

		// exchange fee
		StructLib.FeeStruct storage exFeeStruct_ccy_A = ld
			._ledger[a.ledger_A]
			.spot_customFees
			.ccyType_Set[a.ccyTypeId_A]
			? ld._ledger[a.ledger_A].spot_customFees
			: entityGlobalFees[entities[a.ledger_A]];
		StructLib.FeeStruct storage exFeeStruct_tok_A = ld
			._ledger[a.ledger_A]
			.spot_customFees
			.tokType_Set[a.tokTypeId_A]
			? ld._ledger[a.ledger_A].spot_customFees
			: entityGlobalFees[entities[a.ledger_A]];
		StructLib.FeeStruct storage exFeeStruct_ccy_B = ld
			._ledger[a.ledger_B]
			.spot_customFees
			.ccyType_Set[a.ccyTypeId_B]
			? ld._ledger[a.ledger_B].spot_customFees
			: entityGlobalFees[entities[a.ledger_B]];
		StructLib.FeeStruct storage exFeeStruct_tok_B = ld
			._ledger[a.ledger_B]
			.spot_customFees
			.tokType_Set[a.tokTypeId_B]
			? ld._ledger[a.ledger_B].spot_customFees
			: entityGlobalFees[entities[a.ledger_B]];
		feesAll[ndx++] = StructLib.FeesCalc({
			fee_ccy_A: a.ledger_A != a.feeAddrOwner_A && a.ccy_amount_A > 0
				? TransferLib.calcFeeWithCapCollar(
					exFeeStruct_ccy_A.ccy[a.ccyTypeId_A],
					uint256(a.ccy_amount_A),
					a.qty_B
				)
				: 0,
			fee_ccy_B: a.ledger_B != a.feeAddrOwner_B && a.ccy_amount_B > 0
				? TransferLib.calcFeeWithCapCollar(
					exFeeStruct_ccy_B.ccy[a.ccyTypeId_B],
					uint256(a.ccy_amount_B),
					a.qty_A
				)
				: 0,
			fee_tok_A: a.ledger_A != a.feeAddrOwner_A && a.qty_A > 0
				? TransferLib.calcFeeWithCapCollar(exFeeStruct_tok_A.tok[a.tokTypeId_A], a.qty_A, 0)
				: 0,
			fee_tok_B: a.ledger_B != a.feeAddrOwner_B && a.qty_B > 0
				? TransferLib.calcFeeWithCapCollar(exFeeStruct_tok_B.tok[a.tokTypeId_B], a.qty_B, 0)
				: 0,
			fee_to_A: feeAddrOwner,
			fee_to_B: feeAddrOwner,
			origTokFee_qty: 0,
			origTokFee_batchId: 0,
			origTokFee_struct: StructLib.SetFeeArgs({
				fee_fixed: 0,
				fee_percBips: 0,
				fee_min: 0,
				fee_max: 0,
				ccy_perMillion: 0,
				ccy_mirrorFee: false
			})
		});

		// apply exchange ccy fee mirroring - only ever from one side to the other
		if (feesAll[0].fee_ccy_A > 0 && feesAll[0].fee_ccy_B == 0) {
			if (exFeeStruct_ccy_A.ccy[a.ccyTypeId_A].ccy_mirrorFee == true) {
				a.ccyTypeId_B = a.ccyTypeId_A;
				//feesAll[0].fee_ccy_B = feesAll[0].fee_ccy_A; // symmetric mirror

				// asymmetric mirror
				exFeeStruct_ccy_B = ld._ledger[a.ledger_B].spot_customFees.ccyType_Set[
					a.ccyTypeId_B
				]
					? ld._ledger[a.ledger_B].spot_customFees
					: entityGlobalFees[entities[a.ledger_B]];
				feesAll[0].fee_ccy_B = a.ledger_B != a.feeAddrOwner_B
					? TransferLib.calcFeeWithCapCollar(
						exFeeStruct_ccy_B.ccy[a.ccyTypeId_B],
						uint256(a.ccy_amount_A),
						a.qty_B
					)
					: 0;
			}
		} else if (feesAll[0].fee_ccy_B > 0 && feesAll[0].fee_ccy_A == 0) {
			if (exFeeStruct_ccy_B.ccy[a.ccyTypeId_B].ccy_mirrorFee == true) {
				a.ccyTypeId_A = a.ccyTypeId_B;
				//feesAll[0].fee_ccy_A = feesAll[0].fee_ccy_B; // symmetric mirror

				// asymmetric mirror
				exFeeStruct_ccy_A = ld._ledger[a.ledger_A].spot_customFees.ccyType_Set[a.ccyTypeId_A]
					? ld._ledger[a.ledger_A].spot_customFees
					: entityGlobalFees[entities[a.ledger_A]];

				feesAll[0].fee_ccy_A = a.ledger_A != a.feeAddrOwner_A
					? TransferLib.calcFeeWithCapCollar(
						exFeeStruct_ccy_A.ccy[a.ccyTypeId_A],
						uint256(a.ccy_amount_B),
						a.qty_A
					)
					: 0;
			}
		}
	}
}
