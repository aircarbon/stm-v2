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
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
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
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`withdrawing - should allow withdrawing of USD`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents * 2, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: CONST.thousandCcy_cents * 2, withdrawer: accounts[global.TaddrNdx]});
    });

    it(`withdrawing - should allow withdrawing of extreme values of USD`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.millionCcy_cents * 1000 * 1000, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: CONST.millionCcy_cents * 1000 * 1000, withdrawer: accounts[global.TaddrNdx] });
    });

    // it(`withdrawing - should allow withdrawing of ETH`, async () => {
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
    //     await withdrawLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.oneEth_wei, withdrawer: accounts[global.TaddrNdx] });
    // });

    // it(`withdrawing - should allow withdrawing of extreme values of ETH`, async () => {
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.millionEth_wei, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
    //     await withdrawLedger({ ccyTypeId: CONST.ccyType.ETH, amount: CONST.millionEth_wei, withdrawer: accounts[global.TaddrNdx] });
    // });

    it(`withdrawing - should allow repeated withdrawing`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, 3, accounts[global.TaddrNdx], 'TEST');
        for (var i=0 ; i < 3 ; i++) {
            await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: 1, withdrawer: accounts[global.TaddrNdx] });
        }
        const ledger = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);
        assert(ledger.ccys.find(p => p.ccyTypeId == CONST.ccyType.USD).balance == 0, 'unexpected ledger balance after repeated withdrawing');
    });

    it(`withdrawing - should allow minting, funding and withdrawing on same ledger entry`, async () => {
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, accounts[global.TaddrNdx], CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, accounts[global.TaddrNdx], 'TEST');
        await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: CONST.thousandCcy_cents / 2, withdrawer: accounts[global.TaddrNdx] });
        const ledgerEntryAfter = await stmStLedgerFacet.getLedgerEntry(accounts[global.TaddrNdx]);

        assert(ledgerEntryAfter.tokens.length == 1, 'unexpected eeu count in ledger entry after minting, funding & withdrawing');
        assert(Number(ledgerEntryAfter.spot_sumQty) == Number(CONST.GT_CARBON), 'invalid kg sum in ledger entry after minting, funding & withdrawing');
        assert(ledgerEntryAfter.ccys.find(p => p.ccyTypeId == CONST.ccyType.USD).balance == CONST.thousandCcy_cents / 2, 'unexpected usd balance in ledger entry after minting, funding & withdrawing');
    });

    async function withdrawLedger({ ccyTypeId, amount, withdrawer }) {
        var ledgerEntryBefore, ledgerEntryAfter;

        ledgerEntryBefore = await stmStLedgerFacet.getLedgerEntry(withdrawer);
        //const totalWithdrawnBefore = await stm.getTotalCcyWithdrawn.call(ccyTypeId);
        
        // withdraw
        const withdrawTx = await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, ccyTypeId, amount, withdrawer, 'TEST', { from: accounts[0] });
        ledgerEntryAfter = await stmStLedgerFacet.getLedgerEntry(withdrawer);
        truffleAssert.eventEmitted(withdrawTx, 'CcyWithdrewLedger', ev => {
            return ev.ccyTypeId == ccyTypeId
                && ev.from == withdrawer
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
        //const totalWithdrawnAfter = await stm.getTotalCcyWithdrawn.call(ccyTypeId);
        //assert(totalWithdrawnAfter - totalWithdrawnBefore == amount, 'unexpected total withdrawn after withdrawal');
    }

    it(`withdrawing - should not allow non-owner to withdrawing from a ledger entry`, async () => {
        try {
            await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, CONST.ccyType.USD, 100, accounts[global.TaddrNdx], 'TEST', { from: accounts[10] });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow non-existent currency types (1)`, async () => {
        try {
            await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, 9999, 100, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad ccyTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow non-existent currency types (2)`, async () => {
        try {
            await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, 0, 100, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad ccyTypeId', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow invalid amounts (1)`, async () => {
        try {
            await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, CONST.ccyType.USD, 0, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad amount', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow invalid amounts (2)`, async () => {
        try {
            await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, CONST.ccyType.USD, -1, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad amount', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow withdrawing beyond available balance`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, 100, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        try {
            await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: 101, withdrawer: accounts[global.TaddrNdx]});
        } catch (ex) { 
            assert(ex.reason == 'Insufficient balance', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`withdrawing - should not allow withdrawing when contract is read only`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, 100, accounts[global.TaddrNdx], 'TEST', { from: accounts[0] });
        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await withdrawLedger({ ccyTypeId: CONST.ccyType.USD, amount: 50, withdrawer: accounts[global.TaddrNdx]});
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
});