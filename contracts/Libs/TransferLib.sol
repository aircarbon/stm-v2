pragma solidity 0.5.13;
pragma experimental ABIEncoderV2;

import "./StructLib.sol";

library TransferLib {
    event TransferedLedgerCcy(address from, address to, uint256 ccyTypeId, uint256 amount, bool isFee);
    event TransferedFullSecToken(address from, address to, uint256 stId, uint256 mergedToSecTokenId, /*uint256 tokenTypeId,*/ uint256 qty, bool isFee);
    event TransferedPartialSecToken(address from, address to, uint256 splitFromSecTokenId, uint256 newSecTokenId, uint256 newOrMergeSecTokenId, /*uint256 tokenTypeId,*/ uint256 qty, bool isFee);

    uint256 constant MAX_BATCHES = 100; // max distinct batch IDs that can participate in a trade

    struct TransferArgs {
        address ledger_A;
        address ledger_B;

        uint256 qty_A;           // ST quantity moving from A (excluding fees, if any)
        uint256 tokenTypeId_A;   // ST type moving from A

        uint256 qty_B;           // ST quantity moving from B (excluding fees, if any)
        uint256 tokenTypeId_B;   // ST type moving from B

        int256  ccy_amount_A;    // currency amount moving from A (excluding fees, if any)
                                 // (signed value: ledger ccyType_balance supports (theoretical) -ve balances)
        uint256 ccyTypeId_A;     // currency type moving from A

        int256  ccy_amount_B;    // currency amount moving from B (excluding fees, if any)
                                 // (signed value: ledger ccyType_balance supports (theoretical) -ve balances)
        uint256 ccyTypeId_B;     // currency type moving from B

        bool    applyFees;       // apply global fee structure to the transfer (both legs)
        address feeAddrOwner;
    }

    struct FeesCalc {
        uint256 fee_ccy_A;
        uint256 fee_ccy_B;
        uint256 fee_tok_A;
        uint256 fee_tok_B;
    }
    function transfer(
        StructLib.LedgerStruct storage ledgerData,
        StructLib.FeeStruct storage globalFees,     // global fee structure
        TransferLib.TransferArgs memory a           // args
        //address feeAddrOwner                        // exchange fees: receive address
    )
    public
    //returns(TransferSplitPreviewReturn[2] memory previews)
    {
        require(ledgerData._ledger[a.ledger_A].exists == true, "Invalid ledger owner A");
        require(ledgerData._ledger[a.ledger_B].exists == true, "Invalid ledger owner B");
        require(a.ledger_A != a.ledger_B, "Self transfer disallowed");
        require(a.qty_A > 0 || a.qty_B > 0 || a.ccy_amount_A > 0 || a.ccy_amount_B > 0, "Invalid transfer");
        require(!(a.ccy_amount_A < 0 || a.ccy_amount_B < 0), "Invalid currency amounts"); // disallow negative ccy transfers

        // disallow single origin multiple asset type movement
        require(!((a.qty_A > 0 && a.ccy_amount_A > 0) || (a.qty_B > 0 && a.ccy_amount_B > 0)), "Same origin multiple asset transfer disallowed");

        // exchange fees - calc total payable (fixed + basis points), cap & collar
        StructLib.FeeStruct storage exFeeStruct_ccy_A = ledgerData._ledger[a.ledger_A].customFees.ccyType_Set[a.ccyTypeId_A]   ? ledgerData._ledger[a.ledger_A].customFees : globalFees;
        StructLib.FeeStruct storage exFeeStruct_tok_A = ledgerData._ledger[a.ledger_A].customFees.tokType_Set[a.tokenTypeId_A] ? ledgerData._ledger[a.ledger_A].customFees : globalFees;
        StructLib.FeeStruct storage exFeeStruct_ccy_B = ledgerData._ledger[a.ledger_B].customFees.ccyType_Set[a.ccyTypeId_B]   ? ledgerData._ledger[a.ledger_B].customFees : globalFees;
        StructLib.FeeStruct storage exFeeStruct_tok_B = ledgerData._ledger[a.ledger_B].customFees.tokType_Set[a.tokenTypeId_B] ? ledgerData._ledger[a.ledger_B].customFees : globalFees;
        FeesCalc memory exFees = FeesCalc({
            fee_ccy_A: applyCapCollar(exFeeStruct_ccy_A.ccy, a.ccyTypeId_A, uint256(a.ccy_amount_A), calcFee(exFeeStruct_ccy_A.ccy, a.ccyTypeId_A, uint256(a.ccy_amount_A))),
            fee_ccy_B: applyCapCollar(exFeeStruct_ccy_B.ccy, a.ccyTypeId_B, uint256(a.ccy_amount_B), calcFee(exFeeStruct_ccy_B.ccy, a.ccyTypeId_B, uint256(a.ccy_amount_B))),
            fee_tok_A: applyCapCollar(exFeeStruct_tok_A.tok, a.tokenTypeId_A, a.qty_A,               calcFee(exFeeStruct_tok_A.tok, a.tokenTypeId_A, a.qty_A)),
            fee_tok_B: applyCapCollar(exFeeStruct_tok_B.tok, a.tokenTypeId_B, a.qty_B,               calcFee(exFeeStruct_tok_B.tok, a.tokenTypeId_B, a.qty_B))
        });

        //
        // calc originator fees
        // TODO: need to call transferSplitSecTokens() in preview mode, to return list of n transfer-from batchIds and transfer amounts from each batch
        //       we then have n sets of potential originator SetFeeArgs from the transfer-from batches...
        //       we then can make n StructLib.FeeStruct's derived from the transfer-from batch tokenType & the SetFeeArgs's
        //
        // StructLib.FeeStruct storage exFeeStruct_tok_A = ledgerData._batches[]
        // StructLib.FeeStruct storage exFeeStruct_tok_B = //...
        // FeesCalc memory exFees = FeesCalc({
        //     fee_ccy_A: 0, // originator fees are only in tokens
        //     fee_ccy_B: 0,
        //     fee_tok_A: applyCapCollar(exFeeStruct_tok_A.tok, a.tokenTypeId_A, a.qty_A,               calcFee(exFeeStruct_tok_A.tok, a.tokenTypeId_A, a.qty_A)),
        // });

        // sum them for validation...

        // validate currency balances
        require(StructLib.sufficientCcy(ledgerData, a.ledger_A, a.ccyTypeId_A, a.ccy_amount_A,
                    int256(exFees.fee_ccy_A) * (a.applyFees && a.ccy_amount_A > 0 ? 1 : 0)), "Insufficient currency held by ledger owner A");
        require(StructLib.sufficientCcy(ledgerData, a.ledger_B, a.ccyTypeId_B, a.ccy_amount_B,
                    int256(exFees.fee_ccy_B) * (a.applyFees && a.ccy_amount_B > 0 ? 1 : 0)), "Insufficient currency held by ledger owner B");

        // validate token balances
        require(StructLib.sufficientTokens(ledgerData, a.ledger_A, a.tokenTypeId_A, a.qty_A,
                    exFees.fee_tok_A * (a.applyFees && a.qty_A > 0 ? 1 : 0)), "Insufficient tokens held by ledger owner A");
        require(StructLib.sufficientTokens(ledgerData, a.ledger_B, a.tokenTypeId_B, a.qty_B,
                    exFees.fee_tok_B * (a.applyFees && a.qty_B > 0 ? 1 : 0)), "Insufficient tokens held by ledger owner B");

        // transfer currencies
        if (a.ccy_amount_A > 0) {
            if (a.applyFees) {
                if (exFees.fee_ccy_A > 0) { // exchange fees
                    transferCcy(ledgerData,
                        TransferCcyArgs({ from: a.ledger_A, to: a.feeAddrOwner, ccyTypeId: a.ccyTypeId_A, amount: exFees.fee_ccy_A, isFee: true }));
                }
            }
            // A_B
            transferCcy(ledgerData, TransferCcyArgs({ from: a.ledger_A, to: a.ledger_B, ccyTypeId: a.ccyTypeId_A, amount: uint256(a.ccy_amount_A), isFee: false }));
        }
        if (a.ccy_amount_B > 0) {
            if (a.applyFees) {
                if (exFees.fee_ccy_B > 0) { // exchange fees
                    transferCcy(ledgerData,
                        TransferCcyArgs({ from: a.ledger_B, to: a.feeAddrOwner, ccyTypeId: a.ccyTypeId_B, amount: exFees.fee_ccy_B, isFee: true }));
                }
            }
            // B_A
            transferCcy(ledgerData, TransferCcyArgs({ from: a.ledger_B, to: a.ledger_A, ccyTypeId: a.ccyTypeId_B, amount: uint256(a.ccy_amount_B), isFee: false }));
        }

        // transfer tokens
        TransferSplitPreviewReturn[2] memory previews;
        if (a.qty_A > 0) {
            if (a.applyFees) {
                if (exFees.fee_tok_A > 0) { // exchange fees
                    transferSplitSecTokens(ledgerData,
                        TransferSplitArgs({ from: a.ledger_A, to: a.feeAddrOwner, tokenTypeId: a.tokenTypeId_A, qtyUnit: exFees.fee_tok_A, isFee: true }));
                }
            }
            // A_B
            TransferSplitArgs memory A_B = TransferSplitArgs({ from: a.ledger_A, to: a.ledger_B, tokenTypeId: a.tokenTypeId_A, qtyUnit: a.qty_A, isFee: false });

            previews[0] = transferSplitSecTokens_Preview(ledgerData, A_B);
            require(previews[0].batchCount > 0, "err1");
            require(previews[0].batchIds[0] > 0, "err1.1");
            uint totalQty = 0;
            for (uint i=0; i < previews[0].batchCount; i++) totalQty += previews[0].transferQty[i];
            require(totalQty == a.qty_A, "err1.2");

            transferSplitSecTokens(ledgerData, A_B);
        }
        if (a.qty_B > 0) {
            if (a.applyFees) {
                if (exFees.fee_tok_B > 0) { // exchange fees
                    transferSplitSecTokens(ledgerData,
                        TransferSplitArgs({ from: a.ledger_B, to: a.feeAddrOwner, tokenTypeId: a.tokenTypeId_B, qtyUnit: exFees.fee_tok_B, isFee: true }));
                }
            }
            // B_A
            TransferSplitArgs memory B_A = TransferSplitArgs({ from: a.ledger_B, to: a.ledger_A, tokenTypeId: a.tokenTypeId_B, qtyUnit: a.qty_B, isFee: false });

            previews[1] = transferSplitSecTokens_Preview(ledgerData, B_A);
            require(previews[1].batchCount > 0, "err2");
            require(previews[1].batchIds[0] > 0, "err2.1");
            uint totalQty = 0;
            for (uint i=0; i < previews[1].batchCount; i++) totalQty += previews[1].transferQty[i];
            require(totalQty == a.qty_B, "err2.2");

            transferSplitSecTokens(ledgerData, B_A);
        }

        //return (previews);
    }

    /**
     * @dev Calculates fixed + basis points total fee based on the fee structure of the supplied currency or token type
     * @param feeStructure Token or currency type fee structure mapping
     * @param typeId Token or currency type ID
     * @param transferAmount Currency amount or token quantity
     * @return Total fee
     */
    function calcFee(
        mapping(uint256 => StructLib.SetFeeArgs) storage feeStructure,
        uint256 typeId,
        uint256 transferAmount)
    private view returns(uint256 totalFee) {
        return // fixed fee + basis point fee
            feeStructure[typeId].fee_fixed
            + ((transferAmount * 1000000/*precision*/ / 10000/*basis points*/) * feeStructure[typeId].fee_percBips) / 1000000/*precision*/;
    }

    /**
     * @dev Caps and collars (max and min) the supplied fee based on the fee structure of the supplied currency or token type
     * @param feeStructure Token or currency type fee structure mapping
     * @param typeId Token or currency type ID
     * @param feeAmount Uncapped/uncollared fee
     * @return Capped or collared fee
     */
    function applyCapCollar(
        mapping(uint256 => StructLib.SetFeeArgs) storage feeStructure,
        uint256 typeId,
        uint256 transferAmount,
        uint256 feeAmount)
    private view returns(uint256 totalFee) {
        if (transferAmount > 0) {
            if (feeAmount > feeStructure[typeId].fee_max && feeStructure[typeId].fee_max > 0)
                return feeStructure[typeId].fee_max;
            if (feeAmount < feeStructure[typeId].fee_min && feeStructure[typeId].fee_min > 0)
                return feeStructure[typeId].fee_min;
        }
        return feeAmount;
    }

    /**
     * @dev Transfers currency across ledger owners
     * @param a args
     */
    struct TransferCcyArgs {
        address from;
        address to;
        uint256 ccyTypeId;
        uint256 amount;
        bool isFee;
    }
    function transferCcy(
        StructLib.LedgerStruct storage ledgerData,
        TransferCcyArgs memory a)
    private {
        ledgerData._ledger[a.from].ccyType_balance[a.ccyTypeId] -= int256(a.amount);
        ledgerData._ledger[a.to].ccyType_balance[a.ccyTypeId] += int256(a.amount);
        ledgerData._ccyType_totalTransfered[a.ccyTypeId] += a.amount;
        emit TransferedLedgerCcy(a.from, a.to, a.ccyTypeId, a.amount, a.isFee);

        if (a.isFee) {
            ledgerData._ccyType_totalFeesPaid[a.ccyTypeId] += a.amount;
        }
    }

    /**
     * @dev Previews ST transfer across ledger owners
     * @param a TransferSplitArgs args
     * @return The distinct transfer-from batch IDs and the total quantity of tokens that would be transfered from each batch
     */
    struct TransferSplitPreviewReturn {
        uint256[MAX_BATCHES] batchIds; // TODO: pack these - quadratic gas cost for fixed memory
        uint256[MAX_BATCHES] transferQty;
        uint256 batchCount;
    }
    function transferSplitSecTokens_Preview(
        StructLib.LedgerStruct storage ledgerData,
        TransferSplitArgs memory a)
    private view
    returns(TransferSplitPreviewReturn memory ret)
    {
        // init ret - grotesque, but can't return (or have as local var) a dynamic array
        uint256[MAX_BATCHES] memory batchIds;
        uint256[MAX_BATCHES] memory transferQty;
        ret = TransferSplitPreviewReturn({
            batchIds: batchIds,
            transferQty: transferQty,
            batchCount: 0
        });

        // walk 1 - get distinct batches affected - needed for fixed-size return array declaration
        uint256[] memory from_stIds = ledgerData._ledger[a.from].tokenType_stIds[a.tokenTypeId]; // assignment of storage[] to memory[] is a copy
        uint256 from_stIds_length = from_stIds.length;
        uint256 remainingToTransfer = uint256(a.qtyUnit);
        while (remainingToTransfer > 0) {
            uint256 stId = from_stIds[0];
            uint256 stQty = ledgerData._sts_currentQty[stId];
            uint256 fromBatchId = ledgerData._sts_batchId[stId];

            // add to list of distinct batches, maintain transfer quantity from each batch
            bool knownBatch = false;
            for (uint i = 0; i < ret.batchCount; i++) {
                if (ret.batchIds[i] == fromBatchId) {
                    ret.transferQty[i] += remainingToTransfer >= stQty ? stQty : remainingToTransfer;
                    knownBatch = true;
                    break;
                }
            }
            if (!knownBatch) {
                require (ret.batchCount < MAX_BATCHES, "Maximum batch count exceeded for transfer");
                ret.batchIds[ret.batchCount] = fromBatchId;
                ret.transferQty[ret.batchCount] = remainingToTransfer >= stQty ? stQty : remainingToTransfer;
                ret.batchCount++;
            }

            if (remainingToTransfer >= stQty) { // full ST transfer
                //require(from_stIds_length > 1, "Unexpected: insufficient tokens of supplied type");
                from_stIds[0] = from_stIds[from_stIds_length - 1]; // replace in origin copy (ndx++, in effect)
                //from_stIds.length--;  // memory array can't be resized
                from_stIds_length--;    // so instead
                remainingToTransfer -= stQty;
            }
            else { // partial ST transfer
                remainingToTransfer = 0;
            }
        }

        return ret;
    }

    /**
     * @dev Transfers STs across ledger owners, splitting (soft-minting) the last ST as necessary
     * @dev (the residual amount left in the origin's last ST after splitting is similar to a UTXO change output)
     * @param a args
     */
    struct TransferSplitArgs {
        address from;
        address to;
        uint256 tokenTypeId;
        uint256 qtyUnit;
        bool    isFee;
    }
    function transferSplitSecTokens(
        StructLib.LedgerStruct storage ledgerData,
        TransferSplitArgs memory a)
    private {
        uint256[] storage from_stIds = ledgerData._ledger[a.from].tokenType_stIds[a.tokenTypeId];
        uint256[] storage to_stIds = ledgerData._ledger[a.to].tokenType_stIds[a.tokenTypeId];

        // walk tokens - transfer sufficient STs (last one may get split)
        uint256 ndx = 0;
        uint256 remainingToTransfer = uint256(a.qtyUnit);
        while (remainingToTransfer > 0) {
            uint256 stId = from_stIds[ndx];
            uint256 stQty = ledgerData._sts_currentQty[stId];

            if (remainingToTransfer >= stQty) {
                // reassign the full ST across the ledger entries

                // remove from origin - replace hot index 0 with value at last (ndx++, in effect)
                from_stIds[ndx] = from_stIds[from_stIds.length - 1];
                from_stIds.length--;
                //ledgerData._ledger[from].tokenType_sumQty[a.tokenTypeId] -= stQty;            //* gas - DROP DONE - only used internally, validation params

                // assign to destination
                // while minting >1 ST is disallowed, the merge condition below can never be true:

                    // MERGE - if any existing destination ST is from same batch
                    // bool mergedExisting = false;
                    // for (uint i = 0; i < to_stIds.length; i++) {
                    //     if (_sts_batchId[to_stIds[i]] == batchId) {

                    //         // resize (grow) the destination ST
                    //         _sts_currentQty[to_stIds[i]] += stQty;                // TODO gas - pack/combine
                    //         _sts_mintedQty[to_stIds[i]] += stQty;                 // TODO gas - pack/combine

                    //         // retire the old ST from the main list
                    //         _sts_currentQty[stId] = 0;
                    //         _sts_mintedQty[stId] = 0;

                    //         mergedExisting = true;
                    //         emit TransferedFullSecToken(a.from, a.to, stId, to_stIds[i], stQty/*, a.tokenTypeId*/, isFee);
                    //         break;
                    //     }
                    // }
                    // TRANSFER - if no existing destination ST from same batch
                    //if (!mergedExisting) {
                        to_stIds.push(stId);
                        emit TransferedFullSecToken(a.from, a.to, stId, 0, /*a.tokenTypeId,*/ stQty, a.isFee);
                    //}

                //ledgerData._ledger[to].tokenType_sumQty[tokenTypeId] += stQty;                //* gas - DROP DONE - only used internally, validation params

                remainingToTransfer -= stQty;
            }
            else {
                // split the last ST across the ledger entries, soft-minting a new ST in the destination
                // note: the parent (origin) ST's minted qty also gets split across the two ST;
                //         this is so the total minted in the system is unchanged,
                //         and also so the total burned amount in the ST can still be calculated by _sts_mintedQty[x] - _sts_currentQty[x]
                // note: both parent and child ST point to each other (double-linked list)

                // assign new ST to destination

                    // MERGE - if any existing destination ST is from same batch
                    bool mergedExisting = false;
                    for (uint i = 0; i < to_stIds.length; i++) {
                        if (ledgerData._sts_batchId[to_stIds[i]] == ledgerData._sts_batchId[stId]) {
                            // resize (grow) the destination ST
                            ledgerData._sts_currentQty[to_stIds[i]] += remainingToTransfer;         // TODO gas - pack/combine
                            ledgerData._sts_mintedQty[to_stIds[i]] += remainingToTransfer;          // TODO gas - pack/combine

                            mergedExisting = true;
                            emit TransferedPartialSecToken(a.from, a.to, stId, 0, to_stIds[i], /*a.tokenTypeId,*/ remainingToTransfer, a.isFee);
                            break;
                        }
                    }
                    // SOFT-MINT - if no existing destination ST from same batch
                    if (!mergedExisting) {
                        uint256 newStId = ledgerData._tokens_currentMax_id + 1;
                        ledgerData._sts_batchId[newStId] = ledgerData._sts_batchId[stId];           // inherit batch from parent ST  // TODO gas - pack/combine
                        ledgerData._sts_currentQty[newStId] = remainingToTransfer;                  // TODO gas - pack/combine
                        ledgerData._sts_mintedQty[newStId] = remainingToTransfer;                   // TODO gas - pack/combine
                        //ledgerData._sts_mintedTimestamp[newStId] = block.timestamp;               // gas - DROP DONE - can fetch from events
                        //ledgerData._sts_splitFrom_id[newStId] = stId;                             // gas - DROP DONE - can fetch from events
                        to_stIds.push(newStId);
                        ledgerData._tokens_currentMax_id++;
                        //ledgerData._ledger[to].tokenType_sumQty[tokenTypeId] += remainingToTransfer;    // gas - DROP DONE - only used internally, validation params

                        emit TransferedPartialSecToken(a.from, a.to, stId, newStId, 0, /*a.tokenTypeId,*/ remainingToTransfer, a.isFee);
                    }

                // resize (shrink) the origin ST
                ledgerData._sts_currentQty[stId] -= remainingToTransfer;                            // TODO gas - pack/combine
                ledgerData._sts_mintedQty[stId] -= remainingToTransfer;                             // TODO gas - pack/combine
                //ledgerData._sts_splitTo_id[stId] = newStId;                                         // gas - DROP DONE - can index from events
                //ledgerData._ledger[from].tokenType_sumQty[tokenTypeId] -= remainingToTransfer;    // gas - DROP DONE - only used internally, validation params

                remainingToTransfer = 0;
            }
        }
        ledgerData._tokens_totalTransferedQty += a.qtyUnit;

        if (a.isFee) {
            ledgerData._tokens_totalFeesPaidQty += a.qtyUnit;
        }
    }
}