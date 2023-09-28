// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StTransferable.sol => TransferLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StMintableFacet = artifacts.require('StMintableFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');
const transferHelper = require('../test/transferHelper.js');
const BN = require('bn.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    let stm;
    let stmStMasterFacet;
    let stmStErc20Facet;
    let stmCcyCollateralizableFacet;
    let stmStLedgerFacet;
    let stmStFeesFacet;
    let stmStTransferableFacet;
    let stmOwnedFacet;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);

        if (await stmStMasterFacet.getContractType() != CONST.contractType.COMMODITY) this.skip();
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
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntityBatch([{id: 1, addr: accounts[global.TaddrNdx + 0]}, {id: 1, addr: accounts[global.TaddrNdx + 1]}]);
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${addr} (owner: ${accounts[0]})`);
    });

    it(`Bilateral Trade - confirm - should fail to request trade from non-owner`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata, { from: accounts[10] });
        } catch (ex) { assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`); return; }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade when contract is read-only`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx,  A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`); 
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return; 
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with user without entity (ledger A)`, async () => {
        const A = accounts[99];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == 'The address is not assigned to any entity', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with user without entity (ledger B)`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[99];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == 'The address is not assigned to any entity', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero address (ledger A)`, async () => {
        const A = CONST.nullAddr;
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: ledger A is zero', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero address (ledger B)`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = CONST.nullAddr;
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: ledger B is zero', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero ccyTypeId`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = 0;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: invalid ccyTypeId', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with invalid ccyTypeId`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = 99;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: invalid ccyTypeId', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero tokenTypeId`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = 0;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: invalid tokenTypeId', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with invalid tokenTypeId`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = 99;
        const ccyQty = 500;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: invalid tokenTypeId', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero tokenQty`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = 0;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == '_bilateralTradeAction: token qty should be a positive number', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - should fail to request trade with zero reference tx`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = 0;
        const metadata = '';
        const referenceTx = '0x';

        try {
            await stmStTransferableFacet.confirmBilateralTrade(0, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);
        } catch (ex) { 
            assert(ex.reason == 'confirmBilateralTrade: invalid referenceTx', `unexpected: ${ex.reason}`); 
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`Bilateral Trade - confirm - successfully emit an event with negative ccyQty`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = -20001;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        const tx = await stmStTransferableFacet.confirmBilateralTrade(1, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);

        truffleAssert.eventEmitted(tx, 'bilateralTradeConfirmed', ev => { 
            return ev.tradeType == 1
                && ev.referenceTx == referenceTx
                && ev.ledger_A == A 
                && ev.ledger_B == B
                && ev.ccyTypeId == ccyTypeId
                && ev.tokenTypeId == tokenTypeId
                && ev.ccyQty == ccyQty
                && ev.tokenQty == tokQty
                && ev.metadata == metadata
        });
    });

    it(`Bilateral Trade - confirm - should successfully emit event with empty metadata`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = CONST.KT_CARBON;
        const metadata = '';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        const tx = await stmStTransferableFacet.confirmBilateralTrade(1, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);

        truffleAssert.eventEmitted(tx, 'bilateralTradeConfirmed', ev => { 
            return ev.tradeType == 1
                && ev.referenceTx == referenceTx
                && ev.ledger_A == A 
                && ev.ledger_B == B
                && ev.ccyTypeId == ccyTypeId
                && ev.tokenTypeId == tokenTypeId
                && ev.ccyQty == ccyQty
                && ev.tokenQty == tokQty
                && ev.metadata == metadata
        });
    });

    it(`Bilateral Trade - confirm - should successfully emit event with non empty metadata`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = CONST.KT_CARBON;
        const metadata = '{ FOB: "China North", Shipping: "5 weeks" }';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        const tx = await stmStTransferableFacet.confirmBilateralTrade(1, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);

        truffleAssert.eventEmitted(tx, 'bilateralTradeConfirmed', ev => { 
            return ev.tradeType == 1
                && ev.referenceTx == referenceTx
                && ev.ledger_A == A 
                && ev.ledger_B == B
                && ev.ccyTypeId == ccyTypeId
                && ev.tokenTypeId == tokenTypeId
                && ev.ccyQty == ccyQty
                && ev.tokenQty == tokQty
                && ev.metadata == metadata
        });
    });

    it(`Bilateral Trade - confirm - should successfully emit event with another trade type`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = CONST.KT_CARBON;
        const metadata = '{ FOB: "China North", Shipping: "5 weeks" }';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        const tx = await stmStTransferableFacet.confirmBilateralTrade(2, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);

        truffleAssert.eventEmitted(tx, 'bilateralTradeConfirmed', ev => { 
            return ev.tradeType == 2
                && ev.referenceTx == referenceTx 
                && ev.ledger_A == A 
                && ev.ledger_B == B
                && ev.ccyTypeId == ccyTypeId
                && ev.tokenTypeId == tokenTypeId
                && ev.ccyQty == ccyQty
                && ev.tokenQty == tokQty
                && ev.metadata == metadata
        });
    });

    it(`Bilateral Trade - confirm - should successfully emit event with another trade type (2)`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        const ccyTypeId = CONST.ccyType.USD;
        const tokenTypeId = CONST.tokenType.TOK_T2;
        const ccyQty = 5;
        const tokQty = CONST.KT_CARBON;
        const metadata = '{ FOB: "China North", Shipping: "5 weeks" }';
        const referenceTx = '0x4a907f4f291acbc730a3dafe37b2a5dbc33c9cbd1df42d7ab5fcbbe6322846d0';

        const tx = await stmStTransferableFacet.confirmBilateralTrade(3, referenceTx, A, B, ccyTypeId, tokenTypeId, ccyQty, tokQty, metadata);

        truffleAssert.eventEmitted(tx, 'bilateralTradeConfirmed', ev => { 
            return ev.tradeType == 3
                && ev.referenceTx == referenceTx
                && ev.ledger_A == A 
                && ev.ledger_B == B
                && ev.ccyTypeId == ccyTypeId
                && ev.tokenTypeId == tokenTypeId
                && ev.ccyQty == ccyQty
                && ev.tokenQty == tokQty
                && ev.metadata == metadata
        });
    });

});