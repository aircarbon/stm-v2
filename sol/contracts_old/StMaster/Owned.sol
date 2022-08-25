// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
// Certik (AD): locked compiler version
pragma solidity 0.8.5;

/**
 * @title Owned
 * @author Dominic Morris (7-of-9)
 * @notice governance contract to manage access control
 */
contract Owned {
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

	/**
	 * @dev modifier to limit access to deployment owners onlyOwner
	 */
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

	constructor(address[] memory _owners, CustodyType _custodyType) {
		owners = _owners;
		custodyType = _custodyType;
		deploymentOwner = payable(msg.sender); // payable used in solidity version 0.8.0 onwards
	}

	/**
	 * @dev change the control state to READ-ONLY [in case of emergencies or security threats as part of disaster recovery]
	 * @param readOnlyNewState only state: true or false
	 */
	function setReadOnly(bool readOnlyNewState) external onlyOwner {
		readOnlyState = readOnlyNewState;
	}

	/**
	 * @dev returns the read only state of the deployement
	 * @return isReadOnly
	 * @param isReadOnly returns the read only state of the deployement
	 */
	function readOnly() external view returns (bool isReadOnly) {
		isReadOnly = readOnlyState;
	}

	/**
	 * @dev returns the deployment owner addresses
	 * @return deploymentOwners
	 * @param deploymentOwners owner's account addresses of deployment owners
	 */
	function getOwners() external view returns (address[] memory deploymentOwners) {
		deploymentOwners = owners;
	}
}
