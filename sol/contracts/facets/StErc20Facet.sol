// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { TransferLib } from "../libraries/TransferLib.sol";
import { LedgerLib } from "../libraries/LedgerLib.sol";
import { Erc20Lib } from "../libraries/Erc20Lib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StErc20Facet {

	function setVersion(string calldata version) external {
		ValidationLib.validateOnlyOwner();
		LibMainStorage.getStorage().version = version;
	}

	function createEntity(StructLib.IdWithAddress calldata entityIdWithAddr) external {
		ValidationLib.validateOnlyOwner();
		Erc20Lib.createEntity(entityIdWithAddr);
	}

	function createEntityBatch(StructLib.IdWithAddress[] calldata entityIdWithAddr) external {
		ValidationLib.validateOnlyOwner();
		Erc20Lib.createEntityBatch(entityIdWithAddr);
	}

	function updateEntity(StructLib.IdWithAddress calldata entityIdWithAddr) external {
		ValidationLib.validateOnlyOwner();
		Erc20Lib.updateEntity(entityIdWithAddr);
	}

	function updateEntityBatch(StructLib.IdWithAddress[] calldata entityIdWithAddr) external {
		ValidationLib.validateOnlyOwner();
		Erc20Lib.updateEntityBatch(entityIdWithAddr);
	}
	
	function setAccountEntity(StructLib.IdWithAddress memory entityIdWithAddr) public {
		ValidationLib.validateOnlyOwner();
		ValidationLib.validateEntityExists(entityIdWithAddr.id);
		Erc20Lib.setAccountEntity(entityIdWithAddr);
	}

	function setAccountEntityBatch(StructLib.IdWithAddress[] memory entityIdWithAddr) external {
		ValidationLib.validateOnlyOwner();

		uint256 len = entityIdWithAddr.length;

		for (uint256 i = 0; i < len; i++) {
			ValidationLib.validateEntityExists(entityIdWithAddr[i].id);
			Erc20Lib.setAccountEntity(entityIdWithAddr[i]);
		}
	}

	function entityExists(uint entityId) public view returns(bool) {
		return LibMainStorage.getStorage3().entityExists[entityId];
	}

	function getAllEntities() public view returns(uint[] memory) {
		return LibMainStorage.getStorage3().entities;
	}

	function getEntityFeeOwner(uint entityId) external view returns(address) {
		require(entityExists(entityId), 'getEntityFeeOwner: entity does not exist');
		return _getEntityFeeOwner(entityId);
	}

	function getAllEntitiesWithFeeOwners() external view returns(StructLib.IdWithAddress[] memory entityIdWithAddr) {
		uint[] memory entityIds = getAllEntities();
		uint len = entityIds.length;

		entityIdWithAddr = new StructLib.IdWithAddress[](len);

		for(uint i = 0; i < len; i++) {
			uint entityId = entityIds[i];
			entityIdWithAddr[i] = StructLib.IdWithAddress({id: entityId, addr: _getEntityFeeOwner(entityId)});
		}
	}

	function symbol() external view returns (string memory _symbol) {
		_symbol = LibMainStorage.getStorage().symbol;
	}

	function decimals() external view returns (uint256 _decimals) {
		_decimals = LibMainStorage.getStorage().decimals;
	}

	/**
	 * @dev add multiple whitelist account addresses by deployment owners only
	 * @param addr list of account addresses to be whitelisted
	 */

	function whitelistMany(address[] calldata addr) external {
		ValidationLib.validateOnlyOwner();
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		for (uint256 i = 0; i < addr.length; i++) {
			Erc20Lib.whitelist(s.ld, s.erc20d, addr[i]);
		}
	}

	/**
	 * @dev return whitelist addresses count
	 * @return whitelistAddressCount
	 * @param whitelistAddressCount count of whitelisted account addresses
	 */
	function getWhitelistCount() external view returns (uint256 whitelistAddressCount) {
		whitelistAddressCount = LibMainStorage.getStorage().erc20d._whitelist.length;
	}

	/**
	 * @dev return all whitelist addresses
	 * @return whitelistAddresses
	 * @param whitelistAddresses list of all whitelisted account addresses
	 */
	function getWhitelist() external view returns (address[] memory whitelistAddresses) {
		whitelistAddresses = LibMainStorage.getStorage().erc20d._whitelist;
	}

	/**
	 * @dev return all whitelist addresses (extended functionality to overcome gas constraint for a larger whitelist set)
	 * @return whitelistAddresses
	 * @param whitelistAddresses list of all whitelisted account addresses
	 */
	function getWhitelist(uint256 pageNo, uint256 pageSize)
		external
		view
		returns (address[] memory whitelistAddresses)
	{
		require(pageSize > 0 && pageSize < 2000, "Bad page size: must be > 0 and < 2000");
		whitelistAddresses = Erc20Lib.getWhitelist(
			LibMainStorage.getStorage().erc20d._whitelist,
			pageNo,
			pageSize
		);
	}

	function init(string memory _symbol, uint8 _decimals) external {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		s.symbol = _symbol;
		s.decimals = _decimals;
	}

	/**
	 * @dev standard ERC20 token
	 * @param _symbol token symbol
	 * @param _decimals level of precision of the tokens
	 */
	// constructor(string memory _symbol, uint8 _decimals) {
	// 	symbol = _symbol;
	// 	decimals = _decimals;
	// }

	/**
	 * @dev standard ERC20 token transfer
	 * @param recipient receiver's account address
	 * @param amount to be transferred to the recipient
	 * @return transferStatus
	 * @param transferStatus returns status of transfer: true or false
	 */
	function transfer(address recipient, uint256 amount) public returns (bool transferStatus) {
		require(balanceOf(msg.sender) >= amount, "Insufficient tokens");
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		transferStatus = Erc20Lib.transfer(
			s.ld,
			s.std,
			s.ctd,
			LibMainStorage.getStorage2().entityGlobalFees, 
			s.entities, 
			Erc20Lib.transferErc20Args({
				deploymentOwner: s.deploymentOwner,
				recipient: recipient,
				amount: amount
			})
		);
	}

	/**
	 * @dev standard ERC20 token transferFrom
	 * @param sender ERC20 token sender
	 * @param recipient ERC20 tkoen receiver
	 * @param amount amount to be transferred
	 * @return transferFromStatus
	 * @param transferFromStatus returns status of transfer: true or false
	 */
	function transferFrom(
		address sender,
		address recipient,
		uint256 amount
	) public returns (bool transferFromStatus) {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		transferFromStatus = Erc20Lib.transferFrom(
			s.ld,
			s.std,
			s.ctd,
			LibMainStorage.getStorage2().entityGlobalFees, 
			s.entities, 
			s.erc20d,
			sender,
			Erc20Lib.transferErc20Args({
				deploymentOwner: s.deploymentOwner,
				recipient: recipient,
				amount: amount
			})
		);
	}

	/**
	 * @dev standard ERC20 token approve
	 * @param spender spender of the erc20 tokens to be give approval for allowance
	 * @param amount amount to be approved for allowance for spending on behalf of the owner
	 * @return approvalStatus
	 * @param approvalStatus returns approval status
	 */
	function approve(address spender, uint256 amount) public returns (bool approvalStatus) {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		approvalStatus = Erc20Lib.approve(s.ld, s.erc20d, spender, amount);
	}

	/**
	 * @dev standard ERC20 token total supply
	 * @return availableQty
	 * @param availableQty returns total available quantity (minted quantity - burned quantitypublic
	 */
	function totalSupply() public view returns (uint256 availableQty) {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		availableQty = s.ld._spot_totalMintedQty - s.ld._spot_totalBurnedQty;
	}

	/**
	 * @dev standard ERC20 token balanceOf
	 * @param account account address to check the balance of
	 * @return balance
	 * @param balance returns balance of the account address provided
	 */
	function balanceOf(address account) public view returns (uint256 balance) {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		StructLib.LedgerReturn memory ret = LedgerLib.getLedgerEntry(s.ld, s.std, s.ctd, account);
		balance = ret.spot_sumQty;
	}

	/**
	 * @dev standard ERC20 token allowance
	 * @param sender (owner) of the erc20 tokens
	 * @param spender of the erc20 tokens
	 * @return spendAllowance
	 * @param spendAllowance returns the erc20 allowance as per approval by owner
	 */
	function allowance(address sender, address spender)
		public
		view
		returns (uint256 spendAllowance)
	{
		spendAllowance = LibMainStorage.getStorage().erc20d._allowances[sender][spender];
	}

	function _getEntityFeeOwner(uint entityId) internal view returns(address) {
		return LibMainStorage.getStorage3().feeAddrPerEntity[entityId];
	}
}
