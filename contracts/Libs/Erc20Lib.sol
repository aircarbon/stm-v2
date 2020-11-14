// SPDX-License-Identifier: AGPL-3.0-only
// Author: https://github.com/7-of-9
pragma solidity >=0.4.21 <=0.7.1;
pragma experimental ABIEncoderV2;

import "../Interfaces/StructLib.sol";
import "./TransferLib.sol";

library Erc20Lib {
    uint256 constant private MAX_UINT256 = 2**256 - 1; // for infinite approval

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // WHITELIST - add [single]
    function whitelist(StructLib.LedgerStruct storage ld, StructLib.Erc20Struct storage erc20d, address addr) public {
        require(!erc20d._whitelisted[addr], "Already whitelisted");
        require(!ld._contractSealed, "Contract is sealed");
        erc20d._whitelist.push(addr);
        erc20d._whitelisted[addr] = true;
    }

    // TRANSFER
    struct transferErc20Args {
        address deploymentOwner;
        address recipient;
        uint256 amount;
    }
    function transfer(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        StructLib.CcyTypesStruct storage ctd,
        StructLib.FeeStruct storage globalFees,
        transferErc20Args memory a
    ) public returns (bool) {
        require(ld._contractSealed, "Contract is not sealed");
        transferInternal(ld, std, ctd, globalFees, msg.sender, a);
        return true;
    }

    // APPROVE
    function approve(
        StructLib.LedgerStruct storage ld,
        StructLib.Erc20Struct storage erc20d, 
        address spender, uint256 amount
    ) public returns (bool) { // amount = MAX_UINT256: infinite approval
        require(ld._contractSealed, "Contract is not sealed");
        require(!erc20d._whitelisted[spender], "Spender is whitelisted");
        require(!erc20d._whitelisted[msg.sender], "Approver is whitelisted");

        erc20d._allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // TRANSFER-FROM
    function transferFrom(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        StructLib.CcyTypesStruct storage ctd,
        StructLib.FeeStruct storage globalFees,
        StructLib.Erc20Struct storage erc20d, 
        address sender,
        transferErc20Args memory a
    ) public returns (bool) { 
        uint256 allowance = erc20d._allowances[sender][msg.sender];
        require(ld._contractSealed, "Contract is not sealed");
        require(allowance >= a.amount, "No allowance"); //**

        transferInternal(ld, std, ctd, globalFees, sender, a);
        if (allowance < MAX_UINT256) {
            erc20d._allowances[sender][msg.sender] -= a.amount;
        }
        return true;
    }

    //
    // (internal) transfer: across types
    //
    // ### TODO: limit cross-types to commodity only; disallow (all) erc20 entry points on CFT-C should be sufficient
    //            > i.e. totalSupply()... (+?) should just throw on CFT-C...
    //             
    //            i.e. CFT erc20 transfers and properties valid only on the base-types directly
    //
    function transferInternal(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        StructLib.CcyTypesStruct storage ctd,
        StructLib.FeeStruct storage globalFees,
        address sender,
        transferErc20Args memory a
    ) private {
        uint256 remainingToTransfer = a.amount;
        while (remainingToTransfer > 0) {
            // iterate ST types
            for (uint256 tokTypeId = 1; tokTypeId <= std._tt_Count; tokTypeId++) {

                // sum qty tokens of this type
                uint256[] memory tokenType_stIds = ld._ledger[sender].tokenType_stIds[tokTypeId];
                uint256 qtyType;
                for (uint256 ndx = 0; ndx < tokenType_stIds.length; ndx++) {
                    require(ld._sts[tokenType_stIds[ndx]].currentQty > 0, "Unexpected token quantity");
                    qtyType += uint256(ld._sts[tokenType_stIds[ndx]].currentQty);
                }

                // transfer this type up to required amount
                uint256 qtyTransfer = remainingToTransfer >= qtyType ? qtyType : remainingToTransfer;

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
                        feeAddrOwner: a.deploymentOwner //address(0x0) // fees: disabled for erc20 - not used
                    });
                    TransferLib.transferOrTrade(ld, std, ctd, globalFees, transferOrTradeArgs);
                    remainingToTransfer -= qtyTransfer;
                }
            }
        }
        emit Transfer(sender, a.recipient, a.amount);
    }
}