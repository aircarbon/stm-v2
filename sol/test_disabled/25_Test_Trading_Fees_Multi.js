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

const truffleAssert = require('truffle-assertions');
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
    });

    beforeEach(async () => {
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntityBatch([{id: 1, addr: accounts[global.TaddrNdx + 0]}, {id: 1, addr: accounts[global.TaddrNdx + 1]}]);
        if (CONST.logTestAccountUsage)
            console.log(`TaddrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    // ST MULTI FEES
    it(`fees (multi) - apply NATURE token fee 100 BP + 1 TONS fixed on a small trade (fee on A)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,  accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,   CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST');

        // (await stmStFeesFacet.getFee(CONST.getFeeType.CCY, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed ==> (await stmStFeesFacet.getFee(CONST.getFeeType.CCY, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed

        // set fee structure NATURE: 1% + 1 TONS
        const feeBps = 100; // 100 bp = 1%
        const feeFix = 1;   // 1 kg
        const setEeuFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: feeFix, fee_percBips: feeBps, fee_min: 0, fee_max: 0 } );
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   CONST.nullFees);
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_token_PercBips == feeBps && ev.ledgerOwner == CONST.nullAddr);
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_tokenQty_Fixed == feeFix && ev.ledgerOwner == CONST.nullAddr);

        // transfer, with fee structure applied
        const transferAmountTokQty = new BN(100); // 100 kg
        const expectedFeeTokQty = Math.floor(Number(transferAmountTokQty.toString()) * (feeBps/10000)) + feeFix;
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: transferAmountTokQty,             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected token fees
        const contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(expectedFeeTokQty), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
        
        // test sender has sent expected quantity and fees
        const ledgerA_VcsTokQtyBefore = data.ledgerA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerA_VcsTokQtyAfter  =  data.ledgerA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(ledgerA_VcsTokQtyAfter == Number(ledgerA_VcsTokQtyBefore) - Number(expectedFeeTokQty) - Number(transferAmountTokQty), 'unexpected ledger A (fee payer) NATURE ST quantity after transfer');
    });

    it(`fees (multi) - apply NATURE token fee 1000 BP + 1000 TONS fixed on a large (0.5 GT) trade (fee on B)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,         CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.GT_CARBON, 1,       accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });
        
        // set fee structure NATURE: 10% + 1000 TONS
        const feeBps = 1000; // 1000 bp = 10%
        const feeFix = 1000; // 1000 kg
        const setEeuFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: feeFix, fee_percBips: feeBps, fee_min: 0, fee_max: 0 } );
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   CONST.nullFees);
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_token_PercBips == feeBps && ev.ledgerOwner == CONST.nullAddr);
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_tokenQty_Fixed == feeFix && ev.ledgerOwner == CONST.nullAddr);

        // transfer, with fee structure applied
        const transferAmountTokQty = new BN(CONST.GT_CARBON / 2); // 0.5 giga ton
        const expectedFeeTokQty = Math.floor(Number(transferAmountTokQty.toString()) * (feeBps/10000)) + feeFix;
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokTypeId_A: 0,
                   qty_B: transferAmountTokQty,             tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: CONST.oneEth_wei,                 ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected token fees
        const contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(expectedFeeTokQty), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
        
        // test sender has sent expected quantity and fees
        const ledgerB_VcsTokQtyBefore = data.ledgerB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerB_VcsTokQtyAfter  =  data.ledgerB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(ledgerB_VcsTokQtyAfter == Number(ledgerB_VcsTokQtyBefore) - Number(expectedFeeTokQty) - Number(transferAmountTokQty), 'unexpected ledger A (fee payer) NATURE ST quantity after transfer');
    });

    // CCY MULTI FEES
    it(`fees (multi) - apply ETH ccy fee 100 BP + 0.01 ETH fixed on a small trade (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1% + 1 Wei fixed
        const ethFeeBps = 100; // 100 bp = 1%
        const ethFeeFix = CONST.hundredthEth_wei;
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFix, fee_percBips: ethFeeBps, fee_min: 0, fee_max: 0 } );
        const setEeuFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, CONST.nullFees);
        truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_PercBips == ethFeeBps && ev.ledgerOwner == CONST.nullAddr);
        truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFix && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == ethFeeBps, 'unexpected ETH percentage fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFix, 'unexpected ETH fixed fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(CONST.tenthEth_wei);
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ethFeeBps/10000)) + Number(ethFeeFix);
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: transferAmountCcy,                                     ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`fees (multi) - apply ETH ccy fee 1000 BP + 1000 ETH fixed on a large (500k ETH) trade (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       CONST.millionEth_wei,          accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure ETH: 10% + 1000 ETH fixed
        const ethFeeBps = 1000; // 1000 bp
        const ethFeeFix = CONST.thousandEth_wei;
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFix, fee_percBips: ethFeeBps, fee_min: 0, fee_max: 0 } );
        const setEeuFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, CONST.nullFees);
        truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_PercBips == ethFeeBps && ev.ledgerOwner == CONST.nullAddr);
        truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFix && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == ethFeeBps, 'unexpected ETH percentage fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFix, 'unexpected ETH fixed fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(CONST.millionEth_wei).div(new BN(2));
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ethFeeBps/10000)) + Number(ethFeeFix);
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                   tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                     tokTypeId_B: 0,
            ccy_amount_A: 0,                                                     ccyTypeId_A: 0,
            ccy_amount_B: transferAmountCcy,                                     ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    // CCY + ST MULTI FEES
    it(`fees (multi) - apply ETH ccy fee 1000 BP + 1000 ETH fixed, NATURE fee 1000 BP + 1000 TONS on a large (500k ETH / 0.5GT) trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,        CONST.millionEth_wei,          accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.GT_CARBON, 1,       accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 10% + 1000 ETH fixed
        const ethFeeBps = 1000; // 1000 bp 
        const ethFeeFix = CONST.thousandEth_wei;
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFix, fee_percBips: ethFeeBps, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_PercBips == ethFeeBps && ev.ledgerOwner == CONST.nullAddr);
        // truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFix && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == ethFeeBps, 'unexpected ETH percentage fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFix, 'unexpected ETH fixed fee after setting ETH fee structure');

        // set fee structure NATURE: 10% + 1000 TONS fixed
        const eeuFeeBps = 1000; // 1000 bp
        const eeuFeeFix = CONST.KT_CARBON;
        const setEeuFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: eeuFeeFix, fee_percBips: eeuFeeBps, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_token_PercBips == eeuFeeBps);
        truffleAssert.eventEmitted(setEeuFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_tokenQty_Fixed == eeuFeeFix);

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(CONST.millionEth_wei).div(new BN(2));
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ethFeeBps/10000)) + Number(ethFeeFix);

        const transferAmountEeu = new BN(CONST.GT_CARBON).div(new BN(2));
        const expectedFeeEeu = Math.floor(Number(transferAmountEeu.toString()) * (eeuFeeBps/10000)) + Number(eeuFeeFix);

        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: transferAmountEeu,                                     tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: transferAmountCcy,                                     ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
                applyFees: true,
        });

        // test contract owner has received expected ETH fee
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) ETH balance after transfer');

        // test contract owner has received expected token fees
        const contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(expectedFeeEeu), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
    });

    it(`fees (multi) - should not allow a transfer with insufficient ccy (fixed + percentage) to cover fees (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       101,                           accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1% + 1 Wei fixed
        const ethFeeBps = 100; // 100 bp = 1%
        const ethFeeFix = 1;
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFix, fee_percBips: ethFeeBps, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, CONST.nullFees);

        try {
            const transferAmountCcy = new BN(100);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 0,                                                     tokTypeId_A: 0,
                       qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
                ccy_amount_A: transferAmountCcy,                                     ccyTypeId_A: CONST.ccyType.ETH,
                ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
                   applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient currency A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`fees (multi) - should not allow a transfer with insufficient ccy (fixed + percentage) to cover fees (fee on B)`, async () => {
        // 102,000 ETH minus 1 Wei
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1, accounts[global.TaddrNdx + 0],      CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,  new BN("101999999999999999999999"), accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure: 1% + 1,000 ETH
        const ethFeeBps = 100; 
        const ethFeeFix = "1000000000000000000000";
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFix, fee_percBips: ethFeeBps, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, CONST.nullFees);

        try {
            const transferAmountCcy = new BN("100000000000000000000000"); // 100,000 ETH
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 750,                                                   tokTypeId_A: CONST.tokenType.TOK_T2,
                       qty_B: 0,                                                     tokTypeId_B: 0,
                ccy_amount_A: 0,                                                     ccyTypeId_A: 0,
                ccy_amount_B: transferAmountCcy,                                     ccyTypeId_B: CONST.ccyType.ETH,
                   applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient currency B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`fees (multi) - should not allow a transfer with insufficient carbon to cover fees (fee on A)`, async () => {
        // 102,999,999 tons
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   102999999999, 1,    accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,  CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure NATURE: 2% + 1m tons
        const feeBps = 200; 
        const feeFix = 1000000000;
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: feeFix, fee_percBips: feeBps, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   CONST.nullFees);

        try {
            const transferAmountTokQty = new BN(100000000000);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: transferAmountTokQty,             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient tokens A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`fees (multi) - should not allow a transfer with insufficient carbon to cover fees (fee on B)`, async () => {
        // 102,999,999 tons
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   102999999999, 1,         accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure NATURE: 2% + 1m tons
        const feeBps = 200; 
        const feeFix = 1000000000;
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: feeFix, fee_percBips: feeBps, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr,   CONST.nullFees);

        try {
            const transferAmountTokQty = new BN(100000000000);
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokTypeId_A: 0,
                   qty_B: transferAmountTokQty,             tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: CONST.oneEth_wei,                 ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                ccyTypeId_B: 0,
               applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient tokens B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });
});