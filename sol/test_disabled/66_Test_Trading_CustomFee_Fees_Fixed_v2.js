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
        
        await stmStErc20Facet.whitelistMany(accounts.slice(global.TaddrNdx, global.TaddrNdx + 100));
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
        global.TaddrNdx += 3;
        await stmStErc20Facet.setAccountEntityBatch([{id: 1, addr: accounts[global.TaddrNdx + 0]}, {id: 1, addr: accounts[global.TaddrNdx + 1]}, {id: 1, addr: accounts[global.TaddrNdx + 2]}]);
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    // CCY FEES
    it(`custom fees (fixed) - apply ETH custom ccy fee on a max. trade (no global fees) (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const customFee_A = 300;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.oneEth_wei).sub(new BN(customFee_A)), ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
               feeA: customFee_A,                                                feeB: 0
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_A), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`custom fees (fixed) - apply ETH custom ccy fee on a max. trade (with global fees) (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 1000;
        const customFee_A = 400;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure');
        // const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFixed_Wei && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFixed_Wei, 'unexpected ETH fixed Wei fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed cents fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.oneEth_wei).sub(new BN(customFee_A)), ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
               feeA: customFee_A,                                                feeB: 0
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_A), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`custom fees (fixed) - apply ETH custom ccy fee on a max. trade (with specific addr fees) (fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 2000;
        const customFee_A = 700;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.ETH, A)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure for A');
        // const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.ETH, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFixed_Wei && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.ETH, A)).fee_fixed == ethFeeFixed_Wei, 'unexpected ETH fixed Wei fee after setting ETH fee structure for A');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed cents fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.tenthEth_wei).sub(new BN(customFee_A)), ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
               feeA: customFee_A,                                                feeB: 0
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_A), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`custom fees (fixed) - apply zero ETH custom ccy fee on a max. trade (with specific addr fees) (fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 2000;
        const customFee_A = 0;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.ETH, A)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure for A');
        // const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.ETH, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFixed_Wei && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.ETH, A)).fee_fixed == ethFeeFixed_Wei, 'unexpected ETH fixed Wei fee after setting ETH fee structure for A');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed cents fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.tenthEth_wei).sub(new BN(customFee_A)), ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
               feeA: customFee_A,                                                feeB: 0
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_A), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with originator fees) (fee on A)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];
        const M = accounts[global.TaddrNdx + 2];
        const origCcyFee_bips_B1 = 3000;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });

        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
            ledger_A: M,                                  ledger_B: B,
            qty_A: CONST.KT_CARBON,                    tokTypeId_A: CONST.tokenType.TOK_T2,
            qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.OTHER_FEE1,
        });

        const ledgerM_before = await stmStLedgerFacet.getLedgerEntry(M);

        // set fee structure USD: 1000 Wei fixed
        const FeeFixed_cent = 4000;
        const customFee_A = 90;
        const expectedOrigFee = customFee_A * origCcyFee_bips_B1 / 10000;

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == 0, 'unexpected USD fixed Wei fee before setting USD fee structure for A');
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixed_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixed_cent && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == FeeFixed_cent, 'unexpected USD fixed cent fee after setting USD fee structure for A');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                          ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                      tokTypeId_A: 0,
                   qty_B: 750,                                                    tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.thousandCcy_cents).div(new BN('4')),       ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                                      ccyTypeId_B: 0,
               applyFees: true,
               feeA: customFee_A,                                                 feeB: 0
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == owner_balBefore + customFee_A - expectedOrigFee, 'unexpected contract owner (fee receiver) USD balance after transfer');

        const ledgerM_after = await stmStLedgerFacet.getLedgerEntry(M);
        const ledgerM_balBefore = ledgerM_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerM_balAfter  =  ledgerM_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);

        assert(ledgerM_balAfter == ledgerM_balBefore + expectedOrigFee, 'unexpected originator token owner (originator fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (no global fees) (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const customFee_B = 65;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed fee before setting USD fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.millionCcy_cents).sub(new BN(customFee_B)),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
               feeA: 0,                                                                           feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_B), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with global fee) (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const usdFeeFixed_cents = CONST.thousandCcy_cents;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed fee before setting USD fee structure');
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == usdFeeFixed_cents && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == usdFeeFixed_cents, 'unexpected USD fixed cents fee after setting USD fee structure');
        const customFee_B = 75;

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.millionCcy_cents).sub(new BN(customFee_B)),          ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
               feeA: 0,                                                                           feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_B), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with specific addr fee) (fee on B)`, async () => {
        const B = accounts[global.TaddrNdx + 1];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const usdFeeFixed_cents = CONST.thousandCcy_cents;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed fee before setting USD fee structure for B');
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == usdFeeFixed_cents && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == usdFeeFixed_cents, 'unexpected USD fixed cents fee after setting USD fee structure');
        const customFee_B = 85;

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.millionCcy_cents).sub(new BN(customFee_B)),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
               feeA: 0,                                                                           feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_B), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy zero fee on a max. trade (with specific addr fee) (fee on B)`, async () => {
        const B = accounts[global.TaddrNdx + 1];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const usdFeeFixed_cents = CONST.thousandCcy_cents;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed fee before setting USD fee structure for B');
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == usdFeeFixed_cents && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == usdFeeFixed_cents, 'unexpected USD fixed cents fee after setting USD fee structure');
        const customFee_B = 0;

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.millionCcy_cents).sub(new BN(customFee_B)),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
               feeA: 0,                                                                           feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(customFee_B), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with originator fees) (fee on B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];
        const M = accounts[global.TaddrNdx + 2];
        const origCcyFee_bips_B1 = 3000;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });

        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
            ledger_A: M,                                  ledger_B: A,
            qty_A: CONST.KT_CARBON,                    tokTypeId_A: CONST.tokenType.TOK_T2,
            qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.OTHER_FEE1,
        });

        const ledgerM_before = await stmStLedgerFacet.getLedgerEntry(M);

        // set fee structure USD: 1000 Wei fixed
        const FeeFixed_cent = 2500;
        const customFee_B = 80;
        const expectedOrigFee = customFee_B * origCcyFee_bips_B1 / 10000;

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed Wei fee before setting USD fee structure for B');
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixed_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixed_cent && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == FeeFixed_cent, 'unexpected USD fixed cent fee after setting USD fee structure for B');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: A,                                                         ledger_B: B,
                   qty_A: 750,                                                      tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                        tokTypeId_B: 0,
            ccy_amount_A: 0,                                                        ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.thousandCcy_cents).div(new BN('5')),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
               feeA: 0,                                                                    feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == owner_balBefore + customFee_B - expectedOrigFee, 'unexpected contract owner (fee receiver) USD balance after transfer');

        const ledgerM_after = await stmStLedgerFacet.getLedgerEntry(M);
        const ledgerM_balBefore = ledgerM_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerM_balAfter  =  ledgerM_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);

        assert(ledgerM_balAfter == ledgerM_balBefore + expectedOrigFee, 'unexpected originator token owner (originator fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with originator fees) (fees on A and B)`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];
        const M = accounts[global.TaddrNdx + 2];
        const origCcyFee_bips_B1 = 3000;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });

        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
            ledger_A: M,                                  ledger_B: A,
            qty_A: CONST.KT_CARBON,                    tokTypeId_A: CONST.tokenType.TOK_T2,
            qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.OTHER_FEE1,
        });

        const ledgerM_before = await stmStLedgerFacet.getLedgerEntry(M);

        // set fee structure USD: 1000 Wei fixed
        const FeeFixedA_cent = 2500;
        const FeeFixedB_cent = 3500;
        const customFee_A = 60; //(new BN(CONST.thousandCcy_cents).div(new BN('5')).add(new BN(1))).toString();
        const customFee_B = 80;
        const expectedOrigFee = (customFee_A + customFee_B) * origCcyFee_bips_B1 / 10000;

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for B');
        let setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedA_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedA_cent && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == FeeFixedA_cent, 'unexpected USD fixed cent fee after setting USD fee structure for B');

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for A');
        setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedB_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedB_cent && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == FeeFixedB_cent, 'unexpected USD fixed cent fee after setting USD fee structure for A');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: A,                                                          ledger_B: B,
                   qty_A: 750,                                                      tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                        tokTypeId_B: 0,
            ccy_amount_A: 0,                                                        ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.thousandCcy_cents).div(new BN('5')),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
                    feeA: customFee_A,                                                     feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == owner_balBefore + customFee_A + customFee_B - expectedOrigFee, 'unexpected contract owner (fee receiver) USD balance after transfer');

        const ledgerM_after = await stmStLedgerFacet.getLedgerEntry(M);
        const ledgerM_balBefore = ledgerM_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerM_balAfter  =  ledgerM_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);

        assert(ledgerM_balAfter == ledgerM_balBefore + expectedOrigFee, 'unexpected originator token owner (originator fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with originator fees) (fees on A and B) - applyFees set to false`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];
        const M = accounts[global.TaddrNdx + 2];
        const origCcyFee_bips_B1 = 3000;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });

        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
            ledger_A: M,                                  ledger_B: A,
            qty_A: CONST.KT_CARBON,                    tokTypeId_A: CONST.tokenType.TOK_T2,
            qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.OTHER_FEE1,
        });

        const ledgerM_before = await stmStLedgerFacet.getLedgerEntry(M);

        // set fee structure USD: 1000 Wei fixed
        const FeeFixedA_cent = 2500;
        const FeeFixedB_cent = 3500;
        const customFee_A = 60;
        const customFee_B = 80;
        const expectedOrigFee = (customFee_A + customFee_B) * origCcyFee_bips_B1 / 10000;

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for B');
        let setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedA_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedA_cent && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == FeeFixedA_cent, 'unexpected USD fixed cent fee after setting USD fee structure for B');

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for A');
        setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedB_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedB_cent && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == FeeFixedB_cent, 'unexpected USD fixed cent fee after setting USD fee structure for A');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: A,                                                          ledger_B: B,
                   qty_A: 750,                                                      tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                        tokTypeId_B: 0,
            ccy_amount_A: 0,                                                        ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.thousandCcy_cents).div(new BN('5')),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: false,
                    feeA: customFee_A,                                                     feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == owner_balBefore + customFee_A + customFee_B - expectedOrigFee, 'unexpected contract owner (fee receiver) USD balance after transfer');

        const ledgerM_after = await stmStLedgerFacet.getLedgerEntry(M);
        const ledgerM_balBefore = ledgerM_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerM_balAfter  =  ledgerM_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);

        assert(ledgerM_balAfter == ledgerM_balBefore + expectedOrigFee, 'unexpected originator token owner (originator fee receiver) USD balance after transfer');
    });

    it(`custom fees (fixed) - apply USD custom ccy fee on a max. trade (with originator fees) (fees on A and B) - fees larger than ccy transfer amount`, async () => {
        const A = accounts[global.TaddrNdx + 0];
        const B = accounts[global.TaddrNdx + 1];
        const M = accounts[global.TaddrNdx + 2];
        const origCcyFee_bips_B1 = 3000;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST');
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, A, 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, origCcyFee_bips_B1, [], [], { from: accounts[0] });

        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
            ledger_A: M,                                  ledger_B: A,
            qty_A: CONST.KT_CARBON,                    tokTypeId_A: CONST.tokenType.TOK_T2,
            qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.OTHER_FEE1,
        });

        const ledgerM_before = await stmStLedgerFacet.getLedgerEntry(M);

        // set fee structure USD: 1000 Wei fixed
        const FeeFixedA_cent = 2500;
        const FeeFixedB_cent = 3500;
        const customFee_A =  Number(new BN(CONST.thousandCcy_cents).div(new BN('5')));
        const customFee_B = Number(new BN(CONST.thousandCcy_cents).div(new BN('4')));
        const expectedOrigFee = (customFee_A + customFee_B) * origCcyFee_bips_B1 / 10000;

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for B');
        let setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, A, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedA_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedA_cent && ev.ledgerOwner == A);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, A)).fee_fixed == FeeFixedA_cent, 'unexpected USD fixed cent fee after setting USD fee structure for B');

        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == 0, 'unexpected USD fixed cent fee before setting USD fee structure for A');
        setFeeTx = await stmStFeesFacet.setFee_CcyType(0, CONST.ccyType.USD, B, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: FeeFixedB_cent, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == FeeFixedB_cent && ev.ledgerOwner == B);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 0, CONST.ccyType.USD, B)).fee_fixed == FeeFixedB_cent, 'unexpected USD fixed cent fee after setting USD fee structure for A');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedgerCustomFee({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: A,                                                          ledger_B: B,
                   qty_A: 750,                                                      tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                        tokTypeId_B: 0,
            ccy_amount_A: 0,                                                        ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.thousandCcy_cents).div(new BN('10')),         ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
                    feeA: customFee_A,                                                     feeB: customFee_B
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == owner_balBefore + customFee_A + customFee_B - expectedOrigFee, 'unexpected contract owner (fee receiver) USD balance after transfer');

        const ledgerM_after = await stmStLedgerFacet.getLedgerEntry(M);
        const ledgerM_balBefore = ledgerM_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerM_balAfter  =  ledgerM_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);

        assert(ledgerM_balAfter == ledgerM_balBefore + expectedOrigFee, 'unexpected originator token owner (originator fee receiver) USD balance after transfer');
    });
});