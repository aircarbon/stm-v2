// SPDX-License-Identifier: AGPL-3.0-only
// Author: https://github.com/7-of-9
pragma solidity >=0.4.21 <=0.6.10;
pragma experimental ABIEncoderV2;

import "./Owned.sol";

import "../Interfaces/StructLib.sol";
import "../Libs/LedgerLib.sol";
import "../Libs/TokenLib.sol";

contract StLedger is
    Owned {

    StructLib.LedgerStruct ld;
    StructLib.StTypesStruct std;
    StructLib.CcyTypesStruct ctd;

    //
    // MUTATE LEDGER
    //

    // add token type: direct (by name) or cashflow base (by address)
    function addSecTokenType(string memory name, StructLib.SettlementType settlementType, StructLib.FutureTokenTypeArgs memory ft, address payable cashflowBaseAddr)
    public onlyOwner() onlyWhenReadWrite() { TokenLib.addSecTokenType(ld, std, ctd, name, settlementType, ft, cashflowBaseAddr); }

    // function initLedgerIfNew(address account)
    // public onlyOwner() onlyWhenReadWrite() {
    //     StructLib.initLedgerIfNew(ld, account);
    // }

    // #### TODO - move to StFutures...
    function setFuture_VariationMargin(uint256 tokTypeId, uint16 varMarginBips)
    public onlyOwner() onlyWhenReadWrite() {
        TokenLib.setFuture_VariationMargin(std, tokTypeId, varMarginBips); // ### recalc all open pos margin/reserve; needs to be batched (job) - re. gas limits
    }
    function setFuture_FeePerContract(uint256 tokTypeId, uint128 feePerContract)
    public onlyOwner() onlyWhenReadWrite() {
        TokenLib.setFuture_FeePerContract(std, tokTypeId, feePerContract);
    }

    function setReservedCcy(uint256 ccyTypeId, int256 reservedAmount, address ledger)
    public onlyOwner() onlyWhenReadWrite() {
        StructLib.setReservedCcy(ld, ctd, ledger, ccyTypeId, reservedAmount);
    }

    //
    // VIEW LEDGER
    //
    function getSecTokenTypes() external view returns (StructLib.GetSecTokenTypesReturn memory) { return TokenLib.getSecTokenTypes(std); }

    function getLedgerOwners() external view returns (address[] memory) { return ld._ledgerOwners; }

    // 24k??
    function getLedgerOwnerCount() external view returns (uint256) { return ld._ledgerOwners.length; }

    function getLedgerOwner(uint256 index) external view returns (address) { return ld._ledgerOwners[index]; }
    function getLedgerEntry(address account) external view returns (StructLib.LedgerReturn memory) { return LedgerLib.getLedgerEntry(ld, std, ctd, account); }

    // get batch(es)
    function getSecTokenBatch_MaxId() external view returns (uint256) { return ld._batches_currentMax_id; } // 1-based
    function getSecTokenBatch(uint256 batchId) external view returns (StructLib.SecTokenBatch memory) {
        //require(batchId >= 1 && batchId <= ld._batches_currentMax_id, "Bad batchId"); // 24k
        return ld._batches[batchId];
    }

    // get token(s)
    function getSecToken_BaseId() external view returns (uint256) { return ld._tokens_base_id; } // 1-based
    function getSecToken_MaxId() external view returns (uint256) { return ld._tokens_currentMax_id; } // 1-based
    function getSecToken(uint256 id) external view returns (
        StructLib.LedgerSecTokenReturn memory
    ) {
        return TokenLib.getSecToken(ld, std, id);
    }
}
