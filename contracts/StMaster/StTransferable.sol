pragma solidity >=0.4.21 <=0.6.6;
pragma experimental ABIEncoderV2;

//import "../Interfaces/IStTransferable.sol";

import "./Owned.sol";
import "./StLedger.sol";
import "./StFees.sol";
import "./StErc20.sol";
import "./StPayable.sol";

import "../Interfaces/StructLib.sol";
import "../Libs/TransferLib.sol";
import "../Libs/Erc20Lib.sol";
import "../Libs/LedgerLib.sol";

abstract // solc 0.6
contract StTransferable is Owned,
    //IStTransferable,
    StLedger, StFees, StErc20, StPayable {

    function getLedgerHashcode() external view returns (bytes32) {
        return LedgerLib.getLedgerHashcode(ld, std, ctd, erc20d, /*cashflowData,*/ globalFees);
    }

    function transferOrTrade(StructLib.TransferArgs memory a)
    public onlyOwner() onlyWhenReadWrite() {
        // abort if sending tokens from a non-whitelist account
        require(!(a.qty_A > 0 && !erc20d._whitelisted[a.ledger_A]), "Not whitelisted (A)");
        require(!(a.qty_B > 0 && !erc20d._whitelisted[a.ledger_B]), "Not whitelisted (B)");

        a.feeAddrOwner = owner;
        TransferLib.transferOrTrade(ld, ctd, globalFees, a);
    }

    uint256 constant MAX_BATCHES_PREVIEW = 128; // library constants not accessible in contract; must duplicate TransferLib value
    function transfer_feePreview(StructLib.TransferArgs calldata a)
    external view returns (StructLib.FeesCalc[1 + MAX_BATCHES_PREVIEW * 2] memory feesAll) {
        return TransferLib.transfer_feePreview(ld, globalFees, owner, a);
    }

    function getCcy_totalTransfered(uint256 ccyTypeId)
    external view returns (uint256) {
        return ld._ccyType_totalTransfered[ccyTypeId];
    }

    function getSecToken_totalTransferedQty()
    external view returns (uint256) {
        return ld._spot_total.transferedQty;
    }
}
