// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Re: StTransferable.sol => TransferLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StMintableFacet = artifacts.require('StMintableFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');

const CONST = require('../const.js');
const transferHelper = require('../test/transferHelper.js');
const BN = require('bn.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    let stm;
    let stmStMasterFacet;
    let stmStErc20Facet;
    let stmCcyCollateralizableFacet;
    let stmStLedgerFacet;
    let stmStFeesFacet;
    let stmStMintableFacet;
    let stmStTransferableFacet;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);

        if (await stmStMasterFacet.getContractType() != CONST.contractType.COMMODITY) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;
        
        await stmStErc20Facet.whitelistMany(accounts.slice(global.TaddrNdx, global.TaddrNdx + 40));
        await stmStMasterFacet.sealContract();
        
        await setupHelper.setDefaults({ 
            StErc20Facet: stmStErc20Facet, 
            stmStMaster: stmStMasterFacet, 
            stmStLedger: stmStLedgerFacet, 
            stmCcyCollateralizable: stmCcyCollateralizableFacet, 
            stmFees: stmStFeesFacet,
            accounts});

        await stmStErc20Facet.updateEntity({id: CONST.testId1, addr: CONST.testAddr9});
        await stmStErc20Facet.createEntity({id: CONST.testId2, addr: CONST.testAddr10});
    });

    beforeEach(async () => {
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntity({id: CONST.testId1, addr: accounts[global.TaddrNdx + 0]});
        await stmStErc20Facet.setAccountEntity({id: CONST.testId2, addr: accounts[global.TaddrNdx + 1]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    // ORIG CCY FEE -- (SINGLE BATCH, SHARE OF 3 USD per Million RECEIVED, SYMMETRIC MIRRORED)
    it(`cross-entity transfer (different fee owners) - fees (orig ccy fee - from per million received, symmetric mirrored, single batch) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips = 100;
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     B, CONST.nullFees, origCcyFee_bips, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per Million qty received, MIRRORED
        const ccy_perMillion = 300; // $3
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 1];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion;
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
                assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                    'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - from per million received, symmetric mirrored, single batch) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips = 102;
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     A, CONST.nullFees, origCcyFee_bips, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.00 /per Million qty received, MIRRORED
        const ccy_perMillion = 302; // $3.02
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 1];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion;
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
                assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                    'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE BALANCED BATCHES, SHARE OF 3 USD per Million RECEIVED, SYMMETRIC MIRRORED)
    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - from per million received, symmetric mirrored, on multi/balanced batches) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.04 /per Million qty received, MIRRORED
        const ccy_perMillion = 304, fee_min = 304; // $3.04
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 1];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_min);
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
                assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                    'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - from per million received, symmetric mirrored, on multi/balanced batches) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND,  CONST.ccyType.USD, CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.06 /per Million qty received, MIRRORED
        const ccy_perMillion = 306, fee_min = 36; // $3.06
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 1];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_min)
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
                assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                    'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE UNBALANCED BATCHES, SHARE OF 3 USD per Million RECEIVED, SYMMETRIC MIRRORED)
    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - from per million received, symmetric mirrored, on multi/unbalanced batches) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.08 /per Million qty received, MIRRORED
        const ccy_perMillion = 308, fee_min = 308; // $3.08
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [510000]; // *** unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_min);
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
                assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                    'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - from per million received, symmetric mirrored, on multi/unbalanced batches) - apply mirrored USD ccy fee 3 USD/1m tokens received on trade (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.10 /per Million qty received, MIRRORED
        const ccy_perMillion = 310, fee_min = 310; // $3.1
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [510000]; // *** unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_min);
            
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const origFees = Number(data.orig_ccyFee_toA.toString()) + Number(data.orig_ccyFee_toB.toString());

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy) - origFees / 2,
                'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    // ORIG CCY FEE -- (MULTIPLE UNBALANCED BATCHES, SHARE OF 3 USD per Million RECEIVED, ASYMMETRIC MIRRORED)
    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - per million received, asymmetric mirrored, on multi/unbalanced batches) - apply asymmetrical mirrored ledger override USD ccy fee 6 USD/1m tokens received, capped USD 60, on trade (ledger fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, B, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per Million qty received, max ccy 15.00, min ccy 3.00, MIRRORED
        const exchange_feeperMillion = 300, exchange_feeMax = 1500, exchange_feeMin = 300; // $3, $15, $3
        const setExchangeFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion: exchange_feeperMillion, fee_fixed: 0, fee_percBips: 0, fee_min: exchange_feeMin, fee_max: exchange_feeMax } );

        // set ledger override fee on A: ccy 6.00 /per Million qty received, max ccy 60.00, min ccy 6.00, MIRRORED
        const ledger_feeperMillion = 600, ledger_feeMax = 6000, ledger_feeMin = 600; // $6, $60, $6
        const setLedgerFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, A, { ccy_mirrorFee: true, ccy_perMillion: ledger_feeperMillion, fee_fixed: 0, fee_percBips: 0, fee_min: ledger_feeMin, fee_max: ledger_feeMax } );

        const transferAmountsTok = [750000]; // *** unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);

            // A - ledger fee (ccy sender)
            const expectedFeeCcy_A = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ledger_feeperMillion, ledger_feeMax), ledger_feeMin);
            
            // B - global ccy fee (ccy mirrored - asymmetric)
            const expectedFeeCcy_B = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000000) * exchange_feeperMillion, exchange_feeMax), exchange_feeMin);
            
            // console.log('expectedFeeCcy_A', expectedFeeCcy_A);
            // console.log('expectedFeeCcy_B', expectedFeeCcy_B);
            // console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const tokensFromBatch1 = Number(transferAmountTok) > 500000 ? 500000 : Number(transferAmountTok);
            const tokensFromBatch2 = Number(transferAmountTok) > 500000 ? Number(transferAmountTok) - 500000 : 0;
            const totalTokens = Number(transferAmountTok);
            assert(tokensFromBatch1 + tokensFromBatch2 === totalTokens, 'Total tokens calculation assertion');

            // this is how the fees are calculated in theory
            // because of the minor rounding errors, there can be a deviation in up to 2 cents (2 cents, because we pay originator fees two times, because we transfer tokens from 2 different batches)
            const origFeesPaidBy_A = Math.round(expectedFeeCcy_A * (tokensFromBatch1 / totalTokens) * origCcyFee_bips_B1 / 10000) + Math.round(expectedFeeCcy_A * (tokensFromBatch2 / totalTokens) * origCcyFee_bips_B2 / 10000);
            const origFeesPaidBy_B = Math.round(expectedFeeCcy_B * (tokensFromBatch1 / totalTokens) * origCcyFee_bips_B1 / 10000) + Math.round(expectedFeeCcy_B * (tokensFromBatch2 / totalTokens) * origCcyFee_bips_B2 / 10000);

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            
            assert(Math.abs(owner_balAfter - (Number(owner_balBefore) + Number(expectedFeeCcy_A) - origFeesPaidBy_A)) <= 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(Math.abs(owner_balAfter - (Number(owner_balBefore) + Number(expectedFeeCcy_B) - origFeesPaidBy_B)) <= 2,
                'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (same fee owner) - fees (orig ccy fee - per million received, asymmetric mirrored, on multi/unbalanced batches) - apply asymmetrical mirrored ledger override USD ccy fee 6 USD/1m tokens received, capped USD 60, on trade (ledger fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]

        const origCcyFee_bips_B1 = 3000; // 30%
        const origCcyFee_bips_B2 = 9000; // 90%
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    500000, 1, A, CONST.nullFees, origCcyFee_bips_B2, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.00 /per Million qty received, max ccy 15.00, min ccy 3.00, MIRRORED
        const exchange_feeperMillion = 300, exchange_feeMax = 1500, exchange_feeMin = 300; // $3, $15, $3
        const setExchangeFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: true, ccy_perMillion: exchange_feeperMillion, fee_fixed: 0, fee_percBips: 0, fee_min: exchange_feeMin, fee_max: exchange_feeMax } );

        // set ledger override fee on A: ccy 6.00 /per Million qty received, max ccy 60.00, min ccy 6.00, MIRRORED
        const ledger_feeperMillion = 600, ledger_feeMax = 6000, ledger_feeMin = 600; // $6, $60, $6
        const setLedgerFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, A, { ccy_mirrorFee: true, ccy_perMillion: ledger_feeperMillion, fee_fixed: 0, fee_percBips: 0, fee_min: ledger_feeMin, fee_max: ledger_feeMax } );

        const transferAmountsTok = [750000]; // *** unbalanced - B1 supplies most
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);

            // A - ledger fee (tok sender - mirrored ccy fee payer - asymmetric)
            const expectedFeeCcy_A = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000000) * ledger_feeperMillion, ledger_feeMax), ledger_feeMin);
            
            // B - global ccy fee (ccy sender - main ccy fee payer)
            const expectedFeeCcy_B = Math.max(Math.min(Math.floor(Number(transferAmountTok.toString()) / 1000000) * exchange_feeperMillion, exchange_feeMax), exchange_feeMin);
            
            // console.log('expectedFeeCcy_A', expectedFeeCcy_A);
            // console.log('expectedFeeCcy_B', expectedFeeCcy_B);
            // console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);

            const tokensFromBatch1 = Number(transferAmountTok) > 500000 ? 500000 : Number(transferAmountTok);
            const tokensFromBatch2 = Number(transferAmountTok) > 500000 ? Number(transferAmountTok) - 500000 : 0;
            const totalTokens = Number(transferAmountTok);
            assert(tokensFromBatch1 + tokensFromBatch2 === totalTokens, 'Total tokens calculation assertion');

            // this is how the fees are calculated in theory
            // because of the minor rounding errors, there can be a deviation in up to 2 cents (2 cents, because we pay originator fees two times, because we transfer tokens from 2 different batches)
            const origFeesPaidBy_A = Math.round(expectedFeeCcy_A * (tokensFromBatch1 / totalTokens) * origCcyFee_bips_B1 / 10000) + Math.round(expectedFeeCcy_A * (tokensFromBatch2 / totalTokens) * origCcyFee_bips_B2 / 10000);
            const origFeesPaidBy_B = Math.round(expectedFeeCcy_B * (tokensFromBatch1 / totalTokens) * origCcyFee_bips_B1 / 10000) + Math.round(expectedFeeCcy_B * (tokensFromBatch2 / totalTokens) * origCcyFee_bips_B2 / 10000);

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(Math.abs(owner_balAfter - (Number(owner_balBefore) + Number(expectedFeeCcy_A) - origFeesPaidBy_A)) <= 2,
                'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(Math.abs(owner_balAfter - (Number(owner_balBefore) + Number(expectedFeeCcy_B) - origFeesPaidBy_B)) <= 2,
                'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });
});