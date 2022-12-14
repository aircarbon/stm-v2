// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StTransferable.sol => TransferLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const CONST = require('../const.js');
const transferHelper = require('../test/transferHelper.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    var stm;
    var stmStMasterFacet;
    var stmStErc20Facet;
    var stmCcyCollateralizableFacet;
    var stmStLedgerFacet;
    var stmStFeesFacet;
    var stmStTransferableFacet;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);

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
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntityBatch([{id: 1, addr: accounts[global.TaddrNdx + 0]}, {id: 1, addr: accounts[global.TaddrNdx + 1]}]);
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`transferring ccy - should allow one-sided transfer (A -> B) of one currency (USD) across ledger entries`, async () => {
        await stmStFeesFacet.setFee_CcyType(1, CONST.ccyType.USD, CONST.nullAddr, CONST.nullFees);

        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                  tokTypeId_A: 0,
                   qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: CONST.thousandCcy_cents / 2,        ccyTypeId_A: CONST.ccyType.USD,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            transferType: CONST.transferType.MINT_FEE,
        });
    });

    it(`transferring ccy - should allow one-sided transfer (B -> A) of one currency (ETH) across ledger entries`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );
        await transferHelper.transferLedger({ stmStLedgerFacet, stmStFeesFacet, stmStTransferableFacet, stmStErc20Facet, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                  tokTypeId_A: 0,
                   qty_B: 0,                                  tokTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: CONST.oneEth_wei,                   ccyTypeId_B: CONST.ccyType.ETH,
            transferType: CONST.transferType.ADJUSTMENT,
        });
    });

    // ccy-swaps - deprecated (to support exchange ccy fee mirroring)
    // it(`transferring ccy - should allow two-sided transfer (A <-> B) of the same currency across ledger entries`, async () => {
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
    //     await transferHelper.transferLedger({ stm, accounts, 
    //             ledger_A: accounts[global.TaddrNdx + 0],        ledger_B: accounts[global.TaddrNdx + 1],
    //                qty_A: 0,                                 tokTypeId_A: 0,
    //                qty_B: 0,                                 tokTypeId_B: 0,
    //         ccy_amount_A: CONST.thousandCcy_cents / 2,       ccyTypeId_A: CONST.ccyType.USD,
    //         ccy_amount_B: CONST.thousandCcy_cents / 4,       ccyTypeId_B: CONST.ccyType.USD,
    //     });
    // });
    // ccy-swaps - deprecated (to support exchange ccy fee mirroring)
    // it(`transferring ccy - should allow two-sided transfer (A <-> B) of different currencies across ledger entries`, async () => {
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.billionCcy_cents,        accounts[global.TaddrNdx + 0], 'TEST', );
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.millionEth_wei,          accounts[global.TaddrNdx + 1], 'TEST', );
    //     await transferHelper.transferLedger({ stm, accounts, 
    //             ledger_A: accounts[global.TaddrNdx + 0],        ledger_B: accounts[global.TaddrNdx + 1],
    //               qty_A: 0,                                  tokTypeId_A: 0,
    //               qty_B: 0,                                  tokTypeId_B: 0,
    //         ccy_amount_A: CONST.billionCcy_cents,            ccyTypeId_A: CONST.ccyType.USD,
    //         ccy_amount_B: CONST.millionEth_wei,              ccyTypeId_B: CONST.ccyType.ETH,
    //     });
    // });

    it(`transferring ccy - should not allow one-sided transfer (A -> B) of an invalid currency value`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
        try {
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
                0, 0, 0, 0, 0
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                false, CONST.nullAddr, CONST.transferType.UNDEFINED, 
                { from: accounts[0] });
        } catch (ex) {
            assert(ex.reason == 'Bad null transfer', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`transferring ccy - should not allow one-sided transfer (B -> A) of an invalid currency value`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
        try {
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
                0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                false, CONST.nullAddr, CONST.transferType.UNDEFINED, 
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad null transfer', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`transferring ccy - should not allow two-sided transfer (A <-> B) of invalid currency values`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
        try {
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
                0, 0, 0, 0, 
                -1,                          // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                -1,                          // ccy_amount_B
                CONST.ccyType.USD,           // ccyTypeId_B
                false, CONST.nullAddr, CONST.transferType.UNDEFINED, 
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad null transfer', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`transferring ccy - should not allow one-sided transfer (A -> B) of a currency value in excess of the balance`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 1], 'TEST', );
        try {
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
                0, 0, 0, 0, 
                CONST.thousandCcy_cents + 1, // ccy_amount_A
                CONST.ccyType.USD,           // ccyTypeId_A
                0,                           // ccy_amount_B
                0,                           // ccyTypeId_B
                false, CONST.nullAddr, CONST.transferType.BURN_FEE, 
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient currency A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`transferring ccy - should not allow one-sided transfer (B -> A) of a currency value in excess of the balance`, async () => {
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.TaddrNdx + 0], 'TEST', );
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );
        try {
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
                0, 0, 0, 0, 
                0,                           // ccy_amount_A
                0,                           // ccyTypeId_A
                CONST.thousandEth_wei,       // ccy_amount_B
                CONST.ccyType.ETH,           // ccyTypeId_B
                false, CONST.nullAddr, CONST.transferType.OTHER_FEE5, 
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient currency B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    // ccy-swaps - deprecated (to support exchange ccy fee mirroring)
    // it(`transferring ccy - should not allow two-sided transfer (A <-> B) of currency values in excess of the balances`, async () => {
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents,       accounts[global.TaddrNdx + 0], 'TEST', );
    //     await stm.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.ETH, CONST.oneEth_wei,              accounts[global.TaddrNdx + 1], 'TEST', );
    //     try {
    //         await transferHelper.transferWrapper(stm, accounts,
    //             accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1], 
    //             0, 0, 0, 0, 
    //             CONST.millionCcy_cents,      // ccy_amount_A
    //             CONST.ccyType.USD,           // ccyTypeId_A
    //             CONST.thousandEth_wei,       // ccy_amount_B
    //             CONST.ccyType.ETH,           // ccyTypeId_B
    //             false, CONST.transferType.UNDEFINED, 
    //             { from: accounts[0] });
    //     } catch (ex) { 
    //         assert(ex.reason == 'Insufficient currency A', `unexpected: ${ex.reason}`);
    //         return;
    //     }
    //     assert.fail('expected contract exception');
    // });
});