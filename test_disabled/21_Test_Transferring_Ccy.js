const st = artifacts.require('StMaster');
const CONST = require('../const.js');
const helper = require('../test/transferHelper.js');

contract("StMaster", accounts => {
    var stm;

    beforeEach(async () => {
        stm = await st.deployed();
        if (!global.accountNdx) global.accountNdx = 0;
        global.accountNdx += 2;
        if (CONST.logTestAccountUsage)
            console.log(`global.accountNdx: ${global.accountNdx} - contract @ ${stm.address} (owner: ${accounts[0]}) - getSecTokenBatchCount: ${(await stm.getSecTokenBatchCount.call()).toString()}`);
    });

    it('transferring ccy - should allow one-sided transfer (A -> B) of one currency (USD) across ledger entries', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],       ledger_B: accounts[global.accountNdx + 1],
                   qty_A: 0,                                tokenTypeId_A: 0,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: CONST.thousandUsd_cents / 2,        ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
    });

    it('transferring ccy - should allow one-sided transfer (B -> A) of one currency (ETH) across ledger entries', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],       ledger_B: accounts[global.accountNdx + 1],
                   qty_A: 0,                                tokenTypeId_A: 0,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                   ccyTypeId_B: CONST.ccyType.ETH,
        });
    });
    
    it('transferring ccy - should allow two-sided transfer (A <-> B) of the same currency across ledger entries', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],      ledger_B: accounts[global.accountNdx + 1],
                  qty_A: 0,                                tokenTypeId_A: 0,
                  qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: CONST.thousandUsd_cents / 2,       ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: CONST.thousandUsd_cents / 4,       ccyTypeId_B: CONST.ccyType.USD,
        });
    });

    it('transferring ccy - should allow two-sided transfer (A <-> B) of different currencies across ledger entries', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.billionUsd_cents,        accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, CONST.millionEth_wei,          accounts[global.accountNdx + 1], { from: accounts[0] });
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],      ledger_B: accounts[global.accountNdx + 1],
                  qty_A: 0,                                tokenTypeId_A: 0,
                  qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: CONST.billionUsd_cents,            ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: CONST.millionEth_wei,              ccyTypeId_B: CONST.ccyType.ETH,
        });
    });

    it('transferring ccy - should have reasonable gas cost for one-sided currency transfer (A -> B), aka. fund movement', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, 0,                             accounts[global.accountNdx + 1], { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],      ledger_B: accounts[global.accountNdx + 1],
                   qty_A: 0,                               tokenTypeId_A: 0,
                   qty_B: 0,                               tokenTypeId_B: 0,
            ccy_amount_A: CONST.oneEth_wei,                  ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 0,                                 ccyTypeId_B: 0,
        });
        console.log(`\t>>> gasUsed - ccy one-way (A -> B): ${data.transferTx.receipt.gasUsed} @${CONST.gasPriceEth} ETH/gas = ${(CONST.gasPriceEth * data.transferTx.receipt.gasUsed).toFixed(4)} (USD ${(CONST.gasPriceEth * data.transferTx.receipt.gasUsed * CONST.ethUsd).toFixed(4)}) ETH TX COST`);
    });

    it('transferring ccy - should have reasonable gas cost for two-sided currency transfer (A <-> B)', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.accountNdx + 0],       ledger_B: accounts[global.accountNdx + 1],
                   qty_A: 0,                                tokenTypeId_A: 0,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 10000000,                           ccyTypeId_A: CONST.ccyType.ETH,
            ccy_amount_B: 50000000,                           ccyTypeId_B: CONST.ccyType.ETH,
        });
        console.log(`\t>>> gasUsed - ccy two-way (A <-> B): ${data.transferTx.receipt.gasUsed} @${CONST.gasPriceEth} ETH/gas = ${(CONST.gasPriceEth * data.transferTx.receipt.gasUsed).toFixed(4)} (USD ${(CONST.gasPriceEth * data.transferTx.receipt.gasUsed * CONST.ethUsd).toFixed(4)}) ETH TX COST`);
    });

    it('transferring ccy - should not allow one-sided transfer (A -> B) of an invalid currency value', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 0
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) {
            assert(ex.reason == 'Invalid null transfer', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it('transferring ccy - should not allow one-sided transfer (B -> A) of an invalid currency value', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Invalid null transfer', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('transferring ccy - should not allow two-sided transfer (A <-> B) of invalid currency values', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Invalid null transfer', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('transferring ccy - should not allow one-sided transfer (A -> B) of a currency value in excess of the balance', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 
                CONST.thousandUsd_cents + 1, // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient currency held by ledger owner A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('transferring ccy - should not allow one-sided transfer (B -> A) of a currency value in excess of the balance', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                CONST.thousandEth_wei,       // ccy_amount_B
                CONST.ccyType.ETH,           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient currency held by ledger owner B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('transferring ccy - should not allow two-sided transfer (A <-> B) of currency values in excess of the balances', async () => {
        await stm.fund(CONST.ccyType.USD, CONST.thousandUsd_cents,       accounts[global.accountNdx + 0], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.accountNdx + 1], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.accountNdx + 0], accounts[global.accountNdx + 1], 
                0, 0, 0, 0, 
                CONST.millionUsd_cents,      // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                CONST.thousandEth_wei,       // ccy_amount_B
                CONST.ccyType.ETH,           // ccyTypeId_B
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient currency held by ledger owner A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });
});