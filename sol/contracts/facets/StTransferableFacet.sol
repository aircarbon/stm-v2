// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { TransferLib } from "../libraries/TransferLib.sol";
import { TransferLibView } from "../libraries/TransferLibView.sol";
import { LedgerLib } from "../libraries/LedgerLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StTransferableFacet {
	uint256 constant MAX_BATCHES_PREVIEW = 128; // library constants not accessible in contract; must duplicate TransferLib value

	/**
	 * @dev returns the hashcode of the ledger
	 * @param mod modulus operand for modulus operation on ledger index
	 * @param n base integer modulus operation validation
	 * @return ledgerHashcode
	 * @param ledgerHashcode returns the hashcode of the ledger
	 */
	function getLedgerHashcode(uint256 mod, uint256 n)
		external
		view
		returns (bytes32 ledgerHashcode)
	{
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		return
			LedgerLib.getLedgerHashcode(
				s.ld,
				s.std,
				s.ctd,
				s.erc20d,
				//cashflowData,
				s.globalFees,
				mod,
				n
			);
	}

	/**
	 * @dev returns fee preview - exchange fee only
	 * @param transferArgs transfer args same as transferOrTrade
	 * @return feesAll
	 * @param feesAll returns fees calculation for the exchange
	 */
	function transfer_feePreview_ExchangeOnly(StructLib.TransferArgs calldata transferArgs)
		external
		view
		returns (StructLib.FeesCalc[1] memory feesAll)
	{
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		return
			TransferLibView.transfer_feePreview_ExchangeOnly(
				s.ld,
				s.globalFees,
				s.deploymentOwner,
				transferArgs
			);
	}

	/**
	 * @dev returns all fee preview (old / deprecated)
	 * @param transferArgs transfer args same as transferOrTrade
	 * @return feesAll
	 * @param feesAll returns fees calculation for the exchange
	 */
	function transfer_feePreview(StructLib.TransferArgs calldata transferArgs)
		external
		view
		returns (StructLib.FeesCalc[1 + MAX_BATCHES_PREVIEW * 2] memory feesAll)
	{
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		return
			TransferLibView.transfer_feePreview(
				s.ld,
				s.std,
				s.globalFees,
				s.deploymentOwner,
				transferArgs
			);
	}

	/**
	 * @dev transfer or trade operation on security tokens
	 * @param transferArgs transfer or trade arguments<br/>
	 * ledger_A<br/>
	 * ledger_B<br/>
	 * qty_A : ST quantity moving from A (excluding fees, if any)<br/>
	 * k_stIds_A : if len>0: the constant/specified ST IDs to transfer (must correlate with qty_A, if supplied)<br/>
	 * tokTypeId_A : ST type moving from A<br/>
	 * qty_B : ST quantity moving from B (excluding fees, if any)<br/>
	 * k_stIds_B : if len>0: the constant/specified ST IDs to transfer (must correlate with qty_B, if supplied)<br/>
	 * tokTypeId_B : ST type moving from B<br/>
	 * ccy_amount_A : currency amount moving from A (excluding fees, if any)<br/>
	 * ccyTypeId_A : currency type moving from A<br/>
	 * ccy_amount_B : currency amount moving from B (excluding fees, if any)<br/>
	 * ccyTypeId_B : currency type moving from B<br/>
	 * applyFees : apply global fee structure to the transfer (both legs)<br/>
	 * feeAddrOwner : account address of fee owner
	 */

	function transferOrTrade(StructLib.TransferArgs memory transferArgs) public {
		_transferOrTradeImpl(transferArgs, 0, 0, false);
	}

	function transferOrTradeCustomFee(StructLib.TransferArgs memory transferArgs, uint custFeeA, uint custFeeB) public {
		_transferOrTradeImpl(transferArgs, custFeeA, custFeeB, true);
	}

	function _transferOrTradeImpl(
		StructLib.TransferArgs memory transferArgs, 
		uint custFeeA, 
		uint custFeeB, 
		bool applyFees
	) internal {
		ValidationLib.validateOnlyCustodian();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateHasEntity(transferArgs.ledger_A);
		ValidationLib.validateHasEntity(transferArgs.ledger_B);

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		// abort if sending tokens from a non-whitelist account
		require(
			!(transferArgs.qty_A > 0 && !s.erc20d._whitelisted[transferArgs.ledger_A]),
			"Not whitelisted (A)"
		);
		require(
			!(transferArgs.qty_B > 0 && !s.erc20d._whitelisted[transferArgs.ledger_B]),
			"Not whitelisted (B)"
		);

		LibMainStorage.MainStorage3 storage s3 = LibMainStorage.getStorage3();
		transferArgs.feeAddrOwner_A = s3.feeAddrPerEntity[s.entities[transferArgs.ledger_A]];
		transferArgs.feeAddrOwner_B = s3.feeAddrPerEntity[s.entities[transferArgs.ledger_B]];
		TransferLib.transferOrTrade(s.ld, s.std, s.ctd, s.globalFees, transferArgs, StructLib.CustomFee(custFeeA, custFeeB, applyFees));
	}
}
