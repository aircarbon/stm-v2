const st = artifacts.require('StMaster');
const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');

contract("StMaster", accounts => {
    var stm;

    const countDefaultCcyTypes = 2;

    beforeEach(async () => {
        stm = await st.deployed();
        if (!global.accountNdx) global.accountNdx = 0;
        global.accountNdx++;
        if (CONST.logTestAccountUsage)
            console.log(`global.accountNdx: ${global.accountNdx} - contract @ ${stm.address} (owner: ${accounts[0]}) - getSecTokenBatchCount: ${(await stm.getSecTokenBatchCount.call()).toString()}`);
    });

    it('ccy types - should have correct default (ID 1-based) values', async () => {
        const types = (await stm.getCcyTypes()).ccyTypes;
        assert(types.length == countDefaultCcyTypes, 'unexpected default ccy type count');

        assert(types[0].name == 'SGD', 'unexpected default ccy type name 1');
        assert(types[0].unit == 'cents', 'unexpected default ccy type unit 1');
        assert(types[0].id == 1, 'unexpected default ccy type id 1');

        assert(types[1].name == 'ETH', 'unexpected default ccy type name 2');
        assert(types[1].unit == 'Wei', 'unexpected default ccy type unit 2');
        assert(types[1].id == 2, 'unexpected default ccy type id 2');
    });

    it('ccy types - should make visible newly added currency types in the ledger', async () => {
        // add new ccy type
        const addCcyTx = await stm.addCcyType('TEST_COIN', 'TEST_UNIT');
        const types = (await stm.getCcyTypes()).ccyTypes;

        const newTypeId = types.filter(p => p.name == 'TEST_COIN')[0].id;
        assert(types.filter(p => p.name == 'TEST_COIN')[0].id == countDefaultCcyTypes + 1, 'unexpected/missing new currency type id');
        assert(types.filter(p => p.name == 'TEST_COIN')[0].unit == 'TEST_UNIT', 'unexpected/missing new currency type unit');
        truffleAssert.eventEmitted(addCcyTx, 'AddedCcyType', ev => ev.id == countDefaultCcyTypes + 1 && ev.name == 'TEST_COIN' && ev.unit == 'TEST_UNIT');

        // validate ledger entry (non-existent) has the new type
        const ledgerEntryAfter = await stm.getLedgerEntry(accounts[global.accountNdx]);
        assert(ledgerEntryAfter.ccys.some(p => p.ccyTypeId == newTypeId), 'missing new currency type id from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.name == 'TEST_COIN'), 'missing/invalid new currency name from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.unit == 'TEST_UNIT'), 'missing/invalid new currency unit from ledger after minting');
    });

    it('ccy types - should allow funding of newly added currency types', async () => {
        // add new ccy type
        await stm.addCcyType('TEST_COIN2', 'TEST_UNIT');
        const types = (await stm.getCcyTypes()).ccyTypes;
        const newTypeId = types.filter(p => p.name == 'TEST_COIN2')[0].id;

        // fund new ccy type & validate
        await stm.fund(newTypeId, 424242, accounts[global.accountNdx], { from: accounts[0] });
        ledgerEntryAfter = await stm.getLedgerEntry(accounts[global.accountNdx]);
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == newTypeId).balance == 424242, 'unexpected ledger balance of new currency type after funding');
    });

    it('ccy types - should not allow non-owner to add a currency type', async () => {
        try {
            await stm.addCcyType('NEW_TYPE_ID_3', 'test_unit', { from: accounts[1] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('ccy types - should not allow adding an existing currency type name', async () => {
        try {
            await stm.addCcyType('ETH', 'test_unit', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Currency type name already exists', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it('ccy types - should not allow adding a currency type when contract is read only', async () => {
        try {
            await stm.setReadOnly(true, { from: accounts[0] }); 
            await stm.addCcyType('NEW_TYPE_ID_4', 'test_unit', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stm.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stm.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
});