// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";

library CcyLib {
	uint256 constant MAX_INT = 2**255 - 1;

	event AddedCcyType(uint256 id, string name, string unit);
	event CcyFundedLedger(uint256 ccyTypeId, address indexed to, int256 amount, string desc, bool customFee);
	event CcyWithdrewLedger(uint256 ccyTypeId, address indexed from, int256 amount, string desc,  bool customFee);

	// CCY TYPES

	function addCcyTypeBatch(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		string[] calldata name,
		string[] calldata unit,
		uint16[] calldata decimals
	) public {
		uint256 len = name.length;
		require(
			len == unit.length && len == decimals.length,
			"addCcyTypeBatch: arrays' lengths don't match"
		);

		for (uint256 i = 0; i < len; i++) {
			addCcyType(ld, ctd, name[i], unit[i], decimals[i]);
		}
	}

	function addCcyType(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		string memory name,
		string memory unit,
		uint16 decimals
	) public {
		require(
			ld.contractType == StructLib.ContractType.COMMODITY ||
				ld.contractType == StructLib.ContractType.CASHFLOW_CONTROLLER,
			"Bad cashflow request"
		); // disallow ccy's on base cashflow contract

		require(
			ctd._ct_Count < 32, // MAX_CCYS
			"Too many currencies"
		);

		uint256 ccyTypesCount = ctd._ct_Count;
		for (uint256 ccyTypeId = 1; ccyTypeId <= ccyTypesCount; ccyTypeId++) {
			require(
				keccak256(abi.encodePacked(ctd._ct_Ccy[ccyTypeId].name)) !=
					keccak256(abi.encodePacked(name)),
				"Currency type name already exists"
			);
		}

		ctd._ct_Count++;
		ctd._ct_Ccy[ctd._ct_Count] = StructLib.Ccy({
			id: ctd._ct_Count,
			name: name,
			unit: unit,
			decimals: decimals
		});
		emit AddedCcyType(ctd._ct_Count, name, unit);
	}

	function fundOrWithdraw(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		StructLib.FundWithdrawType direction,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc,
		uint fee,
		bool applyFee
	) public {
		if (direction == StructLib.FundWithdrawType.FUND) {
			fund(ld, ctd, ccyTypeId, amount, ledgerOwner, desc, fee, applyFee);
		} else if (direction == StructLib.FundWithdrawType.WITHDRAW) {
			withdraw(ld, ctd, ccyTypeId, amount, ledgerOwner, desc, fee, applyFee);
		} else revert("Bad direction");
	}

	function getCcyTypes(StructLib.CcyTypesStruct storage ctd)
		public
		view
		returns (StructLib.GetCcyTypesReturn memory ccys)
	{
		StructLib.Ccy[] memory ccyTypes;
		uint256 ccyTypesCount = ctd._ct_Count;
		ccyTypes = new StructLib.Ccy[](ccyTypesCount);

		for (uint256 ccyTypeId = 1; ccyTypeId <= ccyTypesCount; ccyTypeId++) {
			ccyTypes[ccyTypeId - 1] = StructLib.Ccy({
				id: ctd._ct_Ccy[ccyTypeId].id,
				name: ctd._ct_Ccy[ccyTypeId].name,
				unit: ctd._ct_Ccy[ccyTypeId].unit,
				decimals: ctd._ct_Ccy[ccyTypeId].decimals
			});
		}

		ccys = StructLib.GetCcyTypesReturn({ ccyTypes: ccyTypes });
	}

	function fund(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		uint256 ccyTypeId,
		int256 amount, // signed value: ledger supports -ve balances
		address ledgerOwner,
		string calldata desc,
		uint fee,
		bool applyFee
	) private {
		// allow funding while not sealed - for initialization of owner ledger (see testSetupContract.js)
		//require(ld._contractSealed, "Contract is not sealed");
		require(ccyTypeId >= 1 && ccyTypeId <= ctd._ct_Count, "Bad ccyTypeId");
		require(amount >= 0, "Bad amount"); // allow funding zero (initializes empty ledger entry), disallow negative funding

		// we keep amount as signed value - ledger allows -ve balances (currently unused capability)
		//uint256 fundAmount = uint256(amount);

		// create ledger entry as required
		StructLib.initLedgerIfNew(ld, ledgerOwner);

		// update ledger balance
		ld._ledger[ledgerOwner].ccyType_balance[ccyTypeId] += amount;

		emit CcyFundedLedger(ccyTypeId, ledgerOwner, amount, desc, applyFee);

		// pay the fee if applicable
		if(applyFee) {
			require(fee <= MAX_INT, "fund: fee overflow");
			require(
				(ld._ledger[ledgerOwner].ccyType_balance[ccyTypeId] -
					ld._ledger[ledgerOwner].ccyType_reserved[ccyTypeId]) >= amount + int(fee),
				"fund: not enough balance for the fee"
			);
			_transferFees(ld, ledgerOwner, ccyTypeId, fee);
		}
	}

	function withdraw(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc,
		uint fee,
		bool applyFee
	) private {
		require(ld._contractSealed, "Contract is not sealed");
		require(ccyTypeId >= 1 && ccyTypeId <= ctd._ct_Count, "Bad ccyTypeId");
		require(amount > 0, "Bad amount");
		require(ld._ledger[ledgerOwner].exists, "Bad ledgerOwner");

		if(applyFee) {
			// check fee validity and pay the fee
			require(fee <= MAX_INT, "fund: fee overflow");
			require(
				(ld._ledger[ledgerOwner].ccyType_balance[ccyTypeId] -
					ld._ledger[ledgerOwner].ccyType_reserved[ccyTypeId]) >= amount + int(fee),
				"Insufficient balance"
			);
			_transferFees(ld, ledgerOwner, ccyTypeId, fee);
		} else {
			require(
				(ld._ledger[ledgerOwner].ccyType_balance[ccyTypeId] -
					ld._ledger[ledgerOwner].ccyType_reserved[ccyTypeId]) >= amount,
				"Insufficient balance"
			);
		}

		// update ledger balance
		ld._ledger[ledgerOwner].ccyType_balance[ccyTypeId] -= amount;

		// update global total withdrawn
		// 24k
		//ld._ccyType_totalWithdrawn[ccyTypeId] += uint256(amount);

		emit CcyWithdrewLedger(ccyTypeId, ledgerOwner, amount, desc, applyFee);
	}

	function _transferFees(StructLib.LedgerStruct storage ld,address ledgerOwner, uint ccyTypeId, uint fee) internal {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		address feeOwner = s.feeAddrPerEntity[s.entitiesPerAddress[ledgerOwner]];

		StructLib.transferCcy(
			ld,
			StructLib.TransferCcyArgs({
				from: ledgerOwner,
				to: feeOwner,
				ccyTypeId: ccyTypeId,
				amount: fee,
				transferType: StructLib.TransferType.ExchangeFee
			})
		);
	}
}
