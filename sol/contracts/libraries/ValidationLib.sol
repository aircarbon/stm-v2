// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { StructLib } from "../libraries/StructLib.sol";

library ValidationLib {
	uint8 constant THIRDPARTY_CUSTODY_NDX = 1;

	function validateOnlyOwner() external view {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		uint256 ownersCount = s.owners.length;

		for (uint256 i = 0; i < ownersCount; i++) {
			if (s.owners[i] == msg.sender) {
				return;
			}
		}
		revert("Restricted");
	}

	function validateOnlyCustodian() external view {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		uint256 ownersCount = s.owners.length;

		if (s.custodyType == StructLib.CustodyType.SELF_CUSTODY) {
			for (uint256 i = 0; i < ownersCount; i++) {
				if (s.owners[i] == msg.sender) {
					return;
				}
			}
			revert("Restricted");
		} else {
			if (s.custodyType == StructLib.CustodyType.THIRD_PARTY_CUSTODY) {
				if (s.owners[THIRDPARTY_CUSTODY_NDX] == msg.sender) {
					return;
				}
				// fixed reserved addresses index for custodian address
				else {
					revert("Restricted");
				}
			}
			revert("Bad custody type");
		}
	}

	function validateOnlyWhenReadWrite() external view {
		require(!LibMainStorage.getStorage().readOnlyState, "Read-only");
	}

	function validateHasEntity(address addr) external view {
		require(
			addr == address(0) || LibMainStorage.getStorage().entitiesPerAddress[addr] != 0,
			"The address is not assigned to any entity"
		);
	}

	function validateEntityExists(uint entityId) external view {
		require(LibMainStorage.getStorage().entityExists[entityId], "Entity does not exist");
	}
}
