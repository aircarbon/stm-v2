pragma solidity ^0.5.13;
pragma experimental ABIEncoderV2;

import "../Interfaces/StructLib.sol";

library FuturesLib {
    event FutureOpenInterest(address indexed long, address indexed short, /*uint256 shortStId,*/ uint256 tokTypeId, uint256 qty, uint256 price);
    event SetInitialMargin(uint256 tokenTypeId, address indexed ledgerOwner, uint16 initMarginBips);
    event TakePay(address indexed from, address indexed to, uint256 delta, uint256 done, address indexed feeTo, uint256 otmFee, uint256 itmFee, uint256 feeCcyId);

    //
    // PUBLIC - get/set initial margin ledger override
    //
    function setInitMargin_TokType(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        address ledgerOwner,
        uint256 tokTypeId,
        uint16  initMarginBips
    ) public {
        require(tokTypeId >= 0 && tokTypeId <= std._tt_Count, "Bad tokTypeId");
        require(std._tt_Settle[tokTypeId] == StructLib.SettlementType.FUTURE, "Bad token settlement type");
        require(/*std._tt_ft[tokTypeId].varMarginBips +*/initMarginBips <= 10000, "Bad total margin");

        StructLib.initLedgerIfNew(ld, ledgerOwner);
        ld._ledger[ledgerOwner].ft_initMarginBips[tokTypeId] = initMarginBips;
        emit SetInitialMargin(tokTypeId, ledgerOwner, initMarginBips);
    }

    //
    // PUBLIC - open futures position
    //
    function openFtPos(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        StructLib.CcyTypesStruct storage ctd,
        StructLib.FeeStruct storage globalFees,
        StructLib.FuturesPositionArgs memory a,
        address owner
    ) public {
        require(ld._contractSealed, "Contract is not sealed");
        require(a.ledger_A != a.ledger_B, "Bad transfer");
        require(a.qty_A <= 0x7FFFFFFFFFFFFFFF && a.qty_B <= 0x7FFFFFFFFFFFFFFF && a.qty_A >= -0x7FFFFFFFFFFFFFFF && a.qty_B >= -0x7FFFFFFFFFFFFFFF && a.qty_A != 0 && a.qty_B != 0, "Bad quantity"); // min/max signed int64, non-zero
        require(a.qty_A + a.qty_B == 0, "Quantity mismatch");
        require(a.tokTypeId >= 0 && a.tokTypeId <= std._tt_Count, "Bad tokTypeId");
        require(std._tt_Settle[a.tokTypeId] == StructLib.SettlementType.FUTURE, "Bad token settlement type");
        require(a.price <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF && a.price > 0, "Bad price"); // max signed int128, non-zero

        // apply fees
        int256 posSize = (a.qty_A < 0 ? a.qty_B : a.qty_A);
        int256 fee = std._tt_ft[a.tokTypeId].feePerContract * posSize;
        require(fee >= 0, "Unexpected fee value");
        require(StructLib.sufficientCcy(ld, a.ledger_A, std._tt_ft[a.tokTypeId].refCcyId, 0, 0, fee), "Insufficient currency A");
        require(StructLib.sufficientCcy(ld, a.ledger_B, std._tt_ft[a.tokTypeId].refCcyId, 0, 0, fee), "Insufficient currency B");
        StructLib.transferCcy(ld, StructLib.TransferCcyArgs({ from: a.ledger_A, to: owner, ccyTypeId: std._tt_ft[a.tokTypeId].refCcyId, amount: uint256(fee), transferType: StructLib.TransferType.ExchangeFee }));
        StructLib.transferCcy(ld, StructLib.TransferCcyArgs({ from: a.ledger_B, to: owner, ccyTypeId: std._tt_ft[a.tokTypeId].refCcyId, amount: uint256(fee), transferType: StructLib.TransferType.ExchangeFee }));

        // calculate margin requirements
        int256 marginRequired_A = calcPosMargin(ld, std, a.ledger_A, a.tokTypeId, a.qty_A, int128(a.price));
        int256 marginRequired_B = calcPosMargin(ld, std, a.ledger_B, a.tokTypeId, a.qty_B, int128(a.price));

        // apply margin
        int256 newReserved_A = ld._ledger[a.ledger_A].ccyType_reserved[std._tt_ft[a.tokTypeId].refCcyId] + marginRequired_A;
        int256 newReserved_B = ld._ledger[a.ledger_B].ccyType_reserved[std._tt_ft[a.tokTypeId].refCcyId] + marginRequired_B;
        StructLib.setReservedCcy(ld, ctd, a.ledger_A, std._tt_ft[a.tokTypeId].refCcyId, newReserved_A); // will revert if insufficient
        StructLib.setReservedCcy(ld, ctd, a.ledger_B, std._tt_ft[a.tokTypeId].refCcyId, newReserved_B);

        // create ledger entries as required
        StructLib.initLedgerIfNew(ld, a.ledger_A);
        StructLib.initLedgerIfNew(ld, a.ledger_B);

        // auto-mint ("batchless") a balanced ST-pair; one for each side of the position
        // (note: no global counter updates [_spot_totalMintedQty, spot_sumQtyMinted] for FT auto-mints)
        // (note: the short position is always the first/lower ST ID, the long position is the second/higher ST ID - for pair lookup later)
        uint256 newId_A = ld._tokens_currentMax_id + (a.qty_A < 0 ? 1 : 2);
        uint256 newId_B = ld._tokens_currentMax_id + (a.qty_B < 0 ? 1 : 2);

        //ld._sts[newId_A].batchId = 0; // batchless
        ld._sts[newId_A].mintedQty = int64(a.qty_A);
        ld._sts[newId_A].currentQty = int64(a.qty_A);
        ld._sts[newId_A].ft_price = int128(a.price);
        ld._sts[newId_A].ft_lastMarkPrice = -1;
        ld._sts[newId_A].ft_ledgerOwner = a.ledger_A;

        //ld._sts[newId_B].batchId = 0;
        ld._sts[newId_B].mintedQty = int64(a.qty_B);
        ld._sts[newId_B].currentQty = int64(a.qty_B);
        ld._sts[newId_B].ft_price = int128(a.price);
        ld._sts[newId_B].ft_lastMarkPrice = -1;
        ld._sts[newId_B].ft_ledgerOwner = a.ledger_B;

        ld._tokens_currentMax_id += 2;

        // assign STs to ledgers
        ld._ledger[a.ledger_A].tokenType_stIds[a.tokTypeId].push(newId_A);
        ld._ledger[a.ledger_B].tokenType_stIds[a.tokTypeId].push(newId_B);

        if (a.qty_A > 0)
            emit FutureOpenInterest(a.ledger_A, a.ledger_B, /*ld._tokens_currentMax_id - 1,*/ a.tokTypeId, uint256(a.qty_A), uint256(a.price));
        else
            emit FutureOpenInterest(a.ledger_B, a.ledger_A, /*ld._tokens_currentMax_id - 1,*/ a.tokTypeId, uint256(a.qty_B), uint256(a.price));
    }

    //
    // PUBLIC - take & pay a position pair (settlement)
    //
    struct TakePayVars {
        StructLib.PackedSt st;
        int256 delta;
        int256 bal;
        int256 fee;
        int256 take;
    }
    function takePay(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        StructLib.TakePayArgs memory a
    ) public {
        // ...todo? - recalculate margin requirement (calcPosMargin()) - i.e. allow changes of FT var-margin on open positions...

        //require(a.tokTypeId >= 0 && a.tokTypeId <= std._tt_Count, "Bad tokTypeId");
        require(std._tt_Settle[a.tokTypeId] == StructLib.SettlementType.FUTURE, "Bad token settlement type");
        StructLib.FutureTokenTypeArgs storage fta = std._tt_ft[a.tokTypeId];
        //require(fta.contractSize > 0, "Unexpected token type FutureTokenTypeArgs");

        //uint256 long_stId = a.short_stId + 1;

        StructLib.PackedSt storage shortSt = ld._sts[a.short_stId];
        //require(shortSt.batchId == 0 && shortSt.ft_price != 0, "Bad (unexpected data) on explicit short token");
        require(shortSt.currentQty < 0, "Bad (non-short quantity) on explicit short token");
        //require(shortSt.ft_ledgerOwner != address(0x0), "Bad token ledger owner on explicit short token");

        StructLib.PackedSt storage longSt = ld._sts[a.short_stId + 1];
        require(longSt.batchId == 0 && longSt.ft_price != 0, "Bad (unexpected data) on implied long token");
        //require(longSt.currentQty > 0, "Bad (non-short quantity) on implied long token");
        //require(longSt.ft_ledgerOwner != address(0x0), "Bad token ledger owner on implied long token");

        require(a.markPrice >= 0, "Bad markPrice"); // allow zero for marking

        //require(tokenExistsOnLedger(ld, a.tokTypeId, shortSt, a.short_stId), "Bad or missing ledger token type on explicit short token");
        //require(tokenExistsOnLedger(ld, a.tokTypeId, longSt, a.short_stId + 1), "Bad or missing ledger token type on implied long token");

        require(a.feePerSide >= 0, "Bad feePerSide");

        // get delta each side
        int256 short_Delta = calcTakePay(ld, fta, a.tokTypeId, shortSt, a.markPrice, shortSt.ft_lastMarkPrice);
        int256 long_Delta = calcTakePay(ld, fta, a.tokTypeId, longSt, a.markPrice, shortSt.ft_lastMarkPrice);
        //require(short_Delta + long_Delta == 0, "Unexpected net delta short/long");

        // get OTM/ITM sides
        TakePayVars memory itm;
        TakePayVars memory otm;
        if (short_Delta == long_Delta || short_Delta > 0) {
            itm = TakePayVars({ st: shortSt, delta: short_Delta, bal: ld._ledger[shortSt.ft_ledgerOwner].ccyType_balance[fta.refCcyId], fee: 0, take: 0 });
            otm = TakePayVars({  st: longSt, delta: long_Delta,  bal: ld._ledger[longSt.ft_ledgerOwner].ccyType_balance[fta.refCcyId],  fee: 0, take: 0 });
        }
        else {
            itm = TakePayVars({  st: longSt, delta: long_Delta,  bal: ld._ledger[longSt.ft_ledgerOwner].ccyType_balance[fta.refCcyId],  fee: 0, take: 0 });
            otm = TakePayVars({ st: shortSt, delta: short_Delta, bal: ld._ledger[shortSt.ft_ledgerOwner].ccyType_balance[fta.refCcyId], fee: 0, take: 0 });
        }

        // apply settlement fees
        otm.fee = otm.bal >= a.feePerSide ? a.feePerSide : 0;
        itm.fee = itm.bal >= a.feePerSide ? a.feePerSide : 0;
        if (otm.fee + itm.fee > 0) {
            ld._ledger[a.feeAddrOwner].ccyType_balance[fta.refCcyId] += otm.fee + itm.fee;//(a.feePerSide) * 2;

            StructLib.emitTransferedLedgerCcy(ld, StructLib.TransferCcyArgs({
                from: otm.st.ft_ledgerOwner, to: a.feeAddrOwner, ccyTypeId: fta.refCcyId, amount: uint256(otm.fee), transferType: StructLib.TransferType.TakePayFee }));

            StructLib.emitTransferedLedgerCcy(ld, StructLib.TransferCcyArgs({
                from: itm.st.ft_ledgerOwner, to: a.feeAddrOwner, ccyTypeId: fta.refCcyId, amount: uint256(itm.fee), transferType: StructLib.TransferType.TakePayFee }));
        }
        otm.bal -= otm.fee;
        itm.bal -= itm.fee;

        // update last mark price
        shortSt.ft_lastMarkPrice = a.markPrice;
        //longSt.ft_lastMarkPrice = a.markPrice; //## gas - we use only the short side's last price

        // cap OTM side at physical balance
        otm.take = otm.delta * -1;
        if (otm.take > otm.bal) {
            otm.take = otm.bal;
        }

        // apply take/pay currency movement
        ld._ledger[otm.st.ft_ledgerOwner].ccyType_balance[fta.refCcyId] = otm.bal - (otm.take);
        ld._ledger[itm.st.ft_ledgerOwner].ccyType_balance[fta.refCcyId] = itm.bal + (otm.take);

        StructLib.emitTransferedLedgerCcy(ld, StructLib.TransferCcyArgs({
           from: otm.st.ft_ledgerOwner, to: itm.st.ft_ledgerOwner, ccyTypeId: fta.refCcyId, amount: uint256(otm.take), transferType: StructLib.TransferType.TakePay }));

        emit TakePay(otm.st.ft_ledgerOwner, itm.st.ft_ledgerOwner, uint256(itm.delta), uint256(otm.take), a.feeAddrOwner, uint256(otm.fee), uint256(itm.fee), fta.refCcyId);
    }

    // returns uncapped take/pay settlment amount for the given position
    function calcTakePay(
        StructLib.LedgerStruct storage ld,
        StructLib.FutureTokenTypeArgs storage fta,
        uint256 tokTypeId,
        StructLib.PackedSt memory st,
        int128  markPrice,
        int128  ft_lastMarkPrice
    ) private returns(int256) {
        int256 delta = (markPrice - (ft_lastMarkPrice == -1
                            ? st.ft_price
                            : ft_lastMarkPrice)) * fta.contractSize * st.currentQty;
        return delta;
    }

    // checks if the supplied token of supplied type is present on the supplied ledger entry
    function tokenExistsOnLedger(
        StructLib.LedgerStruct storage ld,
        uint256 tokTypeId,
        StructLib.PackedSt memory st,
        uint256 stId
    ) private returns(bool) {
        for (uint256 x = 0; x < ld._ledger[st.ft_ledgerOwner].tokenType_stIds[tokTypeId].length ; x++) {
            if (ld._ledger[st.ft_ledgerOwner].tokenType_stIds[tokTypeId][x] == stId) {
                return true;
            }
        }
        return false;
    }

    // return margin required for the given position
    function calcPosMargin(
        StructLib.LedgerStruct storage ld,
        StructLib.StTypesStruct storage std,
        address ledgerOwner,
        uint256 tokTypeId,
        int256 posSize,
        int128 price
    ) private returns(int256) {

        uint16 totMargin = (ld._ledger[ledgerOwner].ft_initMarginBips[tokTypeId] != 0
                                ? ld._ledger[ledgerOwner].ft_initMarginBips[tokTypeId]
                                : std._tt_ft[tokTypeId].initMarginBips)
                            + std._tt_ft[tokTypeId].varMarginBips;
        if (totMargin > 10000) {
            totMargin = 10000;
        }

        return (((int256(totMargin)
            * 1000000/*increase precision*/)
                / 10000/*basis points*/)
                * (std._tt_ft[tokTypeId].contractSize * (posSize < 0 ? posSize * -1 : posSize) * price)/*notional*/
            ) / 1000000/*decrease precision*/;
    }
}