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
    
    it('funding - should allow funding of SGD', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of extreme values of USD', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.millionCcy_cents * 1000 * 1000, receiver: accounts[global.accountNdx]});
    });

    it('funding - should allow funding of ETH', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.oneEth_wei, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of extreme values of ETH', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.millionEth_wei, receiver: accounts[global.accountNdx]});
    });

    it('funding - should allow funding of BTC', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.BTC, amount: CONST.oneBtc_sat, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of extreme values of BTC', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.BTC, amount: CONST.millionBtc_sat, receiver: accounts[global.accountNdx]});
    });

    it('funding - should allow funding of USD', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.USD, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of EUR', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.EUR, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of HKD', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.HKD, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
    });
    it('funding - should allow funding of GBP', async () => {
        await fundLedger({ ccyTypeId: CONST.ccyType.GBP, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
    });

    it('funding - should allow repeated funding', async () => {
        for (var i=0 ; i < 10 ; i++) {
            await fundLedger({ ccyTypeId: CONST.ccyType.SGD, amount: CONST.thousandCcy_cents, receiver: accounts[global.accountNdx]});
        }
    });

    it('funding - should have reasonable gas cost for funding', async () => {
        const fundTx = await stm.fund(CONST.ccyType.SGD, CONST.thousandCcy_cents, accounts[global.accountNdx], { from: accounts[0] });
        console.log(`\t>>> gasUsed - Funding: ${fundTx.receipt.gasUsed} @${CONST.gasPriceEth} ETH/gas = ${(CONST.gasPriceEth * fundTx.receipt.gasUsed).toFixed(4)} (USD ${(CONST.gasPriceEth * fundTx.receipt.gasUsed * CONST.ethUsd).toFixed(4)}) ETH TX COST`);
    });

    it('funding - should allow minting and funding on same ledger entry', async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.mtCarbon, 1, accounts[global.accountNdx], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.SGD, CONST.thousandCcy_cents, accounts[global.accountNdx],           { from: accounts[0] });
        const ledgerEntryAfter = await stm.getLedgerEntry(accounts[global.accountNdx]);

        assert(ledgerEntryAfter.tokens.length == 1, 'unexpected eeu count in ledger entry after minting & funding');
        assert(Number(ledgerEntryAfter.tokens_sumQty) == Number(CONST.mtCarbon), 'invalid kg sum in ledger entry after minting & funding');
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == CONST.ccyType.SGD).balance == CONST.thousandCcy_cents, 'unexpected usd balance in ledger entry after minting & funding');
    });

    it('funding - should not allow non-owner to fund a ledger entry', async () => {
        try {
            await stm.fund(CONST.ccyType.SGD, 100, accounts[global.accountNdx], { from: accounts[1] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('funding - should not allow non-existent currency types', async () => {
        try {
            await stm.fund(9999, 100, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad ccyTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('funding - should not allow invalid amounts', async () => {
        try {
            await stm.fund(CONST.ccyType.SGD, -1, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Min. amount 1', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it('funding - should not allow when contract is read only', async () => {
        try {
            await stm.setReadOnly(true, { from: accounts[0] });
            await stm.fund(CONST.ccyType.SGD, 100, accounts[global.accountNdx], { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stm.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stm.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
    
    async function fundLedger({ ccyTypeId, amount, receiver }) {
        var ledgerEntryBefore, ledgerEntryAfter;

        ledgerEntryBefore = await stm.getLedgerEntry(receiver);
        const totalFundedBefore = await stm.getTotalCcyFunded.call(ccyTypeId);
        
        // fund
        const fundTx = await stm.fund(ccyTypeId, amount, receiver, { from: accounts[0] });
        ledgerEntryAfter = await stm.getLedgerEntry(receiver);
        truffleAssert.eventEmitted(fundTx, 'CcyFundedLedger', ev => {
            return ev.ccyTypeId == ccyTypeId
                && ev.ledgerOwner == receiver
                && ev.amount.toString() == amount.toString()
                ;
        });
        
        // validate ledger balance is updated for test ccy
        //console.dir(ledgerEntryBefore);
        //console.dir(ledgerEntryAfter);

        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == ccyTypeId).balance == 
               Number(ledgerEntryBefore.ccys.find(p => p.ccyTypeId == ccyTypeId).balance) + Number(amount),
               'unexpected ledger balance after funding for test ccy');

        // validate ledger balance unchanged for other ccy's
        assert(ledgerEntryAfter.ccys
               .filter(p => p.ccyTypeId != ccyTypeId)
               .every(p => p.balance == ledgerEntryBefore.ccys.find(p2 => p2.ccyTypeId == p.ccyTypeId).balance),
               'unexpected ledger balance after funding for ccy non-test ccy');

        // validate global total funded is updated
        const totalFundedAfter = await stm.getTotalCcyFunded.call(ccyTypeId);
        assert(totalFundedAfter - totalFundedBefore == amount, 'unexpected total funded after funding');
    }

});