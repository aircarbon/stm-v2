// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LedgerLib } from "../libraries/LedgerLib.sol";
import { TokenLib } from "../libraries/TokenLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StLedgerFacet {

	function retokenizeSecToken(
		uint256 tokTypeId,
		uint256 mintQty,
		int64 mintSecTokenCount,
		address payable batchOwner,
		StructLib.SetFeeArgs memory originatorFee,
		uint16 origCcyFee_percBips_ExFee,
		string[] memory metaKeys,
		string[] memory metaValues,
		StructLib.IdAndQuantity[] memory idWithQty
	) external {
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
		TokenLib.retokenizeSecToken(s.ld, s.std, args, idWithQty);
	}

	function addSecTokenTypeBatch(StructLib.AddSecTokenTypeBatchArgs[] calldata params) external {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		TokenLib.addSecTokenTypeBatch(s.ld, s.std, s.ctd, params);
	}

	/**
	 * @dev returns all security token types
	 * @return secTokenTypes
	 * @param secTokenTypes returns all security token types
	 */
	function getSecTokenTypes()
		external
		view
		returns (StructLib.GetSecTokenTypesReturn memory secTokenTypes)
	{
		secTokenTypes = TokenLib.getSecTokenTypes(LibMainStorage.getStorage().std);
	}

	function getEntityAddresses(uint256 entityId) external view returns (address[] memory) {
		ValidationLib.validateEntityExists(entityId);
		return LibMainStorage.getStorage().addressesPerEntity[entityId];
	}

	/**
	 * @dev returns all ledger owners
	 * @return ledgerOwners
	 * @param ledgerOwners returns all ledger owners
	 */
	function getLedgerOwners() external view returns (address[] memory ledgerOwners) {
		ledgerOwners = LibMainStorage.getStorage().ld._ledgerOwners;
	}

	// 24k??
	/**
	 * @dev returns the total count of all ledger owners
	 * @return ledgerOwnerCount
	 * @param ledgerOwnerCount returns the total count of all ledger owners
	 */
	function getLedgerOwnerCount() external view returns (uint256 ledgerOwnerCount) {
		ledgerOwnerCount = LibMainStorage.getStorage().ld._ledgerOwners.length;
	}

	/**
	 * @dev returns the ledger owner based on HD wallet derived index
	 * @param index HD wallet derived index
	 * @return ledgerOwner
	 * @param ledgerOwner returns the ledger owner based on HD wallet derived index
	 */
	function getLedgerOwner(uint256 index) external view returns (address ledgerOwner) {
		ledgerOwner = LibMainStorage.getStorage().ld._ledgerOwners[index];
	}

	/**
	 * @dev returns the ledger entry for the account provided
	 * @param account account address of the ledger owner whose holding needs to be queried from the ledger
	 * @return ledgerEntry
	 * @param ledgerEntry returns the ledger entry for the account provided
	 */
	function getLedgerEntry(address account)
		external
		view
		returns (StructLib.LedgerReturn memory ledgerEntry)
	{
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		ledgerEntry = LedgerLib.getLedgerEntry(s.ld, s.std, s.ctd, account);
	}

	// get batch(es)
	/**
	 * @dev helps keep track of the maximum security token batch ID
	 * @return secTokenBatch_MaxId
	 * @param secTokenBatch_MaxId returns the maximum identifier of 1-based security token batches IDs
	 */
	function getSecTokenBatch_MaxId() external view returns (uint256 secTokenBatch_MaxId) {
		secTokenBatch_MaxId = LibMainStorage.getStorage().ld._batches_currentMax_id;
	} // 1-based

	/**
	 * @dev returns a security token batch
	 * @param batchId security token batch unique identifier
	 * @return secTokenBatch
	 * @param secTokenBatch returns a security token batch
	 */
	function getSecTokenBatch(uint256 batchId)
		external
		view
		returns (StructLib.SecTokenBatch memory secTokenBatch)
	{
		secTokenBatch = LibMainStorage.getStorage().ld._batches[batchId];
	}

	// get token(s)
	/**
	 * @dev returns the security token base id
	 * @return secTokenBaseId
	 * @param secTokenBaseId returns the security token base id
	 */
	function getSecToken_BaseId() external view returns (uint256 secTokenBaseId) {
		secTokenBaseId = LibMainStorage.getStorage().ld._tokens_base_id;
	} // 1-based

	/**
	 * @dev returns the maximum count for security token types
	 * @return secTokenMaxId
	 * @param secTokenMaxId returns the maximum count for security token types
	 */
	function getSecToken_MaxId() external view returns (uint256 secTokenMaxId) {
		secTokenMaxId = LibMainStorage.getStorage().ld._tokens_currentMax_id;
	} // 1-based

	/**
	 * @dev returns a security token
	 * @param id unique security token identifier
	 * @return secToken
	 * @param secToken returns a security token for the identifier provided
	 */
	function getSecToken(uint256 id)
		external
		view
		returns (StructLib.LedgerSecTokenReturn memory secToken)
	{
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		secToken = TokenLib.getSecToken(s.ld, s.std, id);
	}

	function getAccountEntity (address addr) public view returns (uint256) {
		require(addr != address(0), "getEntity: invalid address");
		return LibMainStorage.getStorage().entities[addr];
	}

	function getAccountEntityBatch(address[] calldata addr)
		external
		view
		returns (uint256[] memory results)
	{
		uint256 len = addr.length;
		results = new uint256[](len);

		for (uint256 i = 0; i < len; i++) {
			results[i] = getAccountEntity(addr[i]);
		}
	}

	// commented out due to the smart contract size limit. Using addSecTokenTypeBatch() method instead
	// add token type: direct (by name) or cashflow base (by address)
	/**
	 * @dev add a new security token type
	 * @param name security token name
	 * @param settlementType 0: undefined<br/>1: spot<br/>2: future
	 * @param ft future token
	 * @param cashflowBaseAddr account address of the cashflow base token (CFT)
	 */
	function addSecTokenType(
		string memory name,
		StructLib.SettlementType settlementType,
		StructLib.FutureTokenTypeArgs memory ft,
		address payable cashflowBaseAddr
	) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateOnlyWhenReadWrite();

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		TokenLib.addSecTokenType(s.ld, s.std, s.ctd, name, settlementType, ft, cashflowBaseAddr);
	}
}
