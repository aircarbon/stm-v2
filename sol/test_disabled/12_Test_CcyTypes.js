// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: CcyCollateralizable.sol => CcyLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
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

    var DEF_CCY_TYPE_COUNT;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);

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
        DEF_CCY_TYPE_COUNT = contractType == CONST.contractType.COMMODITY ? 3 : 2;
    });

    beforeEach(async () => {
        global.TaddrNdx++;
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    it(`ccy types - should have correct default (ID 1-based) values`, async () => {
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        assert(types.length == DEF_CCY_TYPE_COUNT, 'unexpected default ccy type count');

        assert(types[0].name == 'USD', 'unexpected default ccy type name 1');
        assert(types[0].unit == 'cents', 'unexpected default ccy type unit 1');
        assert(types[0].id == 1, 'unexpected default ccy type id 1');

        //assert(types[1].name == 'ETH', 'unexpected default ccy type name 2');
        //assert(types[1].unit == 'Wei', 'unexpected default ccy type unit 2');
        //assert(types[1].id == 2, 'unexpected default ccy type id 2');
    });

    it(`ccy types - should make visible newly added currency types in the ledger`, async () => {
        // add new ccy type
        const addCcyTx = await stmCcyCollateralizableFacet.addCcyType('TEST_COIN', 'TEST_UNIT', 2);
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;

        const newTypeId = types.filter(p => p.name == 'TEST_COIN')[0].id;
        assert(types.filter(p => p.name == 'TEST_COIN')[0].id == DEF_CCY_TYPE_COUNT + 1, 'unexpected/missing new currency type id');
        assert(types.filter(p => p.name == 'TEST_COIN')[0].unit == 'TEST_UNIT', 'unexpected/missing new currency type unit');
        truffleAssert.eventEmitted(addCcyTx, 'AddedCcyType', ev => ev.id == DEF_CCY_TYPE_COUNT + 1 && ev.name == 'TEST_COIN' && ev.unit == 'TEST_UNIT');

        // validate ledger entry (non-existent) has the new type
        const ledgerEntryAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerEntryAfter.ccys.some(p => p.ccyTypeId == newTypeId), 'missing new currency type id from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.name == 'TEST_COIN'), 'missing/invalid new currency name from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.unit == 'TEST_UNIT'), 'missing/invalid new currency unit from ledger after minting');
    });

    it(`ccy types - should allow funding of newly added currency types`, async () => {
        // add new ccy type
        await stmCcyCollateralizableFacet.addCcyType('TEST_COIN2', 'TEST_UNIT', 42);
        const types = (await stmCcyCollateralizableFacet.getCcyTypes()).ccyTypes;
        const newTypeId = types.filter(p => p.name == 'TEST_COIN2')[0].id;
        assert(types.filter(p => p.name == 'TEST_COIN2')[0].decimals == 42, 'unexpected # decimal places on new currency type');

        // fund new ccy type & validate
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, newTypeId, 424242, accounts[global.TaddrNdx], 'TEST');
        ledgerEntryAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == newTypeId).balance == 424242, 'unexpected ledger balance of new currency type after funding');
    });

    it(`ccy types - should not allow non-owner to add a currency type`, async () => {
        try {
            await stmCcyCollateralizableFacet.addCcyType('NEW_TYPE_ID_3', 'test_unit', 2, { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`ccy types - should not allow adding an existing currency type name`, async () => {
        try {
            await stmCcyCollateralizableFacet.addCcyType('USD', 'test_unit', 2, { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Currency type name already exists', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`ccy types - should not allow adding a currency type when contract is read only`, async () => {
        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] }); 
            await stmCcyCollateralizableFacet.addCcyType('NEW_TYPE_ID_4', 'test_unit', 2, { from: accounts[0] });
        } catch (ex) {
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
});