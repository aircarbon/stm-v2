// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.5;

import { LibMainStorage } from "../../contracts/libraries/LibMainStorage.sol";
import { StructLib } from "../../contracts/libraries/StructLib.sol";

/**
 * A disposable loader-only STM storage host, NOT a production diamond.
 * Every delegated call requires the operator, including reads. Facets must be
 * independently reviewed: delegatecall is a trust boundary, not a sandbox.
 * There is no upgrade, ownership transfer, initializer, or sealing entrypoint.
 */
contract IsolatedRehearsal {
    address public immutable rehearsalOperator;
    bytes32 public immutable snapshotHash;
    mapping(bytes4 => address) private rehearsalRoutes;

    struct Route {
        bytes4 selector;
        address facet;
    }

    struct Identity {
        string name;
        string version;
        string unit;
        string symbol;
        uint8 decimals;
        address[] owners;
        address deploymentOwner;
        StructLib.CustodyType custodyType;
    }

    constructor(address operator, bytes32 sourceHash, Identity memory identity, Route[] memory routes) {
        require(operator != address(0) && sourceHash != bytes32(0), "Invalid binding");
        rehearsalOperator = operator;
        snapshotHash = sourceHash;
        LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();
        s.name = identity.name;
        s.version = identity.version;
        s.unit = identity.unit;
        s.symbol = identity.symbol;
        s.decimals = identity.decimals;
        s.owners = identity.owners;
        s.deploymentOwner = payable(identity.deploymentOwner);
        s.custodyType = identity.custodyType;
        s.ld.contractType = StructLib.ContractType.COMMODITY;
        bool operatorIsOwner;
        for (uint256 i; i < identity.owners.length; i++) {
            if (identity.owners[i] == operator) operatorIsOwner = true;
        }
        require(operatorIsOwner, "Operator must own rehearsal");
        for (uint256 i; i < routes.length; i++) {
            bytes4 selector = routes[i].selector;
            require(selector != bytes4(keccak256("sealContract()")), "Sealing prohibited");
            require(selector != this.rehearsalOperator.selector && selector != this.snapshotHash.selector, "Reserved selector");
            require(rehearsalRoutes[selector] == address(0) && routes[i].facet.code.length > 0, "Invalid route");
            rehearsalRoutes[selector] = routes[i].facet;
        }
    }

    fallback() external {
        require(msg.sender == rehearsalOperator, "Rehearsal operator only");
        address facet = rehearsalRoutes[msg.sig];
        require(facet != address(0), "Unregistered selector");
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
