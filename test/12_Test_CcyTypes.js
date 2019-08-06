const ac = artifacts.require('AcMaster');
const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');

contract('AcMaster', accounts => {
    var acm, accountNdx = 1;

    const countDefaultCcyTypes = 2;

    beforeEach(async () => {
        acm = await ac.deployed();
        accountNdx++;
    });

    it('ccy types - should have correct default values', async () => {
        const types = (await acm.getCcyTypes()).ccyTypes;
        assert(types.length == countDefaultCcyTypes, 'unexpected default ccy type count');

        assert(types[0].name == 'USD', 'unexpected default ccy type name 0');
        assert(types[0].unit == 'cents', 'unexpected default ccy type unit 0');
        assert(types[0].id == 0, 'unexpected default ccy type id 0');

        assert(types[1].name == 'ETH', 'unexpected default ccy type name 1');
        assert(types[1].unit == 'Wei', 'unexpected default ccy type unit 1');
        assert(types[1].id == 1, 'unexpected default ccy type id 1');
    });

    it('ccy types - should be able to use newly added EEU types', async () => {
        // mint 1 vEEU 
        await acm.mintEeuBatch(CONST.eeuType.UNFCCC, CONST.ktCarbon * 100, 1, accounts[accountNdx], { from: accounts[0] });

        // add new ccy type
        const addCcyTx = await acm.addCcyType('TEST_COIN', 'TEST_UNIT');
        const types = (await acm.getCcyTypes()).ccyTypes;
        assert(types.filter(p => p.name == 'TEST_COIN')[0].id == countDefaultCcyTypes, 'unexpected/missing new currency type id');
        assert(types.filter(p => p.name == 'TEST_COIN')[0].unit == 'TEST_UNIT', 'unexpected/missing new currency type unit');
        
        truffleAssert.eventEmitted(addCcyTx, 'AddedCcyType', ev => { 
            return ev.id == countDefaultCcyTypes
                && ev.name == 'TEST_COIN'
                && ev.unit == 'TEST_UNIT'
                ;
        });

        // get new type id
        const newTypeId = types.filter(p => p.name == 'TEST_COIN')[0].id;

        // validate ledger entry from minting has the new type
        const ledgerEntryAfter = await acm.getLedgerEntry(accounts[accountNdx]);
        assert(ledgerEntryAfter.ccys.some(p => p.typeId == newTypeId), 'missing new currency type id from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.name == 'TEST_COIN'), 'missing/invalid new currency name from ledger after minting');
        assert(ledgerEntryAfter.ccys.some(p => p.unit == 'TEST_UNIT'), 'missing/invalid new currency unit from ledger after minting');

        // todo: fund/withdraw from ledger with newly added ccy ...
        //...
    });

    it('ccy types - should not allow non-owner to add a currency type', async () => {
        try {
            await acm.addCcyType('NEW_TYPE_ID_3', { from: accounts[1], });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('ccy types - should not allow adding an existing currency type name', async () => {
        try {
            await acm.addCcyType('ETH');
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });
});