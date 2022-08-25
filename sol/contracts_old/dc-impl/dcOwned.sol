// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

contract dcOwned {
	// CUSTODY TYPE
	enum CustodyType {
		SELF_CUSTODY,
		THIRD_PARTY_CUSTODY
	}

	uint8 constant THIRDPARTY_CUSTODY_NDX = 1;
	address payable deploymentOwner;
	bool readOnlyState;
	address[] owners;
	CustodyType public custodyType;

	modifier onlyOwner() {
		uint256 ownersCount = owners.length;
		for (uint256 i = 0; i < ownersCount; i++) {
			if (owners[i] == msg.sender) {
				_;
				return;
			}
		}
		revert("Restricted");
		_;
	}

	modifier onlyCustodian() {
		uint256 ownersCount = owners.length;
		if (custodyType == CustodyType.SELF_CUSTODY) {
			for (uint256 i = 0; i < ownersCount; i++) {
				if (owners[i] == msg.sender) {
					_;
					return;
				}
			}
			revert("Restricted");
		} else {
			if (custodyType == CustodyType.THIRD_PARTY_CUSTODY) {
				if (owners[THIRDPARTY_CUSTODY_NDX] == msg.sender) {
					_;
					return;
				}
				// fixed reserved addresses index for custodian address
				else {
					revert("Restricted");
				}
			}
			revert("Bad custody type");
		}
		_;
	}

	/**
	 * @dev access modifier to allow read-write only when the READ-ONLY mode is off
	 */
	modifier onlyWhenReadWrite() {
		require(!readOnlyState, "Read-only");
		_;
	}
}
