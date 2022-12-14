// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StLedger.sol => TokenLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    let stm;
    let stmStMasterFacet;
    let stmStErc20Facet;
    let stmCcyCollateralizableFacet;
    let stmStLedgerFacet;
    let stmStFeesFacet;
    let stmOwnedFacet;
    let stmStMintableFacet;

    const DEF_SEC_TOKEN_COUNT = 3;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);

        const contractType = await stmStMasterFacet.getContractType();
        if (await contractType != CONST.contractType.COMMODITY) this.skip();
        
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
        global.TaddrNdx++;
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    it(`token types - should have correct default values`, async () => {
        const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        assert(types.length == DEF_SEC_TOKEN_COUNT, 'unexpected default type count');

        assert(types[0].name == 'AirCarbon CORSIA Token', `unexpected default type name 1`);
        assert(types[0].id == 1, 'unexpected default type id 1');

        assert(types[1].name== 'AirCarbon Nature Token', `unexpected default type name 2`);
        assert(types[1].id == 2, 'unexpected default type id 2');

        assert(types[2].name== 'AirCarbon Premium Token', `unexpected default type name 3`);
        assert(types[2].id == 3, 'unexpected default type id 3');
    });

    it(`token types - should be able to use newly added ST types`, async () => {
        // add new ST type
        const addSecTokenTx = await stmStLedgerFacet.addSecTokenType('NEW_TYPE_NAME_2', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr);

        const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
        assert(types.filter(p => p.name == 'NEW_TYPE_NAME_2')[0].id == DEF_SEC_TOKEN_COUNT + 1, 'unexpected/missing new eeu type (2)');
        truffleAssert.eventEmitted(addSecTokenTx, 'AddedSecTokenType', ev => ev.id == DEF_SEC_TOKEN_COUNT + 1 && ev.name == 'NEW_TYPE_NAME_2');

        // get new type id
        const newTypeId = types.filter(p => p.name == 'NEW_TYPE_NAME_2')[0].id;

        // batch count before
        const batchCountBefore = (await stmStLedgerFacet.getSecTokenBatch_MaxId.call()).toNumber(); 
        //console.log(`batchCountBefore`, batchCountBefore);
        
        // mint new ST type: 2 batches 
        for (var i=0 ; i < 2 ; i++) {
            await stmStMintableFacet.mintSecTokenBatch(newTypeId, CONST.GT_CARBON * 100, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0] });
        }
        const batchCountAfter_Mint1 = (await stmStLedgerFacet.getSecTokenBatch_MaxId.call()).toNumber(); 
        assert(batchCountAfter_Mint1 == batchCountBefore + 2, `unexpected max batch id ${batchCountAfter_Mint1} after minting (1)`);

        // mint default ST type: 4 batches 
        for (var i=0 ; i < 4 ; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * 100, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0] });
        }
        const batchCountAfter_Mint2 = (await stmStLedgerFacet.getSecTokenBatch_MaxId.call()).toNumber();
        assert(batchCountAfter_Mint2 == batchCountBefore + 6, `unexpected max batch id ${batchCountAfter_Mint2} after minting (2)`);

        // validate ledger: 6 vSTs, 2 of new type
        const ledgerEntryAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerEntryAfter.tokens.length == 6, 'unexpected eeu count in ledger');
        assert(ledgerEntryAfter.tokens.filter(p => p.tokTypeId == newTypeId).length == 2, 'unexpected new eeu type in ledger');
    });

    it(`token types - should not allow non-owner to add an ST type`, async () => {
        try {
            await stmStLedgerFacet.addSecTokenType(`NEW_TYPE_NAME_${new Date().getTime()}`, CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`token types - should not allow adding an existing ST type name`, async () => {
        try {
            const types = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes;
            await stmStLedgerFacet.addSecTokenType(types[0].name, CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Duplicate name', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`token types - should not allow adding an ST type when contract is read only`, async () => {
        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await stmStLedgerFacet.addSecTokenType(`NEW_TYPE_NAME_${new Date().getTime()}`, CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`token types - should not allow adding a spot ST type with an expiry time`, async () => {
        try {
            await stmStLedgerFacet.addSecTokenType(`NEW_TYPE_NAME_${new Date().getTime()}`, CONST.settlementType.SPOT, { ...CONST.nullFutureArgs, 
                expiryTimestamp: new Date().getTime(),
                underlyerTypeId: 0,
                       refCcyId: 0
            }, CONST.nullAddr, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Invalid expiryTimestamp', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`token types - should not allow adding a spot ST type with an underlyer`, async () => {
        try {
            await stmStLedgerFacet.addSecTokenType(`NEW_TYPE_NAME_${new Date().getTime()}`, CONST.settlementType.SPOT, { ...CONST.nullFutureArgs, 
                expiryTimestamp: 0,
                underlyerTypeId: CONST.tokenType.TOK_T1,
                       refCcyId: 0
            }, CONST.nullAddr, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Invalid underlyerTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`token types - should not allow adding a spot ST type with a reference currency`, async () => {
        const spotTypes = (await stmStLedgerFacet.getSecTokenTypes()).tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT);
        try {
            await stmStLedgerFacet.addSecTokenType(`NEW_TYPE_NAME_${new Date().getTime()}`, CONST.settlementType.SPOT, { ...CONST.nullFutureArgs, 
                expiryTimestamp: 0,
                underlyerTypeId: 0,
                       refCcyId: CONST.ccyType.USD, 
            }, CONST.nullAddr, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Invalid refCcyId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });
});