const st = artifacts.require('StMaster');
const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');
const transferHelper = require('../test/transferHelper.js');
const BN = require('bn.js');

contract("StMaster", accounts => {
    var stm;

    before(async function () {
        stm = await st.deployed();
        if (await stm.getContractType() == CONST.contractType.CASHFLOW) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;
        
        for (let i=0 ; i < 60 ; i++) { // whitelist enough accounts for the tests
            await stm.whitelist(accounts[global.TaddrNdx + i]);
        }
        await stm.sealContract();
    });

    beforeEach(async () => {
        global.TaddrNdx += 2;
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    // TODO: global totals for orig ccy fees

    // TODO: test multiple originators 
    // TODO: test neither A/B in trade or originators (i.e. mint, transfer, then trade)

    // ... pro-rata per batch - explain
    // ... rounding (1 cent ccy units) - explain
    // ... tok/tok (below) probably can't apply ccy orig (or exchange) fee - explain
    // ...  test: edge-case -- test for tok/tok swaps (same batch(es) both sides & different batch(es) both sides), with ccy-mirror *exchange fee* per 1000 [*prefunded* ccy A/B]
    //          THIS PROBABLY WON'T WORK -- transferLib has no supplied currencyType to use for exchange fee!

    // ORIG CCY FEE -- (SINGLE BATCH, SHARE OF 3 USD per THOUSAND RECEIVED, SYMMETRIC MIRRORED)
    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, single batch) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips = 100;
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  A,                                          { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    CONST.mtCarbon,  1,      B, CONST.nullFees, origCcyFee_bips, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [1000];//, 1500, 11000, 100];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                    tokenTypeId_A: 0,
                       qty_B: transferAmountTok,                    tokenTypeId_B: CONST.tokenType.NATURE,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, single batch) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips = 100;
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    CONST.mtCarbon,  1,      A, CONST.nullFees, origCcyFee_bips, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  B,                                          { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [1000];//, 1500, 11000, 100];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                    tokenTypeId_A: CONST.tokenType.NATURE,
                       qty_B: 0,                                    tokenTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE BALANCED BATCHES, SHARE OF 3 USD per THOUSAND RECEIVED, SYMMETRIC MIRRORED)
    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, on multi/balanced batches) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  A,                            { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300, fee_min = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [1000];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand, fee_min)
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                    tokenTypeId_A: 0,
                       qty_B: transferAmountTok,                    tokenTypeId_B: CONST.tokenType.NATURE,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, on multi/balanced batches) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  B,                            { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300, fee_min = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [1000];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand, fee_min)
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                    tokenTypeId_A: CONST.tokenType.NATURE,
                       qty_B: 0,                                    tokenTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE UNBALANCED BATCHES, SHARE OF 3 USD per THOUSAND RECEIVED, SYMMETRIC MIRRORED)
    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, on multi/unbalanced batches) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  A,                            { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300, fee_min = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [510]; // unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand, fee_min)
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                    tokenTypeId_A: 0,
                       qty_B: transferAmountTok,                    tokenTypeId_B: CONST.tokenType.NATURE,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    it(`fees (orig ccy fee - from per 1000 received, symmetric mirrored, on multi/unbalanced batches) - apply mirrored USD ccy fee 3 USD/1000 tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  B,                            { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, MIRRORED
        const ccy_perThousand = 300, fee_min = 300; // $3
        const setFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerThousand', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perThousand == ccy_perThousand && ev.ledgerOwner == CONST.nullAddr);
        assert((await stm.getFee(CONST.getFeeType.CCY, CONST.ccyType.USD, CONST.nullAddr)).ccy_perThousand == ccy_perThousand, 'unexpected fee per thousand received after setting ccy fee structure');

        const transferAmountsTok = [510]; // unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000) * ccy_perThousand, fee_min)
                                    * 2; // ex ccy-fee mirror - symmetric
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                    tokenTypeId_A: CONST.tokenType.NATURE,
                       qty_B: 0,                                    tokenTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE UNBALANCED BATCHES, SHARE OF 3 USD per THOUSAND RECEIVED, ASYMMETRIC MIRRORED)
    it(`fees (orig ccy fee - per 1000 received, asymmetric mirrored, on multi/unbalanced batches) - apply asymmetrical mirrored ledger override USD ccy fee 6 USD/1000 tokens received, capped USD 60, on trade (ledger fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  A,                            { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, max ccy 15.00, min ccy 3.00, MIRRORED
        const exchange_feePerThousand = 300, exchange_feeMax = 1500, exchange_feeMin = 300; // $3, $15, $3
        const setExchangeFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand: exchange_feePerThousand, fee_fixed: 0, fee_percBips: 0, fee_min: exchange_feeMin, fee_max: exchange_feeMax } );

        // set ledger override fee on A: ccy 6.00 /per thousand qty received, max ccy 60.00, min ccy 6.00, MIRRORED
        const ledger_feePerThousand = 600, ledger_feeMax = 6000, ledger_feeMin = 600; // $6, $60, $6
        const setLedgerFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, A, { ccy_mirrorFee: true, ccy_perThousand: ledger_feePerThousand, fee_fixed: 0, fee_percBips: 0, fee_min: ledger_feeMin, fee_max: ledger_feeMax } );

        const transferAmountsTok = [750]; // unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);

            // A - ledger fee (ccy sender)
            const expectedFeeCcy_A = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000) * ledger_feePerThousand, ledger_feeMax), ledger_feeMin);
            
            // B - global ccy fee (ccy mirrored - asymmetric)
            const expectedFeeCcy_B = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000) * exchange_feePerThousand, exchange_feeMax), exchange_feeMin);

            const expectedFeeCcy = expectedFeeCcy_A + expectedFeeCcy_B;
            
            // console.log('expectedFeeCcy_A', expectedFeeCcy_A);
            // console.log('expectedFeeCcy_B', expectedFeeCcy_B);
            // console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                    tokenTypeId_A: 0,
                       qty_B: transferAmountTok,                    tokenTypeId_B: CONST.tokenType.NATURE,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });

    it(`fees (orig ccy fee - per 1000 received, asymmetric mirrored, on multi/unbalanced batches) - apply asymmetrical mirrored ledger override USD ccy fee 6 USD/1000 tokens received, capped USD 60, on trade (ledger fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE,    500, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD,                      CONST.millionCcy_cents,  B,                            { from: accounts[0] });

        // set global fee: ccy 3.00 /per thousand qty received, max ccy 15.00, min ccy 3.00, MIRRORED
        const exchange_feePerThousand = 300, exchange_feeMax = 1500, exchange_feeMin = 300; // $3, $15, $3
        const setExchangeFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perThousand: exchange_feePerThousand, fee_fixed: 0, fee_percBips: 0, fee_min: exchange_feeMin, fee_max: exchange_feeMax } );

        // set ledger override fee on A: ccy 6.00 /per thousand qty received, max ccy 60.00, min ccy 6.00, MIRRORED
        const ledger_feePerThousand = 600, ledger_feeMax = 6000, ledger_feeMin = 600; // $6, $60, $6
        const setLedgerFeeTx = await stm.setFee_CcyType(CONST.ccyType.USD, A, { ccy_mirrorFee: true, ccy_perThousand: ledger_feePerThousand, fee_fixed: 0, fee_percBips: 0, fee_min: ledger_feeMin, fee_max: ledger_feeMax } );

        const transferAmountsTok = [750]; // unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);

            // A - ledger fee (tok sender - mirrored ccy fee payer - asymmetric)
            const expectedFeeCcy_A = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000) * ledger_feePerThousand, ledger_feeMax), ledger_feeMin);
            
            // B - global ccy fee (ccy sender - main ccy fee payer)
            const expectedFeeCcy_B = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000) * exchange_feePerThousand, exchange_feeMax), exchange_feeMin);

            const expectedFeeCcy = expectedFeeCcy_A + expectedFeeCcy_B;
            
            // console.log('expectedFeeCcy_A', expectedFeeCcy_A);
            // console.log('expectedFeeCcy_B', expectedFeeCcy_B);
            // console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stm, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                    tokenTypeId_A: CONST.tokenType.NATURE,
                       qty_B: 0,                                    tokenTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            // test contract owner has received expected ccy fee
            const owner_balBefore = data.owner_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            const owner_balAfter  =  data.owner_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - Number(data.orig_ccyFee_toA.toString()) - Number(data.orig_ccyFee_toB.toString()),
                'unexpected contract owner (fee receiver) ccy balance after transfer');
        }
    });
});