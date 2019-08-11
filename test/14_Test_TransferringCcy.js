const ac = artifacts.require('AcMaster');
const CONST = require('../const.js');
const helper = require('./transferHelper.js');

contract('AcMaster', accounts => {
    var acm;

    beforeEach(async () => {
        acm = await ac.deployed();

        if (!global.accountNdx) global.accountNdx = 0;
        global.accountNdx += 2;
        console.log(`global.global.accountNdx: ${global.accountNdx} - beforeEach: ${acm.address} - getEeuBatchCount: ${(await acm.getEeuBatchCount.call()).toString()}`);
    });

    it('transferring ccy - should allow one-sided transfer (A -> B) of one currency (USD) across ledger entries', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ acm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],     ledger_B: accounts[global.accountNdx + 1],
                    kg_A: 0,                                eeuTypeId_A: 0,
                    kg_B: 0,                                eeuTypeId_B: 0,
            ccy_amount_A: CONST.thousandUsd_cents / 2,      ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                ccyTypeId_B: 0,
        });
    });
    
    it('transferring ccy - should allow one-sided transfer (B -> A) of one currency (ETH) across ledger entries', async () => {
        await acm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ acm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],     ledger_B: accounts[global.accountNdx + 1],
                    kg_A: 0,                                eeuTypeId_A: 0,
                    kg_B: 0,                                eeuTypeId_B: 0,
            ccy_amount_A: 0,                                ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                 ccyTypeId_B: CONST.ccyType.ETH,
        });
    });

    it('transferring ccy - should allow two-sided transfer (A <-> B) of the same currency across ledger entries', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ acm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],     ledger_B: accounts[global.accountNdx + 1],
                    kg_A: 0,                                eeuTypeId_A: 0,
                    kg_B: 0,                                eeuTypeId_B: 0,
            ccy_amount_A: CONST.thousandUsd_cents / 2,      ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: CONST.thousandUsd_cents / 4,      ccyTypeId_B: CONST.ccyType.USD,
        });
    });

    it('transferring ccy - should allow two-sided transfer (A <-> B) of different currencies across ledger entries', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.billionUsd_cents,        accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.ETH, CONST.millionEth_wei,          accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ acm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],     ledger_B: accounts[global.accountNdx + 1],
                    kg_A: 0,                                eeuTypeId_A: 0,
                    kg_B: 0,                                eeuTypeId_B: 0,
            ccy_amount_A: CONST.billionUsd_cents,           ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: CONST.millionEth_wei,             ccyTypeId_B: CONST.ccyType.ETH,
        });
    });

    // one-sided kg transfer, no consideration, 1 full EEU
    // one-sided kg transfer, no consideration, 1 full + 1 partial EEU (split)
    // one-sided kg transfer, no consideration, n full + 1 partial EEU (split)
    // two-sided kg transfer, kg consideration, x3 as above
    //
    // two-sided mixed transfer (trade): kg for ccy, x3 as above

    it('transferring - should not allow non-owner to transfer across ledger entries', async () => {
        try {
            await acm.transfer(accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 0, 0, 0, 0, { from: accounts[1] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring - should not allow a null transfer', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 0, 0, 0, 0, { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });
    
    it('transferring ccy - should not allow a currency transfer to an unkown ledger entry', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        try {
            await acm.transfer(accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0,
                CONST.thousandUsd_cents,     // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring ccy - should not allow a currency transfer from an unkown ledger entry', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0,
                CONST.thousandUsd_cents,     // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring ccy - should not allow one-sided transfer (A -> B) of an invalid currency value', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring ccy - should not allow one-sided transfer (B -> A) of an invalid currency value', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });    

    it('transferring ccy - should not allow two-sided transfer (A <-> B) of invalid currency values', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });    

    it('transferring ccy - should not allow one-sided transfer (A -> B) of a currency value in excess of the balance', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                CONST.thousandUsd_cents + 1, // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring ccy - should not allow one-sided transfer (B -> A) of a currency value in excess of the balance', async () => {
        await acm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                CONST.thousandEth_wei,       // ccy_amount_B
                CONST.ccyType.ETH,           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });

    it('transferring ccy - should not allow two-sided transfer (A <-> B) of currency values in excess of the balances', async () => {
        await acm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await acm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await acm.transfer(
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 0, 0, 0, 0, 
                CONST.millionUsd_cents,      // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                CONST.thousandEth_wei,       // ccy_amount_B
                CONST.ccyType.ETH,           // ccyTypeId_B
                { from: accounts[0] });
        } catch (ex) { return; }
        assert.fail('expected restriction exception');
    });
});