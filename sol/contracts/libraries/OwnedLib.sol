// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { StructLib } from "../libraries/StructLib.sol";

library OwnedLib {
    uint8 constant THIRDPARTY_CUSTODY_NDX = 1;

    /**
	 * @dev modifier to limit access to deployment owners onlyOwner
	 */
	// modifier onlyOwner() {
	// 	uint256 ownersCount = owners.length;
	// 	for (uint256 i = 0; i < ownersCount; i++) {
	// 		if (owners[i] == msg.sender) {
	// 			_;
	// 			return;
	// 		}
	// 	}
	// 	revert("Restricted");
	// 	_;
	// }

    function onlyOwner() external view {
        LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
        uint256 ownersCount = s.owners.length;

		for (uint256 i = 0; i < ownersCount; i++) {
			if (s.owners[i] == msg.sender) {
				return;
			}
		}
		revert("Restricted");
    }

	// modifier onlyCustodian() {
	// 	uint256 ownersCount = owners.length;
	// 	if (custodyType == StructLib.CustodyType.SELF_CUSTODY) {
	// 		for (uint256 i = 0; i < ownersCount; i++) {
	// 			if (owners[i] == msg.sender) {
	// 				_;
	// 				return;
	// 			}
	// 		}
	// 		revert("Restricted");
	// 	} else {
	// 		if (custodyType == StructLib.CustodyType.THIRD_PARTY_CUSTODY) {
	// 			if (owners[THIRDPARTY_CUSTODY_NDX] == msg.sender) {
	// 				_;
	// 				return;
	// 			}
	// 			// fixed reserved addresses index for custodian address
	// 			else {
	// 				revert("Restricted");
	// 			}
	// 		}
	// 		revert("Bad custody type");
	// 	}
	// 	_;
	// }

    function onlyCustodian() external view {
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

	/**
	 * @dev access modifier to allow read-write only when the READ-ONLY mode is off
	 */
	// modifier onlyWhenReadWrite() {
	// 	require(!readOnlyState, "Read-only");
	// 	_;
	// }

    function onlyWhenReadWrite() external view {
        require(!LibMainStorage.getStorage().readOnlyState, "Read-only");
    }

}