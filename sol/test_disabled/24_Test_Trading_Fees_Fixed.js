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
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    // ST FEES
    it(`fees (fixed) - apply NATURE token fee on a trade (fee on A)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,        CONST.oneEth_wei,        accounts[global.TaddrNdx + 1],   'TEST', );

        // set fee structure NATURE: 2 TONS carbon fixed
        const carbonTokQtyFixedFee = 2;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_fixed == 0, 'unexpected NATURE fixed TONS fee before setting NATURE fee structure');
        const setFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: carbonTokQtyFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_tokenQty_Fixed == carbonTokQtyFixedFee && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_fixed == carbonTokQtyFixedFee, 'unexpected NATURE fixed TONS fee after setting NATURE fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T1, CONST.nullAddr)).fee_fixed == 0, 'unexpected CORSIA fixed TONS fee after setting NATURE fee structure');

        // transfer, with fee structure applied
        const carbonTokQtyTransferAmount = 750;
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: carbonTokQtyTransferAmount,       tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected carbon NATURE fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(carbonTokQtyFixedFee), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
        
        // fees are *additional* to the supplied transfer token qty's...
        const ledgerA_VcsTokQtyBefore = data.ledgerA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerA_VcsTokQtyAfter  =  data.ledgerA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(ledgerA_VcsTokQtyAfter == Number(ledgerA_VcsTokQtyBefore) - Number(carbonTokQtyFixedFee) - Number(carbonTokQtyTransferAmount), 'unexpected ledger A (fee payer) NATURE ST quantity after transfer');
    });

    it(`fees (fixed) - apply CORSIA token fee on a trade (fee on B)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,     CONST.oneEth_wei,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure CORSIA: 1 TONS carbon fixed, NATURE: no fee
        const unfccFixedFee = 2;
        //const setUnfccFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T1, unfccFixedFee);
        //const setVcsFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T2, 0);
        const setUnfccFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: unfccFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        const setVcsFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0,             fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setUnfccFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T1 && ev.fee_tokenQty_Fixed == unfccFixedFee && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T1, CONST.nullAddr)).fee_fixed == unfccFixedFee, 'unexpected CORSIA fixed TONS fee after setting CORSIA fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_fixed == 0, 'unexpected NATURE fixed TONS fee after setting CORSIA fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokTypeId_A: 0,
                   qty_B: 750,                              tokTypeId_B: CONST.tokenType.TOK_T1,
            ccy_amount_A: CONST.oneEth_wei,                 ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected carbon CORSIA fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnercorsiaTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnercorsiaTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnercorsiaTokQtyAfter == Number(contractOwnercorsiaTokQtyBefore) + Number(unfccFixedFee), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');

        // test contract owner has unchanged NATURE balance (i.e. no NATURE fees received)
        const contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
    });

    it(`fees (fixed) - apply large (>1 batch ST size) token fee on a trade on a newly added ST type`, async () => {
        await stmStLedgerFacet.addSecTokenType('TEST_EEU_TYPE', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr);
        const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        const newSectokTypeId = types.filter(p => p.name == 'TEST_EEU_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,         CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure new ST type: 1500 TONS carbon fixed (1.5 STs, 2 batches)
        const newSecTokenTypeFixedFee = 1500;
        const setFeeTx = await stmStFeesFacet.setFee_TokType(1, newSectokTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newSecTokenTypeFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == newSectokTypeId && ev.fee_tokenQty_Fixed == newSecTokenTypeFixedFee && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, newSectokTypeId, CONST.nullAddr)).fee_fixed == newSecTokenTypeFixedFee, 'unexpected new ST type fixed TONS fee after setting fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 1,                                tokTypeId_A: newSectokTypeId,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected new ST type token fee
        // feeOwnerLedgerForA = feeOwnerLedgerForA_after
        const owner_balBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(newSecTokenTypeFixedFee), 'unexpected contract owner (fee receiver) new ST type quantity after transfer');
    });

    // CCY FEES
    it(`fees (fixed) - apply ETH ccy fee on a max. trade (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 1000;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure');
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFixed_Wei && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFixed_Wei, 'unexpected ETH fixed Wei fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == 0, 'unexpected USD fixed cents fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.oneEth_wei).sub(new BN(ethFeeFixed_Wei)), ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ethFeeFixed_Wei), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`fees (fixed) - apply USD ccy fee on a max. trade (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const usdFeeFixed_cents = CONST.thousandCcy_cents;
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.USD, usdFeeFixed_cents);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == usdFeeFixed_cents && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == usdFeeFixed_cents, 'unexpected USD fixed cents fee after setting USD fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: new BN(CONST.millionCcy_cents).sub(new BN(usdFeeFixed_cents)),   ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(usdFeeFixed_cents), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`fees (fixed) - apply ccy fee on a max. trade on a newly added ccy`, async () => {
        await stmCcyCollateralizableFacet.addCcyType('TEST_CCY_TYPE', 'TEST_UNIT', 2);
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        const newCcyTypeId = types.filter(p => p.name == 'TEST_CCY_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, newCcyTypeId,             1000,                          accounts[global.TaddrNdx + 1], 'TEST', );  

        // set fee structure new ccy: 100 units
        const newCcyFeeFixed_units = 100;
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, newCcyTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newCcyFeeFixed_units, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == newCcyTypeId && ev.fee_ccy_Fixed == newCcyFeeFixed_units && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, newCcyTypeId, CONST.nullAddr)).fee_fixed == newCcyFeeFixed_units, 'unexpected new currency fixed fee after setting fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                              tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                                ccyTypeId_A: 0,
            ccy_amount_B: new BN(1000).sub(new BN(newCcyFeeFixed_units)),   ccyTypeId_B: newCcyTypeId,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(newCcyFeeFixed_units), 'unexpected contract owner (fee receiver) new ccy balance after transfer');
    });

    // ST + CCY FEES
    it(`fees (fixed) - apply ETH ccy & NATURE ST fee on a max. trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND,  CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 1000;
        //const setEthFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        const setEthFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setEthFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_Fixed == ethFeeFixed_Wei && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == ethFeeFixed_Wei, 'unexpected ETH fixed Wei fee after setting ETH fee structure');

        // set fee structure NATURE: 10 TONS fixed
        const vcsTokQtyFeeFixed = 10;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_fixed == 0, 'unexpected NATURE fixed TONS fee before setting NATURE fee structure');
        //const setCarbonFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T2, vcsTokQtyFeeFixed);
        const setCarbonFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: vcsTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setCarbonFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_tokenQty_Fixed == vcsTokQtyFeeFixed && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_fixed == vcsTokQtyFeeFixed, 'unexpected NATURE fixed TONS fee after setting NATURE fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                         tokTypeId_A: 0,
                   qty_B: new BN(CONST.KT_CARBON).sub(new BN(vcsTokQtyFeeFixed)),    tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: new BN(CONST.oneEth_wei).sub(new BN(ethFeeFixed_Wei)),     ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                         ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ethFeeFixed_Wei), 'unexpected contract owner (fee receiver) ETH balance after transfer');
        
        // test contract owner has received expected carbon NATURE fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore) + Number(vcsTokQtyFeeFixed), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
    });

    it(`fees (fixed) - apply USD ccy & CORSIA ST fee on a max. trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,     CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure USD: 100 cents
        const usdFeeFixed_cents = CONST.oneCcy_cents;
        //const setUsdFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.USD, usdFeeFixed_cents);
        const setUsdFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setUsdFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_Fixed == usdFeeFixed_cents && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_fixed == usdFeeFixed_cents, 'unexpected USD fixed cents fee after setting USD fee structure');

        // set fee structure CORSIA: 42 TONS fixed
        const corsiaTokQtyFeeFixed = 42;
        //const setCarbonFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T1, corsiaTokQtyFeeFixed);
        const setCarbonFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: corsiaTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setCarbonFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == CONST.tokenType.TOK_T1 && ev.fee_tokenQty_Fixed == corsiaTokQtyFeeFixed && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, CONST.tokenType.TOK_T1, CONST.nullAddr)).fee_fixed == corsiaTokQtyFeeFixed, 'unexpected CORSIA fixed TONS fee after setting CORSIA fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                          ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                                   tokTypeId_A: 0,
                   qty_B: new BN(CONST.KT_CARBON).sub(new BN(corsiaTokQtyFeeFixed)),           tokTypeId_B: CONST.tokenType.TOK_T1,
            ccy_amount_A: new BN(CONST.millionCcy_cents).sub(new BN(usdFeeFixed_cents)),       ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                                                   ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected USD fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(usdFeeFixed_cents), 'unexpected contract owner (fee receiver) USD balance after transfer');
        
        // test contract owner has received expected carbon CORSIA fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore) + Number(corsiaTokQtyFeeFixed), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');    
    });

    it(`fees (fixed) - apply newly added ccy & newly added ST type fee on a max. trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.addCcyType('TEST_CCY_TYPE_2', 'TEST_UNIT', 2);
        const ccyTypes = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        const newCcyTypeId = ccyTypes.filter(p => p.name == 'TEST_CCY_TYPE_2')[0].id;

        await stmStLedgerFacet.addSecTokenType('TEST_EEU_TYPE_2', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr);
        const tokenTypes = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        const newSectokTypeId = tokenTypes.filter(p => p.name == 'TEST_EEU_TYPE_2')[0].id;

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, newCcyTypeId,           1000,                         accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId,         CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure new ccy
        const ccyFeeFixed_units = 10;
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, newCcyTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ccyFeeFixed_units, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyFix', ev => ev.ccyTypeId == newCcyTypeId && ev.fee_ccy_Fixed == ccyFeeFixed_units && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, newCcyTypeId, CONST.nullAddr)).fee_fixed == ccyFeeFixed_units, 'unexpected new ccy fixed fee after setting ccy fee structure');

        // set fee structure new ST type: 1 TONS
        const newSecTokenTypeTokQtyFeeFixed = 1;
        const setCarbonFeeTx = await stmStFeesFacet.setFee_TokType(1, newSectokTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newSecTokenTypeTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        truffleAssert.eventEmitted(setCarbonFeeTx, 'SetFeeTokFix', ev => ev.tokTypeId == newSectokTypeId && ev.fee_tokenQty_Fixed == newSecTokenTypeTokQtyFeeFixed && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, newSectokTypeId, CONST.nullAddr)).fee_fixed == newSecTokenTypeTokQtyFeeFixed, 'unexpected new eeu type fixed TONS fee after setting eeu fee structure');

        // transfer, with fee structure applied
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                               ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                                        tokTypeId_A: 0,
                   qty_B: new BN(CONST.KT_CARBON).sub(new BN(newSecTokenTypeTokQtyFeeFixed)),       tokTypeId_B: newSectokTypeId,
            ccy_amount_A: new BN(1000).sub(new BN(ccyFeeFixed_units)),                              ccyTypeId_A: newCcyTypeId,
            ccy_amount_B: 0,                                                                        ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ccy fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ccyFeeFixed_units), 'unexpected contract owner (fee receiver) newly added ccy balance after transfer');
        
        // test contract owner has received expected token fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnerSecTokenTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerSecTokenTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerSecTokenTokQtyAfter == Number(contractOwnerSecTokenTokQtyBefore) + Number(newSecTokenTypeTokQtyFeeFixed), 'unexpected contract owner (fee receiver) newly added ST type quantity after transfer');    
    });


    it(`fees (fixed) - should not allow non-owner to set global fee structure (ccy)`, async () => {
        try {
            const tx1 = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 10, fee_percBips: 0, fee_min: 0, fee_max: 0 }, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`fees (fixed) - should not allow non-owner to set global fee structure (tokens)`, async () => {
        try {
            const tx1 = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 10, fee_percBips: 0, fee_min: 0, fee_max: 0 }, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`fees (fixed) - should not allow a transfer with insufficient ccy to cover fees (A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,     CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr,      { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 1, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, CONST.nullFees );

        try {
            await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 0,                                                               tokTypeId_A: 0,
                       qty_B: new BN(CONST.KT_CARBON),                                         tokTypeId_B: CONST.tokenType.TOK_T1,
                ccy_amount_A: new BN(CONST.millionCcy_cents),                                  ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                                               ccyTypeId_B: 0,
                   applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient currency A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`fees (fixed) - should not allow a transfer with insufficient tokens to cover fees (B)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,     CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr,      CONST.nullFees );
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 1, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        try {
            await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 0,                                                               tokTypeId_A: 0,
                       qty_B: new BN(CONST.KT_CARBON),                                         tokTypeId_B: CONST.tokenType.TOK_T1,
                ccy_amount_A: new BN(CONST.millionCcy_cents),                                  ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                                               ccyTypeId_B: 0,
                   applyFees: true,
            });
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient tokens B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    })

    it(`fees - should fail to get fees when both entity id and user address are provided`, async () => {
        await CONST.expectRevertFromCall(stmStFeesFacet.getFee, [CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.testAddr1], 'getFee: either entity id or owner address should be passed');
    });
});