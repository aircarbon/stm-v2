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
        stmStBurnableFacet = await StBurnableFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);

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
            accounts });

        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[49]});
        await stmStErc20Facet.createEntity({id: 2, addr: CONST.testAddr99});
    });

    beforeEach(async () => {
        global.TaddrNdx++;
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx + 0]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    // *** why burn 0.5 eeu costs more gas than burn 1.5 ?

    it(`retokenize - should allow owner to burn half a vST`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty = CONST.GT_CARBON / 2;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty
                }
            ]
        });
        
        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(Number(eeuAfter.currentQty) == Number(eeuAfter.mintedQty) / 2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for same user`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(Number(eeuAfter.currentQty) == Number(eeuBefore.currentQty) - burnTokQty1 - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty1 + burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for diff users`, async () => {
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[51]});
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[51], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore1 = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId1 = ledgerBefore1.tokens[0].stId;
        const eeuBefore1 = await stmStLedgerFacet.getSecToken(stId1);
        const batch0_before1 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore1.batchId);
        assert(Number(batch0_before1.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const ledgerBefore2 = await stmStLedgerFacet.getLedgerEntry(accounts[51]);
        const stId2 = ledgerBefore2.tokens[0].stId;
        const eeuBefore2 = await stmStLedgerFacet.getSecToken(stId2);
        const batch0_before2 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore2.batchId);
        assert(Number(batch0_before2.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[51],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter1 = await stmStLedgerFacet.getSecToken(stId1);
        assert(Number(eeuAfter1.currentQty) == Number(eeuBefore1.currentQty) - burnTokQty1, 'unexpected remaining TONS in ST after burn');

        const eeuAfter2 = await stmStLedgerFacet.getSecToken(stId2);
        assert(Number(eeuAfter2.currentQty) == Number(eeuBefore2.currentQty) - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter1 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter1.batchId);
        assert(batchAfter1.burnedQty == burnTokQty1, 'unexpected batch burned TONS value on batch after burn');

        const batchAfter2 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter2.batchId);
        assert(batchAfter2.burnedQty == burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for diff users, different entities`, async () => {
        await stmStErc20Facet.setAccountEntity({id: 2, addr: accounts[54]});
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[54], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore1 = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId1 = ledgerBefore1.tokens[0].stId;
        const eeuBefore1 = await stmStLedgerFacet.getSecToken(stId1);
        const batch0_before1 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore1.batchId);
        assert(Number(batch0_before1.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const ledgerBefore2 = await stmStLedgerFacet.getLedgerEntry(accounts[54]);
        const stId2 = ledgerBefore2.tokens[0].stId;
        const eeuBefore2 = await stmStLedgerFacet.getSecToken(stId2);
        const batch0_before2 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore2.batchId);
        assert(Number(batch0_before2.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[54],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter1 = await stmStLedgerFacet.getSecToken(stId1);
        assert(Number(eeuAfter1.currentQty) == Number(eeuBefore1.currentQty) - burnTokQty1, 'unexpected remaining TONS in ST after burn');

        const eeuAfter2 = await stmStLedgerFacet.getSecToken(stId2);
        assert(Number(eeuAfter2.currentQty) == Number(eeuBefore2.currentQty) - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter1 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter1.batchId);
        assert(batchAfter1.burnedQty == burnTokQty1, 'unexpected batch burned TONS value on batch after burn');

        const batchAfter2 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter2.batchId);
        assert(batchAfter2.burnedQty == burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for same user, different tokens`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId1 = ledgerBefore.tokens[0].stId;
        const eeuBefore1 = await stmStLedgerFacet.getSecToken(stId1);
        const batch0_before1 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore1.batchId);
        assert(Number(batch0_before1.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const stId2 = ledgerBefore.tokens[1].stId;
        const eeuBefore2 = await stmStLedgerFacet.getSecToken(stId2);
        const batch0_before2 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore2.batchId);
        assert(Number(batch0_before2.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T2, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter1 = await stmStLedgerFacet.getSecToken(stId1);
        assert(Number(eeuAfter1.currentQty) == Number(eeuBefore1.currentQty) - burnTokQty1, 'unexpected remaining TONS in ST after burn');

        const eeuAfter2 = await stmStLedgerFacet.getSecToken(stId2);
        assert(Number(eeuAfter2.currentQty) == Number(eeuBefore2.currentQty) - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter1 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter1.batchId);
        assert(batchAfter1.burnedQty == burnTokQty1, 'unexpected batch burned TONS value on batch after burn');

        const batchAfter2 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter2.batchId);
        assert(batchAfter2.burnedQty == burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for diff users, different tokens`, async () => {
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[52]});
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[52], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore1 = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId1 = ledgerBefore1.tokens[0].stId;
        const eeuBefore1 = await stmStLedgerFacet.getSecToken(stId1);
        const batch0_before1 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore1.batchId);
        assert(Number(batch0_before1.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const ledgerBefore2 = await stmStLedgerFacet.getLedgerEntry(accounts[52]);
        const stId2 = ledgerBefore2.tokens[0].stId;
        const eeuBefore2 = await stmStLedgerFacet.getSecToken(stId2);
        const batch0_before2 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore2.batchId);
        assert(Number(batch0_before2.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[52],
                    tokenTypeId: CONST.tokenType.TOK_T2, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter1 = await stmStLedgerFacet.getSecToken(stId1);
        assert(Number(eeuAfter1.currentQty) == Number(eeuBefore1.currentQty) - burnTokQty1, 'unexpected remaining TONS in ST after burn');

        const eeuAfter2 = await stmStLedgerFacet.getSecToken(stId2);
        assert(Number(eeuAfter2.currentQty) == Number(eeuBefore2.currentQty) - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter1 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter1.batchId);
        assert(batchAfter1.burnedQty == burnTokQty1, 'unexpected batch burned TONS value on batch after burn');

        const batchAfter2 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter2.batchId);
        assert(batchAfter2.burnedQty == burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a part of vST - twice, for diff users, different tokens, different entities`, async () => {
        await stmStErc20Facet.setAccountEntity({id: 2, addr: accounts[55]});
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[55], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore1 = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId1 = ledgerBefore1.tokens[0].stId;
        const eeuBefore1 = await stmStLedgerFacet.getSecToken(stId1);
        const batch0_before1 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore1.batchId);
        assert(Number(batch0_before1.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const ledgerBefore2 = await stmStLedgerFacet.getLedgerEntry(accounts[55]);
        const stId2 = ledgerBefore2.tokens[0].stId;
        const eeuBefore2 = await stmStLedgerFacet.getSecToken(stId2);
        const batch0_before2 = await stmStLedgerFacet.getSecTokenBatch(eeuBefore2.batchId);
        assert(Number(batch0_before2.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty1 = CONST.GT_CARBON / 2;
        const burnTokQty2 = CONST.GT_CARBON / 5;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty1
                },
                {
                    batchOwner: accounts[55],
                    tokenTypeId: CONST.tokenType.TOK_T2, 
                    k_stIds: [], 
                    qty: burnTokQty2
                },
            ]
        });
        
        // check ST
        const eeuAfter1 = await stmStLedgerFacet.getSecToken(stId1);
        assert(Number(eeuAfter1.currentQty) == Number(eeuBefore1.currentQty) - burnTokQty1, 'unexpected remaining TONS in ST after burn');

        const eeuAfter2 = await stmStLedgerFacet.getSecToken(stId2);
        assert(Number(eeuAfter2.currentQty) == Number(eeuBefore2.currentQty) - burnTokQty2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter1 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter1.batchId);
        assert(batchAfter1.burnedQty == burnTokQty1, 'unexpected batch burned TONS value on batch after burn');

        const batchAfter2 = await stmStLedgerFacet.getSecTokenBatch(eeuAfter2.batchId);
        assert(batchAfter2.burnedQty == burnTokQty2, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to retokenize for users from different entities`, async () => {
        await stmStErc20Facet.setAccountEntity({id: 2, addr: accounts[53]});
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty = CONST.GT_CARBON / 2;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 2,
            batchOwner: accounts[53],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty
                }
            ]
        });
        
        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(Number(eeuAfter.currentQty) == Number(eeuAfter.mintedQty) / 2, 'unexpected remaining TONS in ST after burn');

        // check batch 
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn a single full vST`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerBefore.tokens.length == 1, `unexpected ledger ST entry before burn (${ledgerBefore.tokens.length})`);
        const stId = ledgerBefore.tokens[0].stId;
        const eeuBefore = await stmStLedgerFacet.getSecToken(stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeuBefore.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch before burn');

        const burnTokQty = CONST.GT_CARBON;

        // retokenizing
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 3,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty
                }
            ]
        });

        // check ST
        const eeuAfter = await stmStLedgerFacet.getSecToken(stId);
        assert(eeuAfter.currentQty == 0, 'unexpected remaining TONS in ST after burn');

        // check batch
        const batchAfter = await stmStLedgerFacet.getSecTokenBatch(eeuAfter.batchId);
        assert(batchAfter.burnedQty == burnTokQty, 'unexpected batch burned TONS value on batch after burn');
    });

    it(`retokenize - should allow owner to burn 1.5 vSTs`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON / 2, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON / 2, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const ledgerBefore = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerBefore.tokens.length == 2, `unexpected ledger ST entry before burn (${ledgerBefore.tokens.length})`);
        const eeu0_before = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[0].stId);
        const eeu1_before = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[1].stId);
        const batch0_before = await stmStLedgerFacet.getSecTokenBatch(eeu0_before.batchId);
        const batch1_before = await stmStLedgerFacet.getSecTokenBatch(eeu1_before.batchId);
        assert(Number(batch0_before.burnedQty) == 0, 'unexpected burn TONS value on batch 0 before burn');
        assert(Number(batch1_before.burnedQty) == 0, 'unexpected burn TONS value on batch 1 before burn');

        // retokenize - burn 1.5 eeus
        const burnTokQty = (CONST.GT_CARBON / 4) * 3;
        const expectRemainTokQty = CONST.GT_CARBON - burnTokQty;

        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 4,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T1, 
                    k_stIds: [], 
                    qty: burnTokQty
                }
            ]
        });

        // check STs
        const eeu0_After = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[0].stId);
        const eeu1_After = await stmStLedgerFacet.getSecToken(ledgerBefore.tokens[1].stId);
        assert(eeu0_After.currentQty == 0, 'unexpected remaining TONS in ST 0 after burn');
        assert(eeu1_After.currentQty == expectRemainTokQty, 'unexpected remaining TONS in ST 1 after burn');

        // check batches
        const batch0_after = await stmStLedgerFacet.getSecTokenBatch(eeu0_before.batchId);
        assert(batch0_after.burnedQty == CONST.GT_CARBON / 2, 'unexpected batch burned TONS value on batch 0 after burn');
        
        const batch1_after = await stmStLedgerFacet.getSecTokenBatch(eeu1_before.batchId);
        assert(batch1_after.burnedQty == CONST.GT_CARBON / 2 - expectRemainTokQty, 'unexpected batch burned TONS value on batch 0 after burn');
    });

    it(`retokenize - should allow owner to burn multiple vSTs of the correct type`, async () => {
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

        // retokenize - burn all NATURE STs
        const burnTokQty = CONST.GT_CARBON * 3;
        
        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T2,
            mintQty: CONST.GT_CARBON * 5,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: CONST.tokenType.TOK_T2, 
                    k_stIds: [], 
                    qty: burnTokQty
                }
            ]
        });

        // check STs
        for (var i = 0; i < nature_eeus.length; i++) {
            const vcsSecTokenAfter = await stmStLedgerFacet.getSecToken(nature_eeus[i].stId);
            assert(vcsSecTokenAfter.currentQty == 0, 'unexpected remaining TONS in NATURE ST after burn');
        }

        // check burned batches
        const nature_batch4_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch4_before.id);
        const nature_batch5_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch5_before.id);
        const nature_batch6_after = await stmStLedgerFacet.getSecTokenBatch(nature_batch6_before.id);
        assert(nature_batch4_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch4_after');
        assert(nature_batch5_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch5_after');
        assert(nature_batch6_after.burnedQty == burnTokQty / 3, 'unexpected batch burned TONS value on nature_batch6_after');
    })

    it(`retokenize - should not allow burning for non-existent ledger owner`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[30]});
        const a9_le = await stmStLedgerFacet.getLedgerEntry(accounts[30]);
        assert(a9_le.exists == false, 'expected non-existent ledger entry');
        try {
            await validateRetokanizationOutcome({
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: CONST.GT_CARBON * 5,
                batchOwner: accounts[49],
                retokenizationBurningParam: [
                    {
                        batchOwner: accounts[30],
                        tokenTypeId: CONST.tokenType.TOK_T1, 
                        k_stIds: [], 
                        qty: CONST.GT_CARBON
                    }
                ]
            });
        } catch (ex) { 
            assert(ex.reason == 'Bad ledgerOwner', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`retokenize - should not allow burning invalid (0) token units (1)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        const a0_le = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await validateRetokanizationOutcome({
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: CONST.GT_CARBON * 5,
                batchOwner: accounts[49],
                retokenizationBurningParam: [
                    {
                        batchOwner: accounts[global.TaddrNdx],
                        tokenTypeId: CONST.tokenType.TOK_T1, 
                        k_stIds: [], 
                        qty: 0
                    }
                ]
            });
        } catch (ex) { 
            assert(ex.reason == 'Bad burnQty', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`retokenize - should not allow burning mismatched ST type (1)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await validateRetokanizationOutcome({
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: CONST.GT_CARBON * 5,
                batchOwner: accounts[49],
                retokenizationBurningParam: [
                    {
                        batchOwner: accounts[global.TaddrNdx],
                        tokenTypeId: CONST.tokenType.TOK_T2, 
                        k_stIds: [], 
                        qty: CONST.GT_CARBON
                    }
                ]
            });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    }); 

    it(`retokenize - should not allow burning mismatched ST type (2)`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], CONST.tokenType.TOK_T1, CONST.GT_CARBON, []);
        var ledger = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        try {
            await validateRetokanizationOutcome({
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: CONST.GT_CARBON * 5,
                batchOwner: accounts[49],
                retokenizationBurningParam: [
                    {
                        batchOwner: accounts[global.TaddrNdx],
                        tokenTypeId: CONST.tokenType.TOK_T1, 
                        k_stIds: [], 
                        qty: CONST.GT_CARBON
                    }
                ]
            });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert(false, 'expected contract exception');
    });

    it(`retokenize - should not allow retokanizing when contract is read only`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await stmStLedgerFacet.retokenizeSecToken(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], [{batchOwner: accounts[49], tokenTypeId: CONST.tokenType.TOK_T1, k_stIds: [], qty: CONST.GT_CARBON}], { from: accounts[0], });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing when from a non-owner`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await stmStLedgerFacet.retokenizeSecToken(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], [{batchOwner: accounts[49], tokenTypeId: CONST.tokenType.TOK_T1, k_stIds: [], qty: CONST.GT_CARBON}], { from: accounts[10], });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing to an account without entity`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            await stmStLedgerFacet.retokenizeSecToken(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx + 1], CONST.nullFees, 0, [], [], [{batchOwner: accounts[global.TaddrNdx], tokenTypeId: CONST.tokenType.TOK_T1, k_stIds: [], qty: CONST.GT_CARBON}], { from: accounts[0], });
        } catch (ex) { 
            assert(ex.reason == 'The address is not assigned to any entity', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing where burning quantity is above INT type limit`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0], });
        try {
            const aboveIntLimit = ((new BN('2')).pow(new BN('255'))).toString();
            await stmStLedgerFacet.retokenizeSecToken(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], [{batchOwner: accounts[global.TaddrNdx], tokenTypeId: CONST.tokenType.TOK_T1, k_stIds: [], qty: aboveIntLimit}], { from: accounts[0], });
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: type overflow', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`retokenization - burning by id - should allow full burning of specific STs by IDs`, async () => {
        const A = accounts[global.TaddrNdx];

        // mint STs for A
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T3, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 

        const le_before = await stmStLedgerFacet.getLedgerEntry(A);

        // define tokens to burn
        const burnType = CONST.tokenType.TOK_T1;
        const burnSts = le_before.tokens.filter(p => p.tokTypeId == burnType && p.stId % 2 == 1);
        assert(burnSts.length > 0, 'bad test data');
        const burnStIds = burnSts.map(p => p.stId);
        const burnQty = burnSts.map(p => p.currentQty).reduce((a,b) => a.add(new BN(b)), new BN(0));
                        
        // burn baby
        // await stmStBurnableFacet.burnTokens(accounts[global.TaddrNdx], burnType, burnQty.toString(), burnStIds);

        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T1,
            mintQty: CONST.GT_CARBON * 5,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: burnType, 
                    k_stIds: burnStIds, 
                    qty: burnQty.toString()
                }
            ]
        });

        // check batches
        for (var st of burnSts) {
            const batch = await stmStLedgerFacet.getSecTokenBatch(st.batchId);
            assert(batch.burnedQty == CONST.GT_CARBON, `unexpected batch (stid=${st.stId}) after burn`);
        }
    });

    it(`retokenize - burning by id - should allow partial burning of a single specific ST by ID`, async () => {
        const A = accounts[global.TaddrNdx];

        // mint STs for A
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], );
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T3, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], [], ); 

        const le_before = await stmStLedgerFacet.getLedgerEntry(A);

        // define tokens to burn
        const burnType = CONST.tokenType.TOK_T3;
        const burnSts = le_before.tokens.filter(p => p.tokTypeId == burnType);
        assert(burnSts.length > 0, 'bad test data');
        //const burnType = CONST.tokenType.TOK_T3;
        //const burnSts = le_before.tokens.filter(p => p.tokTypeId == burnType);

        const burnStIds = burnSts.map(p => p.stId);
        const burnQty = burnSts.map(p => p.currentQty).reduce((a,b) => a.add(new BN(b)), new BN(0)).div(new BN(2));

        await validateRetokanizationOutcome({
            tokTypeId: CONST.tokenType.TOK_T2,
            mintQty: CONST.GT_CARBON * 7,
            batchOwner: accounts[49],
            retokenizationBurningParam: [
                {
                    batchOwner: accounts[global.TaddrNdx],
                    tokenTypeId: burnType, 
                    k_stIds: burnStIds, 
                    qty: burnQty.toString()
                }
            ]
        });

        // check batches
        for (var st of burnSts) {
            const batch = await stmStLedgerFacet.getSecTokenBatch(st.batchId);
            assert(batch.burnedQty == burnQty.toString(), `unexpected batch (stid=${st.stId}) after burn`);
        }
    });

    const validateRetokanizationOutcome = async({tokTypeId, mintQty, mintSecTokenCount = 1, batchOwner, originatorFee = CONST.nullFees, origCcyFee_percBips_ExFee = 0, metaKeys = [], metaValues = [], retokenizationBurningParam = []}) => {
        // fetching data before the retokenization
        const allStTokensBefore = await getAllTokens();

        const ledgersBefore = {};
        const burnedQtyPerAccount = {};
        const burnedQtyPerToken = {};
        let totalBurnedQty = 0;
        
        for(let i = 0; i < retokenizationBurningParam.length; i++) {
            const currBatchOwner = retokenizationBurningParam[i].batchOwner;
            const currTokenId = retokenizationBurningParam[i].tokenTypeId;
            const currQty = retokenizationBurningParam[i].qty;

            if(burnedQtyPerAccount[currBatchOwner] === undefined) {
                ledgersBefore[currBatchOwner] = await stmStLedgerFacet.getLedgerEntry(currBatchOwner);
                burnedQtyPerAccount[currBatchOwner] = currQty;
            } else {
                burnedQtyPerAccount[currBatchOwner] += currQty;
            }

            if(burnedQtyPerToken[currTokenId] === undefined) {
                burnedQtyPerToken[currTokenId] = currQty;
            } else {
                burnedQtyPerToken[currTokenId] += currQty;
            }

            totalBurnedQty += Number(currQty);
        }

        if(ledgersBefore[batchOwner] === undefined) {
            ledgersBefore[batchOwner] = await stmStLedgerFacet.getLedgerEntry(batchOwner);
        }

        if(burnedQtyPerToken[tokTypeId] === undefined) {
            burnedQtyPerToken[tokTypeId] = 0;
        }

        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        const mintedTokQtyBefore = await stmStMintableFacet.getSecToken_totalMintedQty.call();
        
        // retokenization
        const tx = await stmStLedgerFacet.retokenizeSecToken(tokTypeId, mintQty, mintSecTokenCount, batchOwner, originatorFee, origCcyFee_percBips_ExFee, metaKeys, metaValues, retokenizationBurningParam);

        // validate that burn and mint events were not emmited
        truffleAssert.eventNotEmitted(tx, 'BurnedPartialSecToken');
        truffleAssert.eventNotEmitted(tx, 'BurnedFullSecToken');
        truffleAssert.eventNotEmitted(tx, 'Minted');
        truffleAssert.eventNotEmitted(tx, 'MintedSecToken');

        // validate that the retokenization event was emitted
        for(let i = 0; i < retokenizationBurningParam.length; i++) {
            truffleAssert.eventEmitted(
                tx, 
                'RetokenizationBurningToken', 
                ev => {
                    if(ev.owner == retokenizationBurningParam[i].batchOwner && ev.tokenTypeId == retokenizationBurningParam[i].tokenTypeId && ev.burnQty == retokenizationBurningParam[i].qty) {
                        for(let j = 0; j < retokenizationBurningParam[i].k_stIds.length; j++) {
                            if(ev.k_stIds[j] != retokenizationBurningParam[i].k_stIds[j]) {
                                return false;
                            }
                        }
                    } else {
                        return false;
                    }
                    
                    return true;
                }
            ); 
        }
        const maxId = (await stmStLedgerFacet.getSecToken_MaxId()).toNumber();
        truffleAssert.eventEmitted(tx, 'RetokenizationMintingToken', ev => ev.owner == batchOwner && ev.tokenTypeId == tokTypeId && ev.batchId == maxId && ev.qty == mintQty);

        // check global total burned
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + totalBurnedQty,'unexpected total burned TONS');

        // check global total minted
        const mintedTokQtyAfter = await stmStMintableFacet.getSecToken_totalMintedQty.call();
        assert(mintedTokQtyAfter.toNumber() == mintedTokQtyBefore.toNumber() + mintQty,'unexpected total minted TONS');

        // check ledger
        for(let i = 0; i < Object.keys(ledgersBefore).length; i++) {
            const currAddr = Object.keys(ledgersBefore)[i];
            const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(currAddr);
            const ledgerBefore = ledgersBefore[currAddr];

            if(currAddr !== batchOwner) {
                assert(Number(ledgerAfter.spot_sumQty) == Number(ledgerBefore.spot_sumQty) - burnedQtyPerAccount[currAddr], 'unexpected ledger TONS after burn');
                assert(Number(ledgerAfter.spot_sumQtyBurned) == Number(ledgerBefore.spot_sumQtyBurned) + burnedQtyPerAccount[currAddr], 'unexpected spot_sumQtyBurned before vs after');
                assert(Number(ledgerAfter.spot_sumQtyMinted) == Number(ledgerBefore.spot_sumQtyMinted), 'unexpected spot_sumQtyMinted before vs after');
            } else {
                assert(Number(ledgerAfter.spot_sumQty) == Number(ledgerBefore.spot_sumQty) - (burnedQtyPerAccount[currAddr] || 0) + mintQty, 'unexpected ledger TONS after burn for receiver');
                assert(Number(ledgerAfter.spot_sumQtyBurned) == Number(ledgerBefore.spot_sumQtyBurned) + (burnedQtyPerAccount[currAddr] || 0), 'unexpected spot_sumQtyBurned before vs after for receiver');
                assert(Number(ledgerAfter.spot_sumQtyMinted) == Number(ledgerBefore.spot_sumQtyMinted) + mintQty, 'unexpected spot_sumQtyMinted before vs after for receiver');
            }
        }

        // check token types
        const allStTokensAfter = await getAllTokens();

        for(let i = 0; i < Object.keys(burnedQtyPerToken).length; i++) {
            const currTokTypeId = Object.keys(burnedQtyPerToken)[i];

            const totalMintQtyBefore = allStTokensBefore.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.mintedQty), 0);
            const totalMintQtyAfter = allStTokensAfter.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.mintedQty), 0);
            const totalCurrentQtyBefore = allStTokensBefore.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.currentQty), 0);
            const totalCurrentQtyAfter = allStTokensAfter.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.currentQty), 0);

            if(currTokTypeId != (tokTypeId)) {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore) - burnedQtyPerToken[currTokTypeId], 'unexpected remaining cuurrent TONS in ST after burn');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore), 'unexpected remaining minted TONS in ST after burn');
            } else {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore) - (burnedQtyPerToken[currTokTypeId] || 0) + mintQty, 'unexpected remaining TONS in ST after burn for minted tokenId');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore) + mintQty, 'unexpected remaining minted TONS in ST after burn for minted tokenId');
            }
        }
    }

    const getAllTokens = async() => {
        const maxStId = await stmStLedgerFacet.getSecToken_MaxId();
        const allStTokens = [];
        for(let i = 1; i <= maxStId; i++) {
            allStTokens.push(await stmStLedgerFacet.getSecToken(i));
        }

        return allStTokens;
    }
});
