// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StMintable.sol => LedgerLib.sol, SpotFeeLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');

const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

contract("StMaster", accounts => {
    var stm;
    var stmStMasterFacet;
    var stmStErc20Facet;
    var stmStMintableFacet;
    var stmCcyCollateralizableFacet;
    var stmStLedgerFacet;
    var stmStFeesFacet;
    var stmStTransferableFacet;
    var stmStBurnableFacet;

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);
        stmStBurnableFacet = await StBurnableFacet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);

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
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[global.TaddrNdx + 0]});
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`minting originator ccy fee - should allow minting with a batch originator currency fee on a batch`, async () => {
        const M = accounts[global.TaddrNdx];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.KT_CARBON, 1, M, CONST.nullFees, 100, [], [], { from: accounts[0] });
        const batchId = await stmStLedgerFacet.getSecTokenBatch_MaxId.call();
        const batch = await stmStLedgerFacet.getSecTokenBatch(batchId);
        assert(batch.originator == M, 'unexpected originator on minted batch');
        assert(batch.origCcyFee_percBips_ExFee == 100, 'unexpected originator currency on minted batch');
    });

    it(`minting originator ccy fee - should allow decreasing of batch currency fee on a batch`, async () => {
        const M = accounts[global.TaddrNdx];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, 100, [], [], { from: accounts[0] });
        const batchId = await stmStLedgerFacet.getSecTokenBatch_MaxId.call();
        await stmStMintableFacet.setOriginatorFeeCurrencyBatch(batchId, 50, { from: accounts[0] });
    });

    it(`minting originator ccy fee - should not allow increasing of batch currency fee after minting`, async () => {
        const M = accounts[global.TaddrNdx];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, 100, [], [], { from: accounts[0] });
        const batchId = await stmStLedgerFacet.getSecTokenBatch_MaxId.call();
        var origFee2;

        try { await stmStMintableFacet.setOriginatorFeeCurrencyBatch(batchId, 101, { from: accounts[0] }); assert.fail('expected contract exception'); }
        catch (ex) { assert(ex.reason == 'Bad fee args', `unexpected: ${ex.reason}`); }
    });

    it(`minting originator ccy fee - should not allow non-owner to edit batch currency fee after minting`, async () => {
        const M = accounts[global.TaddrNdx];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, 100, [], [], { from: accounts[0] });
        const batchId = await stmStLedgerFacet.getSecTokenBatch_MaxId.call();
        try {
            await stmStMintableFacet.setOriginatorFeeCurrencyBatch(batchId, 101, { from: accounts[10] })
        } catch (ex) { assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`); return; }
        assert.fail('expected contract exception');
    });

    it(`minting originator ccy fee - should not allow minting batch currency fee basis points > 10000`, async () => {
        const M = accounts[global.TaddrNdx];
        try {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, 10001, [], [], { from: accounts[0] });
        } catch (ex) { assert(ex.reason == 'Bad fee args', `unexpected: ${ex.reason}`); return; }
        assert.fail('expected contract exception');        
    });
    it(`minting originator ccy fee - should not allow setting of batch currency fee basis points > 10000`, async () => {
        const M = accounts[global.TaddrNdx];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.KT_CARBON, 1, M, CONST.nullFees, 100, [], [], { from: accounts[0] });
        const batchId = await stmStLedgerFacet.getSecTokenBatch_MaxId.call();
        try {
            await stmStMintableFacet.setOriginatorFeeCurrencyBatch(batchId, 10001, { from: accounts[0] });
        } catch (ex) { assert(ex.reason == 'Bad fee args', `unexpected: ${ex.reason}`); return; }
        assert.fail('expected contract exception');        
    });
});
