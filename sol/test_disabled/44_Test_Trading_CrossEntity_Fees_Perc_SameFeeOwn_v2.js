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

        await stmStErc20Facet.updateEntity({id: CONST.testId1, addr: CONST.testAddr9});
        await stmStErc20Facet.createEntity({id: CONST.testId2, addr: CONST.testAddr9});
    });

    beforeEach(async () => {
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntity({id: CONST.testId1, addr: accounts[global.TaddrNdx + 0]});
        await stmStErc20Facet.setAccountEntity({id: CONST.testId2, addr: accounts[global.TaddrNdx + 1]});
        if (CONST.logTestAccountUsage)
            console.log(`TaddrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    // ST FEES
    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply NATURE token fee 100 BP on a trade (fee on A)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure NATURE: 1%
        const feeBips = 100; // 100 bp = 1%
        const setFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: feeBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_token_PercBips == feeBips && ev.ledgerOwner == CONST.nullAddr);

        // transfer, with fee structure applied
        const transferAmountTokQty = new BN(100); // 100 kg
        const expectedFeeTokQty = Math.floor(Number(transferAmountTokQty.toString()) * (feeBips/10000));
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],     ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: transferAmountTokQty,             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected carbon NATURE fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(expectedFeeTokQty), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
        
        // fees are *additional* to the supplied transfer token qty's...
        const ledgerA_VcsTokQtyBefore = data.ledgerA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerA_VcsTokQtyAfter  =  data.ledgerA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(ledgerA_VcsTokQtyAfter == Number(ledgerA_VcsTokQtyBefore) - Number(expectedFeeTokQty) - Number(transferAmountTokQty), 'unexpected ledger A (fee payer) NATURE ST quantity after transfer');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply CORSIA token fee 1 BP (min) on a trade 1000 tons (min lot size) (fee on B)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,     CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.MT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure CORSIA: 0.01% (1 bip - minimum % fee)
        const feeBips = 1;
        //const setFeeTx = await stm.setFee_SecTokenType_PercBips(CONST.tokenType.TOK_T1, feeBips);
        const setFeeTx = await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: feeBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T1 && ev.fee_token_PercBips == feeBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 2, CONST.tokenType.TOK_T1, CONST.nullAddr)).fee_percBips == feeBips, 'unexpected CORSIA percentage fee after setting CORSIA fee structure');

        // transfer, with fee structure applied
        const transferAmountTokQty = new BN(CONST.KT_CARBON); // 1000 tons: minimum lot size
        const expectedFeeTokQty = Math.floor(Number(transferAmountTokQty.toString()) * (feeBips/10000));
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokTypeId_A: 0,
                   qty_B: transferAmountTokQty,             tokTypeId_B: CONST.tokenType.TOK_T1,
            ccy_amount_A: CONST.oneEth_wei,                 ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected carbon CORSIA fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnercorsiaTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnercorsiaTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnercorsiaTokQtyAfter == Number(contractOwnercorsiaTokQtyBefore) + Number(expectedFeeTokQty), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');

        // test contract owner has unchanged NATURE balance (i.e. no NATURE fees received)
        const contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
    })

    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply large (>1 batch ST size) token fee 5000 BP on a trade on a newly added ST type`, async () => {
        await stmStLedgerFacet.addSecTokenType('TEST_EEU_TYPE', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr);
        const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        const newTypeId = types.filter(p => p.name == 'TEST_EEU_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(newTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,   CONST.oneEth_wei,             accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure new ST type: 50% = 5000 BP(1.5 STs, 2 batches)
        const feeBips = 5000;
        const setFeeTx = await stmStFeesFacet.setFee_TokType(1, newTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: feeBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == newTypeId && ev.fee_token_PercBips == feeBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 1, newTypeId, CONST.nullAddr)).fee_percBips == feeBips, 'unexpected new eeu type percentage fee after setting fee structure');

        // transfer, with fee structure applied
        const transferAmountTokQty = new BN(1500);
        const expectedFeeTokQty = Math.floor(Number(transferAmountTokQty.toString()) * (feeBips/10000));
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: transferAmountTokQty,             tokTypeId_A: newTypeId,
                   qty_B: 0,                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
               applyFees: true,
        });

        // test contract owner has received expected new ST type token fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == newTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == newTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeTokQty), 'unexpected contract owner (fee receiver) new ST type quantity after transfer');
    });

    // CCY FEES
    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply ETH ccy fee 100 BP on a trade (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,    CONST.oneEth_wei,              accounts[global.TaddrNdx + 0],  'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,   accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1%
        const ethFeePercBips = 100; // 100 bp = 1%
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == 0, 'unexpected ETH percentage fee before setting ETH fee structure');
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_PercBips(CONST.ccyType.ETH, ethFeePercBips);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: ethFeePercBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_PercBips == ethFeePercBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == ethFeePercBips, 'unexpected ETH percentage fee after setting ETH fee structure');
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.USD, CONST.nullAddr)).fee_percBips == 0, 'unexpected USD percentage fee after setting ETH fee structure');

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(100); // Wei
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ethFeePercBips/10000));
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                            ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                     tokTypeId_A: 0,
                   qty_B: 750,                                                   tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: transferAmountCcy,                                     ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                     ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) ETH balance after transfer');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply USD ccy fee 1 BP on a trade (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1, accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,   CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 0.01% 
        const usdFeePercBips = 1; // 1 bp = 0.01%
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_PercBips(CONST.ccyType.USD, usdFeePercBips);
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: usdFeePercBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.USD && ev.fee_ccy_PercBips == usdFeePercBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, CONST.ccyType.USD, CONST.nullAddr)).fee_percBips == usdFeePercBips, 'unexpected USD percentage fee after setting USD fee structure');

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(10000); // 100$ = 10,000 cents
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (usdFeePercBips/10000)); // 0.01% of 100$ = 1 cent
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                                             tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                               tokTypeId_B: 0,
            ccy_amount_A: 0,                                                               ccyTypeId_A: 0,
            ccy_amount_B: transferAmountCcy,                                               ccyTypeId_B: CONST.ccyType.USD,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) USD balance after transfer');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply ccy fee 50 BP on a trade on a newly added ccy`, async () => {
        await stmCcyCollateralizableFacet.addCcyType('TEST_CCY_TYPE', 'TEST_UNIT', 2);
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        const newCcyTypeId = types.filter(p => p.name == 'TEST_CCY_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1, accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, newCcyTypeId,       1000,                          accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure on new ccy: 0.5% 
        const feeBips = 50; // 50 bp = 0.5%
        const setFeeTx = await stmStFeesFacet.setFee_CcyType(2, newCcyTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: feeBips, fee_min: 0, fee_max: 0 } );
        truffleAssert.eventEmitted(setFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == newCcyTypeId && ev.fee_ccy_PercBips == feeBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 2, newCcyTypeId, CONST.nullAddr)).fee_percBips == feeBips, 'unexpected new ccy percentage fee after setting fee structure');
        
        // transfer, with fee structure applied
        const transferAmountCcy = new BN(500); // 500 new ccy units
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (feeBips/10000)); // 0.5% of 500 = 2.5 ccy units
        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                       ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                                              tokTypeId_A: CONST.tokenType.TOK_T2,
                   qty_B: 0,                                                tokTypeId_B: 0,
            ccy_amount_A: 0,                                                ccyTypeId_A: 0,
            ccy_amount_B: transferAmountCcy,                                ccyTypeId_B: newCcyTypeId,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) new ccy balance after transfer');
    });

    // ST + CCY FEES
    it(`cross-entity transfer (same fee owner) - fees (percentage) - apply ETH ccy & NATURE ST fee on a 0.5 ST trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,   CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 100 bp (1%)
        const ccyFeeBips = 100;
        const setCcyFeeTx = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: ccyFeeBips, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setCcyFeeTx, 'SetFeeCcyBps', ev => ev.ccyTypeId == CONST.ccyType.ETH && ev.fee_ccy_PercBips == ccyFeeBips && ev.ledgerOwner == CONST.nullAddr);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_percBips == ccyFeeBips, 'unexpected ETH basis points fee after setting ETH fee structure');

        // set fee structure NATURE: 100 bp (1%)
        const carbonFeeBps = 100;
        const setCarbonFeeTx = await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: carbonFeeBps, fee_min: 0, fee_max: 0 } );
        // truffleAssert.eventEmitted(setCarbonFeeTx, 'SetFeeTokBps', ev => ev.tokTypeId == CONST.tokenType.TOK_T2 && ev.fee_token_PercBips == carbonFeeBps);
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.TOK, 2, CONST.tokenType.TOK_T2, CONST.nullAddr)).fee_percBips == carbonFeeBps, 'unexpected NATURE basis points fee after setting NATURE fee structure');

        // transfer, with fee structure applied
        const transferAmountCcy = new BN(CONST.tenthEth_wei);
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ccyFeeBips/10000));

        const transferAmountCarbon = new BN(500);
        const expectedFeeCarbon = Math.floor(Number(transferAmountCarbon.toString()) * (carbonFeeBps/10000));

        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                              ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                                       tokTypeId_A: 0,
                   qty_B: transferAmountCarbon,                                    tokTypeId_B: CONST.tokenType.TOK_T2,
            ccy_amount_A: transferAmountCcy,                                       ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                                       ccyTypeId_B: 0,
               applyFees: true,
        });

        // test contract owner has received expected ETH fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) ETH balance after transfer');
        
        // test contract owner has received expected carbon NATURE fee
        const contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore) + Number(expectedFeeCarbon), 'unexpected contract owner (fee receiver) NATURE ST quantity after transfer');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - should round fees to zero for minimal transfers (ccy & carbon)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,  accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set % fees to 1bp = 0.01%
        const ccyFeeBips = 1, carbonFeeBps = 1;
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr,      { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: ccyFeeBips,   fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: carbonFeeBps, fee_min: 0, fee_max: 0 } );

        const transferAmountCcy = new BN(100); // 100 cents
        const expectedFeeCcy = Math.floor(Number(transferAmountCcy.toString()) * (ccyFeeBips/10000)); // fee on 100 cents @ 0.01% ~= 0 cents

        const transferAmountCarbon = new BN(100); // 1kg
        const expectedFeeCarbon = Math.floor(Number(transferAmountCarbon.toString()) * (carbonFeeBps/10000)); // fee on 100kg @ 0.01% ~= 0 kg

        const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],                    ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                             tokTypeId_A: 0,
                   qty_B: transferAmountCarbon,                          tokTypeId_B: CONST.tokenType.TOK_T1,
            ccy_amount_A: transferAmountCcy,                             ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                             ccyTypeId_B: 0,
               applyFees: true,
        });

        const owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        const owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(expectedFeeCcy), 'unexpected contract owner (fee receiver) USD balance after transfer');
        
        // test contract owner has received expected carbon CORSIA fee
        // feeOwnerLedgerForA = feeOwnerLedgerForB
        const contractOwnerCarbonTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const contractOwnerCarbonTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerCarbonTokQtyAfter == Number(contractOwnerCarbonTokQtyBefore) + Number(expectedFeeCarbon), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');
    });
    
    it(`cross-entity transfer (same fee owner) - fees (percentage) - should not allow non-owner to set global fee structure (ccy)`, async () => {
        try {
            const tx1 = await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 1, fee_min: 0, fee_max: 0 }, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - should not allow non-owner to set global fee structure (carbon)`, async () => {
        try {
            const tx1 = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 1, fee_min: 0, fee_max: 0 }, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        try {
            const tx1 = await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 1, fee_min: 0, fee_max: 0 }, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - should not allow a transfer with insufficient ccy to cover fees`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,  accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr,      { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 1, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        try {
            const data = await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 0,                                                               tokTypeId_A: 0,
                       qty_B: new BN(CONST.KT_CARBON),                                         tokTypeId_B: CONST.tokenType.TOK_T1,
                ccy_amount_A: new BN(CONST.millionCcy_cents),                                  ccyTypeId_A: CONST.ccyType.USD,
                ccy_amount_B: 0,                                                               ccyTypeId_B: 0,
                   applyFees: true,
            });
            //truffleAssert.prettyPrintEmittedEvents(data.transferTx);
        }
        catch (ex) { 
            assert(ex.reason == 'Insufficient currency A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`cross-entity transfer (same fee owner) - fees (percentage) - should not allow a transfer with insufficient carbon to cover fees`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.millionCcy_cents,  accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1,  accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr,      { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0, fee_percBips: 1, fee_min: 0, fee_max: 0 } );

        try {
            await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                    ledger_A: accounts[global.TaddrNdx + 0],                                      ledger_B: accounts[global.TaddrNdx + 1],
                       qty_A: 0,                                                               tokTypeId_A: 0,
                       qty_B: new BN(CONST.GT_CARBON),                                          tokTypeId_B: CONST.tokenType.TOK_T1,
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
    });
});