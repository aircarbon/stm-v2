// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');

const CONST = require('../const.js');
const setupHelper = require('./testSetupContract.js');

contract("DiamondProxy", accounts => {
    let stm;
    let stmStMasterFacet;
    let stmStErc20Facet;
    let stmStMintableFacet;
    let stmCcyCollateralizableFacet;
    let stmStLedgerFacet;
    let stmStFeesFacet;

    let ACCOUNT_1, ACCOUNT_2, ACCOUNT_3;
    let addr1_tok1_qty, addr2_tok1_qty, addr2_tok2_qty, addr3_tok2_qty;
    let addr1_ccy_qty, addr2_ccy_qty, addr3_ccy_qty;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);

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

        await stmStErc20Facet.createEntity({id: CONST.testId2, addr: CONST.testAddr10});

        ACCOUNT_1 = accounts[global.TaddrNdx + 0];
        ACCOUNT_2 = accounts[global.TaddrNdx + 1];
        ACCOUNT_3 = accounts[global.TaddrNdx + 2];

        addr1_tok1_qty = CONST.T1_CARBON * 5;
        addr2_tok1_qty = CONST.T1_CARBON * 4;
        addr2_tok2_qty = CONST.T1_CARBON * 8;
        addr3_tok2_qty =CONST.T1_CARBON * 6;

        addr1_ccy_qty = CONST.hundredCcy_cents * 3;
        addr2_ccy_qty = CONST.hundredCcy_cents;
        addr3_ccy_qty = CONST.hundredCcy_cents * 7;
        
        // setting entities for test accounts
        await stmStErc20Facet.setAccountEntityBatch([
            {id: CONST.testId1, addr: ACCOUNT_1, },
            {id: CONST.testId1, addr: ACCOUNT_2, },
            {id: CONST.testId2, addr: ACCOUNT_3, },
        ]);

        // minting tokens for test accounts
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, addr1_tok1_qty, 1, ACCOUNT_1, CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, addr2_tok1_qty, 1, ACCOUNT_2, CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, addr2_tok2_qty, 1, ACCOUNT_2, CONST.nullFees, 0, [], [], { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, addr3_tok2_qty, 1, ACCOUNT_3, CONST.nullFees, 0, [], [], { from: accounts[0] });

        // funding test accounts
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, addr1_ccy_qty, ACCOUNT_1, 'TEST', { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, addr2_ccy_qty, ACCOUNT_2, 'TEST', { from: accounts[0] });
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, addr3_ccy_qty, ACCOUNT_3, 'TEST', { from: accounts[0] });
    });

    it(`get ledger batch - empty array`, async () => {
        const ledgerEntries = await stmStLedgerFacet.getLedgerEntryBatch([]);
        assert(ledgerEntries.length == 0, 'wrong ledger array length');
    });

    it(`get ledger batch - querying single address`, async () => {
        const ledgerEntries = await stmStLedgerFacet.getLedgerEntryBatch([ACCOUNT_1]);
        assert(ledgerEntries.length == 1, 'wrong ledger array length');

        await testLedger1(ledgerEntries[0]);
    });

    it(`get ledger batch - querying two address (same entity)`, async () => {
        const ledgerEntries = await stmStLedgerFacet.getLedgerEntryBatch([ACCOUNT_1, ACCOUNT_2]);
        assert(ledgerEntries.length == 2, 'wrong ledger array length');

        await testLedger1(ledgerEntries[0]);
        await testLedger2(ledgerEntries[1]);
    });

    it(`get ledger batch - querying two address (different entities)`, async () => {
        const ledgerEntries = await stmStLedgerFacet.getLedgerEntryBatch([ACCOUNT_1, ACCOUNT_3]);
        assert(ledgerEntries.length == 2, 'wrong ledger array length');

        await testLedger1(ledgerEntries[0]);
        await testLedger3(ledgerEntries[1]);
    });

    it(`get ledger batch - querying three address (different entities)`, async () => {
        const ledgerEntries = await stmStLedgerFacet.getLedgerEntryBatch([ACCOUNT_1, ACCOUNT_2, ACCOUNT_3]);
        assert(ledgerEntries.length == 3, 'wrong ledger array length');

        await testLedger1(ledgerEntries[0]);
        await testLedger2(ledgerEntries[1]);
        await testLedger3(ledgerEntries[2]);
    });

    const testLedger1 = async(ledger) => {
        assert(ledger.exists, 'account 1 ledger should be existing');
        assert(ledger.spot_sumQty == addr1_tok1_qty, 'account 1 wrong spot_sumQty');

        // testing tokens
        assert(ledger.tokens.length == 1, 'wrong ledger 1 tokens array length');
        const token1 = ledger.tokens[0];
        assert(token1.exists, 'account 1 token 1 should be existing');
        assert(token1.tokTypeId == CONST.tokenType.TOK_T1, 'account 1 token 1 wrong tokTypeId');
        assert(token1.currentQty == addr1_tok1_qty, 'account 1 token 1 wrong token currentQty');
        
        // testing currency
        const ccy1 = ledger.ccys[0];
        assert(ccy1.ccyTypeId == CONST.ccyType.USD, 'account 1 wrong ccyTypeId');
        assert(ccy1.balance == addr1_ccy_qty, 'account 1 wrong balance');
    }

    const testLedger2 = async(ledger) => {
        assert(ledger.exists, 'account 2 ledger should be existing');
        assert(ledger.spot_sumQty == addr2_tok1_qty + addr2_tok2_qty, 'account 2 wrong spot_sumQty');

        // testing tokens
        assert(ledger.tokens.length == 2, 'wrong ledger 2 tokens array length');
        const token1_address2 = ledger.tokens[0];
        assert(token1_address2.exists, 'accoun 2 token 1 should be existing');
        assert(token1_address2.tokTypeId == CONST.tokenType.TOK_T1, 'accoun 2 token 1 wrong tokTypeId');
        assert(token1_address2.currentQty == addr2_tok1_qty, 'account 2 token 1 wrong token currentQty');

        const token2_address2 = ledger.tokens[1];
        assert(token2_address2.exists, 'accoun 2 token 2 should be existing');
        assert(token2_address2.tokTypeId == CONST.tokenType.TOK_T2, 'accoun 2 token 2 wrong tokTypeId');
        assert(token2_address2.currentQty == addr2_tok2_qty, 'account 2 token 2 wrong token currentQty');

        // testing currency
        const ccy2 = ledger.ccys[0];
        assert(ccy2.ccyTypeId == CONST.ccyType.USD, 'account 2 wrong ccyTypeId');
        assert(ccy2.balance == addr2_ccy_qty, 'account 2 wrong balance');
    }

    const testLedger3 = async(ledger) => {
        assert(ledger.exists, 'account 3 ledger should be existing');
        assert(ledger.spot_sumQty == addr3_tok2_qty, 'account 3 wrong spot_sumQty');

        // testing tokens
        assert(ledger.tokens.length == 1, 'wrong ledger 3 tokens array length');
        const token1 = ledger.tokens[0];
        assert(token1.exists, 'account 3 token 1 should be existing');
        assert(token1.tokTypeId == CONST.tokenType.TOK_T2, 'account 3 token 1 wrong tokTypeId');
        assert(token1.currentQty == addr3_tok2_qty, 'account 3 token 1 wrong token currentQty');
        
        // testing currency
        const ccy1 = ledger.ccys[0];
        assert(ccy1.ccyTypeId == CONST.ccyType.USD, 'account 3 wrong ccyTypeId');
        assert(ccy1.balance == addr3_ccy_qty, 'account 3 wrong balance');
    }
});
