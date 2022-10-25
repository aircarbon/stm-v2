// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StBurnable.sol => TokenLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
const Big = require('big.js');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    var stm;
    var stmStMasterFacet;
    var stmStErc20Facet;
    var stmStMintableFacet;
    var stmCcyCollateralizableFacet;
    var stmStLedgerFacet;
    var stmStFeesFacet;
    var stmStTransferableFacet;
    var stmStBurnableFacet;
    var stmOwnedFacet;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);
        stmStBurnableFacet = await StBurnableFacet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);

        if (await stmStMasterFacet.getContractType() != CONST.contractType.COMMODITY) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;

        await stmStErc20Facet.whitelistMany(accounts.slice(global.TaddrNdx, global.TaddrNdx + 50));
        await stmStMasterFacet.sealContract();
        await setupHelper.setDefaults({ 
            StErc20Facet: stmStErc20Facet, 
            stmStMaster: stmStMasterFacet, 
            stmStLedger: stmStLedgerFacet, 
            stmCcyCollateralizable: stmCcyCollateralizableFacet, 
            stmFees: stmStFeesFacet,
            accounts });
    });

    beforeEach(async () => {
        global.TaddrNdx++;
        if(global.TaddrNdx !== 9) {
            await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx + 0]});
        }
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    // *** why burn 0.5 eeu costs more gas than burn 1.5 ?

    it(`burning - should allow owner to burn half a vST`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        // burn half an ST
        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        const burnTokQty = CONST.GT_CARBON / 2;
        const a0_burnTx1 = await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, burnTokQty, []);
        await CONST.logGas(web3, a0_burnTx1, `Burn 0.5 vST`);

        // validate burn partial ST event
        //truffleAssert.prettyPrintEmittedEvents(a0_burnTx1);
        truffleAssert.eventEmitted(a0_burnTx1, 'BurnedPartialSecToken', ev => {
            return ev.stId == stId
                && ev.tokenTypeId == CONST.tokenType.TOK_T1
                && ev.from == accounts[global.TaddrNdx]
                && ev.burnedQty == burnTokQty
                ;
        });

        // check global total
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + burnTokQty,'unexpected total burned TONS');

        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(Number(eeuAfter.currentQty) == Number(eeuAfter.mintedQty) / 2, 'unexpected remaining TONS in ST after burn');

        // check ledger
        const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerAfter.spot_sumQty == ledgerBefore.spot_sumQty / 2, 'unexpected ledger TONS after burn');

        // check ledger total burned
        //console.log('ledgerBefore.spot_sumQtyBurned', ledgerBefore.spot_sumQtyBurned)
        //console.log('ledgerAfter.spot_sumQtyBurned', ledgerAfter.spot_sumQtyBurned)
        //console.log('burnTokQty', burnTokQty)
        assert(ledgerAfter.spot_sumQtyBurned - ledgerBefore.spot_sumQtyBurned == burnTokQty, 'unexpected spot_sumQtyBurned before vs after');

        // check batch
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`burning - should allow owner to burn a single full vST`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerBefore.tokens.length == 1, `unexpected ledger ST entry before burn (${ledgerBefore.tokens.length})`);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        // burn a full (single) ST
        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        const burnTokQty = CONST.GT_CARBON;
        const a0_burnTx1 = await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, burnTokQty, []);
        await CONST.logGas(web3, a0_burnTx1, `Burn 1.0 vST`);

        // validate burn full ST event
        //truffleAssert.prettyPrintEmittedEvents(a0_burnTx1);
        truffleAssert.eventEmitted(a0_burnTx1, 'BurnedFullSecToken', ev => {
            return ev.stId == stId
                && ev.tokenTypeId == CONST.tokenType.TOK_T1
                && ev.from == accounts[global.TaddrNdx]
                && ev.burnedQty == burnTokQty
                ;
        });

        // check global total
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + burnTokQty, 'unexpected total burned TONS');

        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(eeuAfter.currentQty == 0, 'unexpected remaining TONS in ST after burn');

        // check ledger
        const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerAfter.spot_sumQty == 0, 'unexpected ledger TONS after burn');
        assert(ledgerAfter.tokens.length == 0, 'unexpected ledger ST entry after burn');

        // check batch
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`burning - should allow owner to burn 1.5 vSTs`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON / 2, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON / 2, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        //console.dir(ledgerBefore);
        assert(ledgerBefore.tokens.length == 2, `unexpected ledger ST entry before burn (${ledgerBefore.tokens.length})`);
        const eeu0_before = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[0].stId);
        const eeu1_before = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[1].stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeu0_before.batchId);
        const batch1_before = await stmStLedgerFacet.getSecTokenBatch(eeu1_before.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch 0 before burn');
        assert(Number(batch1_before.burnedQty) == 0, 'unexpected burn TONS value on batch 1 before burn');

        // burn 1.5 eeus
        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        const burnTokQty = (CONST.GT_CARBON / 4) * 3;
        const expectRemainTokQty = CONST.GT_CARBON - burnTokQty;
        const a0_burnTx1 = await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, burnTokQty, []);
        await CONST.logGas(web3, a0_burnTx1, `Burn 1.5 vST`);

        // validate burn full ST event
        //truffleAssert.prettyPrintEmittedEvents(a0_burnTx1);
        truffleAssert.eventEmitted(a0_burnTx1, 'BurnedFullSecToken', ev => { 
            return ev.stId == ledgerBefore.tokens[0].stId
                   && ev.tokenTypeId == CONST.tokenType.TOK_T1
                   && ev.from == accounts[global.TaddrNdx]
                   && ev.burnedQty == CONST.GT_CARBON / 2
                   ;
        });
        truffleAssert.eventEmitted(a0_burnTx1, 'BurnedPartialSecToken', ev => { 
            return ev.stId == ledgerBefore.tokens[1].stId
                   && ev.tokenTypeId == CONST.tokenType.TOK_T1
                   && ev.from == accounts[global.TaddrNdx]
                   && ev.burnedQty == CONST.GT_CARBON - expectRemainTokQty - CONST.GT_CARBON / 2
                   ;
        });

        // check global total
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + burnTokQty, 'unexpected total burned TONS');

        // check STs
        const eeu0_After = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[0].stId);
        const eeu1_After = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[1].stId);
        assert(eeu0_After.currentQty == 0, 'unexpected remaining TONS in ST 0 after burn');
        assert(eeu1_After.currentQty == expectRemainTokQty, 'unexpected remaining TONS in ST 1 after burn');

        // check ledger
        const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        //console.dir(ledgerAfter);
        assert(ledgerAfter.spot_sumQty == expectRemainTokQty, 'unexpected ledger TONS after burn');
        assert(ledgerAfter.tokens.length == 1, 'unexpected ledger ST entry after burn');

        // check batches
        const batch0_after = await stmStLedgerFacet.getSecTokenBatch(eeu0_before.batchId);
        assert(batch0_after.burnedQty == CONST.GT_CARBON / 2, 'unexpected batch burned TONS value on batch 0 after burn');
        
        const batch1_after = await stmStLedgerFacet.getSecTokenBatch(eeu1_before.batchId);
        assert(batch1_after.burnedQty == CONST.GT_CARBON / 2 - expectRemainTokQty, 'unexpected batch burned TONS value on batch 0 after burn');
    });

    it(`burning - should allow owner to burn multiple vSTs of the correct type`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerBefore.tokens.length == 6, `unexpected ledger ST entry before burn (${ledgerBefore.tokens.length})`);
        const unfcc_eeus = ledgerBefore.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T1);
        const nature_eeus = ledgerBefore.tokens.filter(p => p.tokTypeId == CONST.tokenType.TOK_T2);

        // get CORSIA batch IDs
        const corsia_batch1 = await stmStLedgerFacet.getSecTokenBatch(unfcc_eeus[0].batchId);
        const corsia_batch2 = await stmStLedgerFacet.getSecTokenBatch(unfcc_eeus[1].batchId);
        const corsia_batch3 = await stmStLedgerFacet.getSecTokenBatch(unfcc_eeus[2].batchId);
        assert(corsia_batch1.burnedQty == 0, 'unexpected burn TONS value on corsia_batch1 before burn');
        assert(corsia_batch2.burnedQty == 0, 'unexpected burn TONS value on corsia_batch2 before burn');
        assert(corsia_batch3.burnedQty == 0, 'unexpected burn TONS value on corsia_batch3 before burn');

        const nature_batch4_before = await stmStLedgerFacet.getSecTokenBatch(nature_eeus[0].batchId);
        const nature_batch5_before = await stmStLedgerFacet.getSecTokenBatch(nature_eeus[1].batchId);
        const nature_batch6_before = await stmStLedgerFacet.getSecTokenBatch(nature_eeus[2].batchId);
        assert(nature_batch4_before.burnedQty == 0, 'unexpected burn TONS value on nature_batch4 before burn');
        assert(nature_batch5_before.burnedQty == 0, 'unexpected burn TONS value on nature_batch5 before burn');
        assert(nature_batch6_before.burnedQty == 0, 'unexpected burn TONS value on nature_batch6 before burn');

        // burn all NATURE STs
        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        const burnTokQty = CONST.GT_CARBON * 3;
        const expectRemainTokQty = CONST.GT_CARBON * 6 - burnTokQty;
        const burnTx = await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T2, burnTokQty, []);
        await CONST.logGas(web3, burnTx, `Burn 5.0 vST`);

        // validate burn full ST event
        const burnedFullSecTokenEvents = []
        truffleAssert.eventEmitted(burnTx, 'BurnedFullSecToken', ev => { 
            burnedFullSecTokenEvents.push(ev);
            return nature_eeus.some(p => ev.stId == p.stId);
        });
        assert(burnedFullSecTokenEvents.length == 3, 'unexpected full ST burn event count');

        // check global total
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + burnTokQty, 'unexpected total burned TONS');

        // check STs
        for (var i = 0; i < nature_eeus.length; i++) {
            const vcsSecTokenAfter = await stmStLedgerFacet.getSecToken(nature_eeus[i].stId);
            assert(vcsSecTokenAfter.currentQty == 0, 'unexpected remaining TONS in NATURE ST after burn');
        }

        // check ledger
        const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerAfter.spot_sumQty == expectRemainTokQty, 'unexpected ledger TONS after burn');
        assert(ledgerAfter.tokens.length == 3, 'unexpected ledger ST entry after burn');
        assert(ledgerAfter.tokens.every(p => p.tokTypeId == CONST.tokenType.TOK_T1), 'unexpected eeu composition on ledger after burn');

        // check burned batches
        const nature_batch4_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch4_before.id);
        const nature_batch5_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch5_before.id);
        const nature_batch6_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch6_before.id);
        assert(nature_batch4_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch4_after');
        assert(nature_batch5_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch5_after');
        assert(nature_batch6_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch6_after');
    });

    it(`burning - should not allow non-owner to burn STs`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const a0_le = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, CONST.GT_CARBON, [], { from: accounts[10], });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`burning - should not allow burning for non-existent ledger owner`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[9]});
        const a9_le = await stmStLedgerFacet.getLedgerEntry(accounts[9]);
        assert(a9_le.exists == false, 'expected non-existent ledger entry');
        try {
            await stmStBurnableFacet.burnTokens(accounts[9], CONST.tokenType.TOK_T1, CONST.GT_CARBON, []);
        } catch (ex) { 
            assert(ex.reason == 'Bad ledgerOwner', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`burning - should not allow burning invalid (0) token units (1)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const a0_le = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, 0, []);
        } catch (ex) { 
            assert(ex.reason == 'Bad burnQty', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`burning - should not allow burning invalid (-1) token units (2)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, -1, []);
        } catch (ex) { 
            assert(ex.reason == 'Bad burnQty', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`burning - should not allow burning invalid (2^64) token units (3)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            const qty = Big(2).pow(64);//.minus(1);
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, qty.toString(), []);
        } catch (ex) { 
            assert(ex.reason == 'Bad burnQty', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`burning - should not allow burning mismatched ST type (1)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T2, CONST.GT_CARBON, []);
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`burning - should not allow burning mismatched ST type (2)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, CONST.GT_CARBON, []);
        var ledger = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, CONST.GT_CARBON, []);
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`burning - should not allow burning when contract is read only`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const a0_le = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, CONST.GT_CARBON, [], { from: accounts[0], });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
});
