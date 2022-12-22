// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

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
const transferHelper = require('./transferHelper.js');
const BN = require('bn.js');
const setupHelper = require('./testSetupContract.js');

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

    // CCY -- 3 USD per Million RECEIVED
    it(`cross-entity transfer (different fee owners) - fees (ccy per million received) - apply USD ccy fee 3 USD/1m tokens received on trades (0.1KT, 1KT, 1.5KT, 11KT) (global fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     B, CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per Million qty received
        const ccy_perMillion = 300; // $3
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 0.1, CONST.KT_CARBON * 15, CONST.KT_CARBON * 1, CONST.KT_CARBON * 11];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = //Math.floor
                                    (Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion;
            console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (different fee owners) - fees (ccy per million received) - apply USD ccy fee 3 USD/1m tokens received on trades (0.1KT, 1KT, 1.5KT, 11KT) (global fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     A, CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.00 /per Million qty received
        const ccy_perMillion = 300; // $3
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyPerMillion', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_perMillion == ccy_perMillion && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).ccy_perMillion == ccy_perMillion, 'unexpected fee per Million received after setting ccy fee structure');

        const transferAmountsTok = [CONST.KT_CARBON * 0.1, CONST.KT_CARBON * 15, CONST.KT_CARBON * 1, CONST.KT_CARBON * 11];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = //Math.floor
                                    (Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion;
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (different fee owners) - fees (ccy per million received) - apply ledger override USD ccy fee 6 USD/1m tokens received, capped USD 60, on trades (0.1KT, 1KT, 1.5KT, 11KT) (ledger fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     B, CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set global fee: ccy 3.00 /per Million qty received
        const setExchangeFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 300, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        // set ledger override fee: ccy 6.00 /per Million qty received, cap 60.00
        const ccy_perMillion = 600, fee_max = 6000, fee_min = 100; // $6, $60, $1
        const setLedgerFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, A, { ccy_mirrorFee: false, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max } );

        const transferAmountsTok = [CONST.KT_CARBON * 0.1, CONST.KT_CARBON * 15, CONST.KT_CARBON * 1, CONST.KT_CARBON * 11];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.min(//Math.floor
                                                     (Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_max), fee_min);
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: 0,                                      tokTypeId_A: 0,
                       qty_B: transferAmountTok,                      tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                      ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                      ccyTypeId_B: 0,
                   applyFees: true,
            });

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });

    it(`cross-entity transfer (different fee owners) - fees (ccy per million received) - apply ledger override USD ccy fee 6 USD/1m tokens received, max USD 60, min USD 1, on trades (0.1KT, 1KT, 1.5KT, 11KT) (ledger fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0]
        const B = accounts[global.TaddrNdx + 1]
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.MT_CARBON,  1,     A, CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,                      CONST.millionCcy_cents,  B, 'TEST');

        // set global fee: ccy 3.00 /per Million qty received
        const setExchangeFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 300, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        // set ledger override fee: ccy 6.00 /per Million qty received, cap 60.00, collar 1.00
        const ccy_perMillion = 600, fee_max = 6000, fee_min = 100; // $6, $60, $1
        const setLedgerFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion, fee_fixed: 0, fee_percBips: 0, fee_min, fee_max } );

        const transferAmountsTok = [CONST.KT_CARBON * 0.1, CONST.KT_CARBON * 15, CONST.KT_CARBON * 1, CONST.KT_CARBON * 11];
        for (var i = 0 ; i < transferAmountsTok.length ; i++) {
            // transfer, with fee structure applied
            const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
            const transferAmountTok = new BN(transferAmountsTok[i]);
            const expectedFeeCcy = Math.max(Math.min(//Math.floor
                                                     (Number(transferAmountTok.toString()) / 1000000) * ccy_perMillion, fee_max), fee_min);
            //console.log('expectedFeeCcy', expectedFeeCcy);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts,
                    ledger_A: A,                                         ledger_B: B,
                       qty_A: transferAmountTok,                      tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                      tokTypeId_B: 0,
                ccy_amount_A: 0,                                      ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                      ccyTypeId_B: CONST.ccyType.USD,
                   applyFees: true,
            });

            // test contract owner has received expected ccy fee
            // feeOwnerLedgerForA != feeOwnerLedgerForB
            let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver A) ccy balance after transfer');

            owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
            assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver B) ccy balance after transfer');
        }
    });
});