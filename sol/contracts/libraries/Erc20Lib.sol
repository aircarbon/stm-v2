// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
// Certik (AD): locked compiler version
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { TransferLib } from "./TransferLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";

library Erc20Lib {
	struct transferErc20Args {
		address deploymentOwner;
		address recipient;
		uint256 amount;
	}

	uint256 private constant MAX_UINT256 = 2**256 - 1; // for infinite approval

	event Transfer(address indexed from, address indexed to, uint256 value);
	event Approval(address indexed owner, address indexed spender, uint256 value);

	event EntityCreated(uint indexed entityId, address indexed feeOwner);
	event EntityUpdated(uint indexed entityId, address indexed feeOwner);
	event EntityAssignedForAccount(address indexed account, uint indexed entityId);

	function createEntity(StructLib.IdWithAddress calldata entityIdWithAddr) internal {
		uint entityId = entityIdWithAddr.id;
		address transferOrTradeFeesOwner = entityIdWithAddr.addr;

		require(entityId > 0, 'createEntity: invalid entity id');
		require(transferOrTradeFeesOwner != address(0), 'createEntity: invalid fee owner address');
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		require(!s.entityExists[entityId], 'createEntity: entity already exists');

		s.entityExists[entityId] = true;
		s.entities.push(entityId);
		s.feeAddrPerEntity[entityId] = transferOrTradeFeesOwner;

		emit EntityCreated(entityId, transferOrTradeFeesOwner);
	}

	function createEntityBatch(StructLib.IdWithAddress[] calldata entityIdWithAddr) internal {
		uint len = entityIdWithAddr.length;
		require(len > 0, "createEntityBatch: empty args array passed");

		for(uint i = 0; i < len; i++) {
			createEntity(entityIdWithAddr[i]);
		}
	}

	function updateEntity(StructLib.IdWithAddress calldata entityIdWithAddr) internal {
		uint entityId = entityIdWithAddr.id;
		address transferOrTradeFeesOwner = entityIdWithAddr.addr;

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		require(transferOrTradeFeesOwner != address(0), 'updateEntity: invalid fee owner address');
		require(s.entityExists[entityId], 'updateEntity: entity does not exist');
		require(s.feeAddrPerEntity[entityId] != transferOrTradeFeesOwner, "updateEntity: trying to update with the same value");

		s.feeAddrPerEntity[entityId] = transferOrTradeFeesOwner;
		emit EntityUpdated(entityId, transferOrTradeFeesOwner);
	}

	function updateEntityBatch(StructLib.IdWithAddress[] calldata entityIdWithAddr) internal {
		uint len = entityIdWithAddr.length;
		require(len > 0, "updateEntityBatch: empty args array passed");

		for(uint i = 0; i < len; i++) {
			updateEntity(entityIdWithAddr[i]);
		}
	}

	function setAccountEntity(StructLib.IdWithAddress memory entityIdWithAddr) internal {
		uint entityId = entityIdWithAddr.id;
		address addr = entityIdWithAddr.addr;

		if (entityId == 0) {
			return;
		}
		require(addr != address(0), "setAccountEntity: invalid entity address");

		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		require(s.erc20d._whitelisted[addr], "setAccountEntity: address is not white listed");
		require(s.entitiesPerAddress[addr] == 0, "setAccountEntity: address is already assigned to an entity");

		s.entitiesPerAddress[addr] = entityId;
		s.addressesPerEntity[entityId].push(addr);

		emit EntityAssignedForAccount(addr, entityId);
	}

	function getWhitelist(
		address[] calldata wld,
		uint256 pageNo,
		uint256 pageSize
	) external pure returns (address[] memory whitelistAddresses) {
		require(pageSize > 0 && pageSize < 2000, "Bad page size: must be > 0 and < 8750");
		whitelistAddresses = wld[pageNo * pageSize:pageNo * pageSize + pageSize];
	}

	function whitelist(
		StructLib.LedgerStruct storage ld,
		StructLib.Erc20Struct storage erc20d,
		address addr
	) public {
		require(!erc20d._whitelisted[addr], "Already whitelisted");
		require(!ld._contractSealed, "Contract is sealed");
		erc20d._whitelist.push(addr);
		erc20d._whitelisted[addr] = true;
	}

	function transfer(
		StructLib.LedgerStruct storage ld,
		StructLib.StTypesStruct storage std,
		StructLib.CcyTypesStruct storage ctd,
		mapping(uint => StructLib.FeeStruct) storage entityGlobalFees,
		mapping(address => uint256) storage entities,
		transferErc20Args memory a
	) public returns (bool) {
		require(ld._contractSealed, "Contract is not sealed");
		transferInternal(ld, std, ctd, entityGlobalFees, entities, msg.sender, a);
		return true;
	}

	function approve(
		StructLib.LedgerStruct storage ld,
		StructLib.Erc20Struct storage erc20d,
		address spender,
		uint256 amount
	) public returns (bool) {
		// amount = MAX_UINT256: infinite approval
		require(ld._contractSealed, "Contract is not sealed");
		require(!erc20d._whitelisted[spender], "Spender is whitelisted");
		require(!erc20d._whitelisted[msg.sender], "Approver is whitelisted");

		erc20d._allowances[msg.sender][spender] = amount;
		emit Approval(msg.sender, spender, amount);
		return true;
	}

	function transferFrom(
		StructLib.LedgerStruct storage ld,
		StructLib.StTypesStruct storage std,
		StructLib.CcyTypesStruct storage ctd,

		mapping(uint => StructLib.FeeStruct) storage entityGlobalFees,
		mapping(address => uint256) storage entities,
		StructLib.Erc20Struct storage erc20d,
		address sender,
		transferErc20Args memory a
	) public returns (bool) {
		uint256 allowance = erc20d._allowances[sender][msg.sender];
		require(ld._contractSealed, "Contract is not sealed");
		require(allowance >= a.amount, "No allowance"); //**

		transferInternal(ld, std, ctd, entityGlobalFees, entities, sender, a);
		if (allowance < MAX_UINT256) {
			erc20d._allowances[sender][msg.sender] -= a.amount;
		}
		return true;
	}

	function transferInternal(
		StructLib.LedgerStruct storage ld,
		StructLib.StTypesStruct storage std,
		StructLib.CcyTypesStruct storage ctd,
		mapping(uint => StructLib.FeeStruct) storage entityGlobalFees,
		mapping(address => uint256) storage entities,
		address sender,
		transferErc20Args memory a
	) private {
		uint256 remainingToTransfer = a.amount;
		while (remainingToTransfer > 0) {
			// iterate ST types
			uint256 tokenTypeCount = std._tt_Count;
			for (uint256 tokTypeId = 1; tokTypeId <= tokenTypeCount; tokTypeId++) {
				// sum qty tokens of this type
				uint256[] memory tokenType_stIds = ld._ledger[sender].tokenType_stIds[tokTypeId];
				uint256 qtyType;
				for (uint256 ndx = 0; ndx < tokenType_stIds.length; ndx++) {
					int64 currentQtyPerGlobalStId = ld._sts[tokenType_stIds[ndx]].currentQty;
					require(currentQtyPerGlobalStId > 0, "Unexpected token quantity");
					qtyType += uint256(uint64(currentQtyPerGlobalStId));
				}

				// transfer this type up to required amount
				uint256 qtyTransfer = remainingToTransfer >= qtyType
					? qtyType
					: remainingToTransfer;

				if (qtyTransfer > 0) {
					StructLib.TransferArgs memory transferOrTradeArgs = StructLib.TransferArgs({
						ledger_A: sender,
						ledger_B: a.recipient,
						qty_A: qtyTransfer,
						k_stIds_A: new uint256[](0),
						tokTypeId_A: tokTypeId,
						qty_B: 0,
						k_stIds_B: new uint256[](0),
						tokTypeId_B: 0,
						ccy_amount_A: 0,
						ccyTypeId_A: 0,
						ccy_amount_B: 0,
						ccyTypeId_B: 0,
						applyFees: false,
						feeAddrOwner_A: a.deploymentOwner, //address(0x0) // fees: disabled for erc20 - not used
						feeAddrOwner_B: a.deploymentOwner, //address(0x0) // fees: disabled for erc20 - not used
						transferType: StructLib.TransferType.ERC20
					});
					TransferLib.transferOrTrade(ld, std, ctd, entityGlobalFees, entities, transferOrTradeArgs, StructLib.CustomFee(0, 0, false));
					remainingToTransfer -= qtyTransfer;
				}
			}
		}
		emit Transfer(sender, a.recipient, a.amount);
	}
}
