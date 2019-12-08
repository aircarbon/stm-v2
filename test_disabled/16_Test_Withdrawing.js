const BigNumber = require('big-number');
const st = artifacts.require('StMaster');
const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');

contract("StMaster", accounts => {
    var stm;

    beforeEach(async () => {
        stm = await st.deployed();
        if (!global.accountNdx) global.accountNdx = 0;
        global.accountNdx++;
        if (CONST.logTestAccountUsage)
            console.log(`global.accountNdx: ${global.accountNdx} - contract @ ${stm.address} (owner: ${accounts[0]}) - getSecTokenBatchCount: ${(await stm.getSecTokenBatchCount.call()).toString()}`);
    });

    it('withdrawing - should allow withdrawing of USD', async () => {
        await stm.fund(CONST.ccyType.SGD, CONST.thousandUsd_cents * 2, accounts[global.accountNdx], { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.thousandUsd_cents * 2, withdrawer: accounts[global.accountNdx]});
    });

    it('withdrawing - should allow withdrawing of extreme values of USD', async () => {
        await stm.fund(CONST.ccyType.SGD, CONST.millionUsd_cents * 1000 * 1000, accounts[global.accountNdx], { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.millionUsd_cents * 1000 * 1000, withdrawer: accounts[global.accountNdx] });
    });

    it('withdrawing - should allow withdrawing of ETH', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.oneEth_wei, accounts[global.accountNdx], { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.oneEth_wei, withdrawer: accounts[global.accountNdx] });
    });

    it('withdrawing - should allow withdrawing of extreme values of ETH', async () => {
        await stm.fund(CONST.ccyType.ETH, CONST.millionEth_wei, accounts[global.accountNdx], { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.millionEth_wei, withdrawer: accounts[global.accountNdx] });
    });

    it('withdrawing - should allow repeated withdrawing', async () => {
        await stm.fund(CONST.ccyType.SGD, 3, accounts[global.accountNdx]);
        for (var i=0 ; i < 3 ; i++) {
            await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: 1, withdrawer: accounts[global.accountNdx] });
        }
        const ledger = await stm.getLedgerEntry(accounts[global.accountNdx]);
        assert(ledger.ccys.find(p => p.ccyTypeId == CONST.ccyType.SGD).balance == 0, 'unexpected ledger balance after repeated withdrawing');
    });

    it('withdrawing - should have reasonable gas cost for withdrawing', async () => {
        await stm.fund(CONST.ccyType.SGD, CONST.thousandUsd_cents, accounts[global.accountNdx], { from: accounts[0] });
        const withdrawTx = await stm.withdraw(CONST.ccyType.SGD, CONST.thousandUsd_cents, accounts[global.accountNdx], { from: accounts[0] });
        console.log(`\t>>> gasUsed - Withdrawing: ${withdrawTx.receipt.gasUsed} @${CONST.gasPriceEth} ETH/gas = ${(CONST.gasPriceEth * withdrawTx.receipt.gasUsed).toFixed(4)} (USD ${(CONST.gasPriceEth * withdrawTx.receipt.gasUsed * CONST.ethUsd).toFixed(4)}) ETH TX COST`);
    });

    it('withdrawing - should allow minting, funding and withdrawing on same ledger entry', async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.mtCarbon, 1, accounts[global.accountNdx], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.SGD, CONST.thousandUsd_cents, accounts[global.accountNdx],           { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.thousandUsd_cents / 2, withdrawer: accounts[global.accountNdx] });
        const ledgerEntryAfter = await stm.getLedgerEntry(accounts[global.accountNdx]);

        assert(ledgerEntryAfter.tokens.length == 1, 'unexpected eeu count in ledger entry after minting, funding & withdrawing');
        assert(Number(ledgerEntryAfter.tokens_sumQty) == Number(CONST.mtCarbon), 'invalid kg sum in ledger entry after minting, funding & withdrawing');
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == CONST.ccyType.SGD).balance == CONST.thousandUsd_cents / 2, 'unexpected usd balance in ledger entry after minting, funding & withdrawing');
    });

    async function withdrawLedger({ ccyTypeId, amount, withdrawer }) {
        var ledgerEntryBefore, ledgerEntryAfter;

        ledgerEntryBefore = await stm.getLedgerEntry(withdrawer);
        const totalWithdrawnBefore = await stm.getTotalCcyWithdrawn.call(ccyTypeId);
        
        // withdraw
        const withdrawTx = await stm.withdraw(ccyTypeId, amount, withdrawer, { from: accounts[0] });
        ledgerEntryAfter = await stm.getLedgerEntry(withdrawer);
        truffleAssert.eventEmitted(withdrawTx, 'CcyWithdrewLedger', ev => {
            return ev.ccyTypeId == ccyTypeId
                && ev.ledgerOwner == withdrawer
                && ev.amount.toString() == amount.toString()
                ;
        });

        // validate ledger balance is updated for test ccy
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == ccyTypeId).balance == 
               Number(ledgerEntryBefore.ccys.find(p => p.ccyTypeId == ccyTypeId).balance) - Number(amount),
               'unexpected ledger balance after withdrawing for test ccy');

        // validate ledger balance unchanged for other ccy's
        assert(ledgerEntryAfter.ccys
               .filter(p => p.ccyTypeId != ccyTypeId)
               .every(p => p.balance == ledgerEntryBefore.ccys.find(p2 => p2.ccyTypeId == p.ccyTypeId).balance),
               'unexpected ledger balance after withdrawing for ccy non-test ccy');

        // validate global total funded is updated
        const totalWithdrawnAfter = await stm.getTotalCcyWithdrawn.call(ccyTypeId);
        assert(totalWithdrawnAfter - totalWithdrawnBefore == amount, 'unexpected total withdrawn after withdrawal');
    }

    it('withdrawing - should not allow non-owner to withdrawing from a ledger entry', async () => {
        try {
            await stm.withdraw(CONST.ccyType.SGD, 100, accounts[global.accountNdx], { from: accounts[1] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow non-existent currency types (1)', async () => {
        try {
            await stm.withdraw(9999, 100, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad ccyTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow non-existent currency types (2)', async () => {
        try {
            await stm.withdraw(0, 100, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad ccyTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow invalid amounts (1)', async () => {
        try {
            await stm.withdraw(CONST.ccyType.SGD, 0, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Min. amount 1', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow invalid amounts (2)', async () => {
        try {
            await stm.withdraw(CONST.ccyType.SGD, -1, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Min. amount 1', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow withdrawing beyond available balance', async () => {
        await stm.fund(CONST.ccyType.SGD, 100, accounts[global.accountNdx], { from: accounts[0] });
        try {
            await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: 101, withdrawer: accounts[global.accountNdx]});
        } catch (ex) { 
            assert(ex.reason == 'Insufficient balance', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('withdrawing - should not allow withdrawing when contract is read only', async () => {
        await stm.fund(CONST.ccyType.SGD, 100, accounts[global.accountNdx], { from: accounts[0] });
        try {
            await stm.setReadOnly(true, { from: accounts[0] });
            await withdrawLedger({ ccyTypeId: CONST.ccyType.SGD, amount: 50, withdrawer: accounts[global.accountNdx]});
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stm.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stm.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
});