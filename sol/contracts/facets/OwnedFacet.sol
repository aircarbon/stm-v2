// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract OwnedFacet {
	function init(address[] calldata _owners, StructLib.CustodyType _custodyType) external {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
		s.owners = _owners;
		s.custodyType = _custodyType;
		s.deploymentOwner = payable(msg.sender); // payable used in solidity version 0.8.0 onwards
	}

	// replaced with init() function
	// constructor(address[] memory _owners, StructLib.CustodyType _custodyType) {
	// 	owners = _owners;
	// 	custodyType = _custodyType;
	// 	deploymentOwner = payable(msg.sender); // payable used in solidity version 0.8.0 onwards
	// }

	/**
	 * @dev change the control state to READ-ONLY [in case of emergencies or security threats as part of disaster recovery]
	 * @param readOnlyNewState only state: true or false
	 */
	function setReadOnly(bool readOnlyNewState) external {
		ValidationLib.validateOnlyOwner();
		LibMainStorage.getStorage().readOnlyState = readOnlyNewState;
	}

	/**
	 * @dev returns the read only state of the deployement
	 * @return isReadOnly
	 * @param isReadOnly returns the read only state of the deployement
	 */
	function readOnly() external view returns (bool isReadOnly) {
		isReadOnly = LibMainStorage.getStorage().readOnlyState;
	}

	/**
	 * @dev returns the deployment owner addresses
	 * @return deploymentOwners
	 * @param deploymentOwners owner's account addresses of deployment owners
	 */
	function getOwners() external view returns (address[] memory deploymentOwners) {
		deploymentOwners = LibMainStorage.getStorage().owners;
	}

	function custodyType() external view returns (StructLib.CustodyType _custodyType) {
		_custodyType = LibMainStorage.getStorage().custodyType;
	}
}
