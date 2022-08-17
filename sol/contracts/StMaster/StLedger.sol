// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
// Certik (AD): locked compiler version
pragma solidity 0.8.5;

import "./Owned.sol";

import "../Interfaces/StructLib.sol";
import "../Libs/LedgerLib.sol";
import "../Libs/TokenLib.sol";

/**
 * @title Security Token Ledger
 * @author Dominic Morris (7-of-9) and Ankur Daharwal (ankurdaharwal)
 * @notice casflow controller and commodity: maintains the global ledger for all security tokens<br/>
 * cashflow token: maintains the ledger for the security tokens in the CFT base
 * <pre>   - inherits Owned ownership smart contract</pre>
 * <pre>   - uses StructLib interface library</pre>
 * <pre>   - uses TokenLib runtime library</pre>
 * <pre>   - uses LedgerLib runtime library</pre>
 */

abstract contract StLedger is Owned {
	StructLib.LedgerStruct ld;
	StructLib.StTypesStruct std;
	StructLib.CcyTypesStruct ctd;

	mapping(address => uint) internal entities;
	mapping(uint => address[]) internal addressesPerEntity;

	modifier hasEntity(address addr) {
		require(addr == address(0) || getEntity(addr) != 0, "The address is not assigned to any entity");
		_;
	}

	function addSecTokenTypeBatch(StructLib.AddSecTokenTypeBatchArgs[] calldata params) 
		external 
		onlyOwner 
		onlyWhenReadWrite 
	{
		TokenLib.addSecTokenTypeBatch(ld, std, ctd, params);
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
		secTokenTypes = TokenLib.getSecTokenTypes(std);
	}

	function getEntityAddresses(uint entityId) external view returns(address[] memory) {
		require(entityId > 0, "getEntityAddresses: wrong entity id");
		return addressesPerEntity[entityId];
	}

	/**
	 * @dev returns all ledger owners
	 * @return ledgerOwners
	 * @param ledgerOwners returns all ledger owners
	 */
	function getLedgerOwners() external view returns (address[] memory ledgerOwners) {
		ledgerOwners = ld._ledgerOwners;
	}

	// 24k??
	/**
	 * @dev returns the total count of all ledger owners
	 * @return ledgerOwnerCount
	 * @param ledgerOwnerCount returns the total count of all ledger owners
	 */
	function getLedgerOwnerCount() external view returns (uint256 ledgerOwnerCount) {
		ledgerOwnerCount = ld._ledgerOwners.length;
	}

	/**
	 * @dev returns the ledger owner based on HD wallet derived index
	 * @param index HD wallet derived index
	 * @return ledgerOwner
	 * @param ledgerOwner returns the ledger owner based on HD wallet derived index
	 */
	function getLedgerOwner(uint256 index) external view returns (address ledgerOwner) {
		ledgerOwner = ld._ledgerOwners[index];
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
		ledgerEntry = LedgerLib.getLedgerEntry(ld, std, ctd, account);
	}

	// get batch(es)
	/**
	 * @dev helps keep track of the maximum security token batch ID
	 * @return secTokenBatch_MaxId
	 * @param secTokenBatch_MaxId returns the maximum identifier of 1-based security token batches IDs
	 */
	function getSecTokenBatch_MaxId() external view returns (uint256 secTokenBatch_MaxId) {
		secTokenBatch_MaxId = ld._batches_currentMax_id;
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
		secTokenBatch = ld._batches[batchId];
	}

	// get token(s)
	/**
	 * @dev returns the security token base id
	 * @return secTokenBaseId
	 * @param secTokenBaseId returns the security token base id
	 */
	function getSecToken_BaseId() external view returns (uint256 secTokenBaseId) {
		secTokenBaseId = ld._tokens_base_id;
	} // 1-based

	/**
	 * @dev returns the maximum count for security token types
	 * @return secTokenMaxId
	 * @param secTokenMaxId returns the maximum count for security token types
	 */
	function getSecToken_MaxId() external view returns (uint256 secTokenMaxId) {
		secTokenMaxId = ld._tokens_currentMax_id;
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
		secToken = TokenLib.getSecToken(ld, std, id);
	}

	function getEntityBatch(address[] calldata addr) external view returns(uint[] memory results) {
		uint len = addr.length;
		results = new uint[](len);

		for(uint i = 0; i < len; i++) {
			results[i] = getEntity(addr[i]);
		}
	}

	// commented out due to the smart contract size limit. Using addSecTokenTypeBatch() method instead
	// add token type: direct (by name) or cashflow base (by address)
	// /**
	//  * @dev add a new security token type
	//  * @param name security token name
	//  * @param settlementType 0: undefined<br/>1: spot<br/>2: future
	//  * @param ft future token
	//  * @param cashflowBaseAddr account address of the cashflow base token (CFT)
	//  */
	// function addSecTokenType(
	// 	string memory name,
	// 	StructLib.SettlementType settlementType,
	// 	StructLib.FutureTokenTypeArgs memory ft,
	// 	address payable cashflowBaseAddr
	// ) public onlyOwner onlyWhenReadWrite {
	// 	TokenLib.addSecTokenType(ld, std, ctd, name, settlementType, ft, cashflowBaseAddr);
	// }

	function getEntity(address addr) public view returns(uint) {
		require(addr != address(0), "getEntity: invalid address");
		return entities[addr];
	}
}
