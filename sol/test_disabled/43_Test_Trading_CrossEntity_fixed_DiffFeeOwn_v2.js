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

    // ST FEES
    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply NATURE token fee on a trade (fee on A)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,        CONST.oneEth_wei,        accounts[global.TaddrNdx + 1],   'TEST', );

        // set fee structure NATURE: 2 TONS carbon fixed
        const carbonTokQtyFixedFee = 2;
        const setFeeTx = await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: carbonTokQtyFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore) + Number(carbonTokQtyFixedFee), 'unexpected contract owner (fee receiver A) NATURE ST quantity after transfer');

        contractOwner_VcsTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwner_VcsTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwner_VcsTokQtyAfter == Number(contractOwner_VcsTokQtyBefore), 'unexpected contract owner (fee receiver B) NATURE ST quantity after transfer');
        
        // fees are *additional* to the supplied transfer token qty's...
        const ledgerA_VcsTokQtyBefore = data.ledgerA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        const ledgerA_VcsTokQtyAfter  =  data.ledgerA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(ledgerA_VcsTokQtyAfter == Number(ledgerA_VcsTokQtyBefore) - Number(carbonTokQtyFixedFee) - Number(carbonTokQtyTransferAmount), 'unexpected ledger A (fee payer) NATURE ST quantity after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply CORSIA token fee on a trade (fee on B)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,     CONST.oneEth_wei,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure CORSIA: 1 TONS carbon fixed, NATURE: no fee
        const unfccFixedFee = 2;
        //const setUnfccFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T1, unfccFixedFee);
        //const setVcsFeeTx = await stm.setFee_SecTokenType_Fixed(CONST.tokenType.TOK_T2, 0);
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: unfccFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );
        await stmStFeesFacet.setFee_TokType(1, CONST.tokenType.TOK_T2, CONST.nullAddr,   { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 0,             fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let contractOwnercorsiaTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwnercorsiaTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnercorsiaTokQtyAfter == Number(contractOwnercorsiaTokQtyBefore), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');

        contractOwnercorsiaTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwnercorsiaTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnercorsiaTokQtyAfter == Number(contractOwnercorsiaTokQtyBefore) + Number(unfccFixedFee), 'unexpected contract owner (fee receiver) CORSIA ST quantity after transfer');

        // test contract owner has unchanged NATURE balance (i.e. no NATURE fees received)
        let contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver A) NATURE ST quantity after transfer');

        contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver B) NATURE ST quantity after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply large (>1 batch ST size) token fee on a trade on a newly added ST type`, async () => {
        await stmStLedgerFacet.addSecTokenType('TEST_EEU_TYPE', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr);
        const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        const newSectokTypeId = types.filter(p => p.name == 'TEST_EEU_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(newSectokTypeId, 1000, 1,                            accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,         CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure new ST type: 1500 TONS carbon fixed (1.5 STs, 2 batches)
        const newSecTokenTypeFixedFee = 1500;
        await stmStFeesFacet.setFee_TokType(1, newSectokTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newSecTokenTypeFixedFee, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForA_after
        let owner_balBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(newSecTokenTypeFixedFee), 'unexpected contract owner (fee receiver A) new ST type quantity after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) new ST type quantity after transfer');
    });

    // CCY FEES
    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply ETH ccy fee on a max. trade (fee on A)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH,      CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST');
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,  CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 1000;
        assert((await stmStFeesFacet.getFee(CONST.getFeeType.CCY, 1, CONST.ccyType.ETH, CONST.nullAddr)).fee_fixed == 0, 'unexpected ETH fixed Wei fee before setting ETH fee structure');
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.ETH, ethFeeFixed_Wei);
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ethFeeFixed_Wei), 'unexpected contract owner (fee receiver A) ETH balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) ETH balance after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply USD ccy fee on a max. trade (fee on B)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,        CONST.millionCcy_cents,  accounts[global.TaddrNdx + 1], 'TEST', );

        // set fee structure USD: 1000 $ in cents
        const usdFeeFixed_cents = CONST.thousandCcy_cents;
        //const setFeeTx = await stmStFeesFacet.setFee_CcyType_Fixed(CONST.ccyType.USD, usdFeeFixed_cents);
        await stmStFeesFacet.setFee_CcyType(2, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver A) USD balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(usdFeeFixed_cents), 'unexpected contract owner (fee receiver B) USD balance after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply ccy fee on a max. trade on a newly added ccy`, async () => {
        await stmCcyCollateralizableFacet.addCcyType('TEST_CCY_TYPE', 'TEST_UNIT', 2);
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        const newCcyTypeId = types.filter(p => p.name == 'TEST_CCY_TYPE')[0].id;

        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, newCcyTypeId,             1000,                          accounts[global.TaddrNdx + 1], 'TEST', );  

        // set fee structure new ccy: 100 units
        const newCcyFeeFixed_units = 100;
        await stmStFeesFacet.setFee_CcyType(2, newCcyTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newCcyFeeFixed_units, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver A) new ccy balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(newCcyFeeFixed_units), 'unexpected contract owner (fee receiver B) new ccy balance after transfer');
    });

    // ST + CCY FEES
    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply ETH ccy & NATURE ST fee on a max. trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND,  CONST.ccyType.ETH,       CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2,    CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure ETH: 1000 Wei fixed
        const ethFeeFixed_Wei = 1000;
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.ETH, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ethFeeFixed_Wei, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        // set fee structure NATURE: 10 TONS fixed
        const vcsTokQtyFeeFixed = 10;
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T2, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: vcsTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ethFeeFixed_Wei), 'unexpected contract owner (fee receiver A) ETH balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.ETH).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) ETH balance after transfer');
        
        // test contract owner has received expected carbon NATURE fee
        let contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver A) NATURE ST quantity after transfer');

        contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore) + Number(vcsTokQtyFeeFixed), 'unexpected contract owner (fee receiver B) NATURE ST quantity after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply USD ccy & CORSIA ST fee on a max. trade (fees on both sides)`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD,     CONST.millionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], { from: accounts[0] });

        // set fee structure USD: 100 cents
        const usdFeeFixed_cents = CONST.oneCcy_cents;
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: usdFeeFixed_cents, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        // set fee structure CORSIA: 42 TONS fixed
        const corsiaTokQtyFeeFixed = 42;
        await stmStFeesFacet.setFee_TokType(2, CONST.tokenType.TOK_T1, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: corsiaTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(usdFeeFixed_cents), 'unexpected contract owner (fee receiver A) USD balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == CONST.ccyType.USD).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) USD balance after transfer');
        
        // test contract owner has received expected carbon CORSIA fee
        let contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore), 'unexpected contract owner (fee receiver A) CORSIA ST quantity after transfer');
        
        contractOwnerVcsTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwnerVcsTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerVcsTokQtyAfter == Number(contractOwnerVcsTokQtyBefore) + Number(corsiaTokQtyFeeFixed), 'unexpected contract owner (fee receiver B) CORSIA ST quantity after transfer');
    });

    it(`cross-entity transfer (different fee owners) - fees (fixed) - apply newly added ccy & newly added ST type fee on a max. trade (fees on both sides)`, async () => {
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
        await stmStFeesFacet.setFee_CcyType(1, newCcyTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: ccyFeeFixed_units, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

        // set fee structure new ST type: 1 TONS
        const newSecTokenTypeTokQtyFeeFixed = 1;
        await stmStFeesFacet.setFee_TokType(2, newSectokTypeId, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: newSecTokenTypeTokQtyFeeFixed, fee_percBips: 0, fee_min: 0, fee_max: 0 } );

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
        // feeOwnerLedgerForA != feeOwnerLedgerForB
        let owner_balBefore = data.feeOwnerLedgerForA_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        let owner_balAfter  =  data.feeOwnerLedgerForA_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore) + Number(ccyFeeFixed_units), 'unexpected contract owner (fee receiver A) newly added ccy balance after transfer');

        owner_balBefore = data.feeOwnerLedgerForB_before.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        owner_balAfter  =  data.feeOwnerLedgerForB_after.ccys.filter(p => p.ccyTypeId == newCcyTypeId).map(p => p.balance).reduce((a,b) => Number(a) + Number(b), 0);
        assert(owner_balAfter == Number(owner_balBefore), 'unexpected contract owner (fee receiver B) newly added ccy balance after transfer');
        
        // test contract owner has received expected token fee
        let contractOwnerSecTokenTokQtyBefore = data.feeOwnerLedgerForA_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        let contractOwnerSecTokenTokQtyAfter  =  data.feeOwnerLedgerForA_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerSecTokenTokQtyAfter == Number(contractOwnerSecTokenTokQtyBefore), 'unexpected contract owner (fee receiver A) newly added ST type quantity after transfer');  
        
        contractOwnerSecTokenTokQtyBefore = data.feeOwnerLedgerForB_before.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        contractOwnerSecTokenTokQtyAfter  =  data.feeOwnerLedgerForB_after.tokens.filter(p => p.tokTypeId == newSectokTypeId).map(p => p.currentQty).reduce((a,b) => Number(a) + Number(b), 0);
        assert(contractOwnerSecTokenTokQtyAfter == Number(contractOwnerSecTokenTokQtyBefore) + Number(newSecTokenTypeTokQtyFeeFixed), 'unexpected contract owner (fee receiver B) newly added ST type quantity after transfer');  
    });
});