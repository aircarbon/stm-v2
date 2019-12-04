pragma solidity 0.5.13;
pragma experimental ABIEncoderV2;

import "./Owned.sol";
import "./StLedger.sol";
import "./StFees.sol";

import "../Libs/StructLib.sol";
import "../Libs/TransferLib.sol";

contract StTransferable is Owned, StLedger, StFees {
    /**
     * @dev Transfers or trades assets between ledger accounts
     * @dev allows: one-sided transfers, transfers of same asset types, and transfers (trades) of different asset types
     * @dev disallows: movement from a single origin of more than one asset-type
     * @dev optionally applies: fees per the current fee structure, and paying them to contract owner's ledger entry
     * @param a TransferLib.TransferArgs arguments
     */
    function transfer(TransferLib.TransferArgs memory a) public {
        require(msg.sender == owner, "Restricted method");
        require(_readOnly == false, "Contract is read only");
        a.feeAddrOwner = owner;
        TransferLib.transfer(ledgerData, globalFees, a);//, owner);
    }

    /**
     * @dev Returns a fee preview for the supplied transfer; implemented in-line so that view function access is gas-free (internal contract view calls aren't free)
     * @param a TransferLib.TransferArgs arguments
     * @return Exchange fees at index 0, batch originator fees at subsequent indexes
     */
    uint256 constant MAX_BATCHES = 2; // library constants not accessible in contract; must duplicate TransferLib value
    function transfer_feePreview(
        TransferLib.TransferArgs calldata a
    )
    external view
    returns (TransferLib.FeesCalc[1 + MAX_BATCHES * 2] memory feesAll) {
        require(msg.sender == owner, "Restricted method");
        return TransferLib.transfer_feePreview(ledgerData, globalFees, a);
    }

    /**
     * @dev Returns the total global currency amount transfered for the supplied currency
     */
    function getCcy_totalTransfered(uint256 ccyTypeId) external view returns (uint256) {
        require(msg.sender == owner, "Restricted method");
        return ledgerData._ccyType_totalTransfered[ccyTypeId];
    }

    /**
     * @dev Returns the total global tonnage of carbon transfered
     */
    function getSecToken_totalTransfered() external view returns (uint256) {
        require(msg.sender == owner, "Restricted method");
        return ledgerData._tokens_totalTransferedQty;
    }
}
