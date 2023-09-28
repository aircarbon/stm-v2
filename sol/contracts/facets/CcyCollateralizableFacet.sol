// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { CcyLib } from "../libraries/CcyLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract CcyCollateralizableFacet {
	/**
	 * @dev returns the current supporting currencies
	 * @return ccyTypes
	 * @param ccyTypes array of supporting currency types struct
	 */
	function getCcyTypes() external view returns (StructLib.GetCcyTypesReturn memory ccyTypes) {
		return CcyLib.getCcyTypes(LibMainStorage.getStorage().ctd);
	}

	/**
	 * @dev add supporting currency types
	 * @param name name of the currency
	 * @param unit unit of the currency
	 * @param decimals level of precision of the currency
	 */
	function addCcyType(
		string memory name,
		string memory unit,
		uint16 decimals
	) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		CcyLib.addCcyType(s.ld, s.ctd, name, unit, decimals);
	}

	function addCcyTypeBatch(
		string[] calldata _name,
		string[] calldata _unit,
		uint16[] calldata _decimals
	) external {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		CcyLib.addCcyTypeBatch(s.ld, s.ctd, _name, _unit, _decimals);
	}

	/**
	 * @dev fund or withdraw currency type collaterised tokens from a ledger owner address
	 * @param direction 0: FUND<br/>1: WITHDRAW
	 * @param ccyTypeId currency type identifier
	 * @param amount amount to be funded or withdrawn
	 * @param ledgerOwner account address to be funded or withdrawn from
	 * @param desc supporting evidence like bank wire reference or comments
	 */
	function fundOrWithdraw(
		StructLib.FundWithdrawType direction,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc
	) public {
		_fundOrWithdraw(direction, ccyTypeId, amount, ledgerOwner, desc, 0, false);
	}

	/**
	 * @dev fund or withdraw currency type collaterised tokens from a ledger owner address
	 * @param direction 0: FUND<br/>1: WITHDRAW
	 * @param ccyTypeId currency type identifier
	 * @param amount amount to be funded or withdrawn
	 * @param ledgerOwner account address to be funded or withdrawn from
	 * @param desc supporting evidence like bank wire reference or comments
	 * @param fee custom fee
	 */
	 function fundOrWithdrawCustomFee(
		StructLib.FundWithdrawType direction,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc,
		uint fee
	) public {
		_fundOrWithdraw(direction, ccyTypeId, amount, ledgerOwner, desc, fee, true);
	}

	function _fundOrWithdraw(
		StructLib.FundWithdrawType direction,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc,
		uint fee,
		bool applyFee
	) internal {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();
		ValidationLib.validateHasEntity(ledgerOwner);

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		CcyLib.fundOrWithdraw(s.ld, s.ctd, direction, ccyTypeId, amount, ledgerOwner, desc, fee, applyFee);
	}
}
