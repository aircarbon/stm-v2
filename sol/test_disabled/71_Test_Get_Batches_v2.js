// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');

const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

contract("DiamondProxy", accounts => {
    let stm;
    let stmStMasterFacet;
    let stmStErc20Facet;
    let stmStMintableFacet;
    let stmCcyCollateralizableFacet;
    let stmStLedgerFacet;
    let stmStFeesFacet;

    let ACCOUNT_1, ACCOUNT_2;
    let batch1_qty, batch2_qty, batch3_qty;
    let batch1_meta_keys, batch1_meta_values, batch2_meta_keys, batch2_meta_values, batch3_meta_keys, batch3_meta_values;

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

        batch1_qty = CONST.T1_CARBON * 5;
        batch2_qty = CONST.T1_CARBON * 4;
        batch3_qty = CONST.T1_CARBON * 8;
        
        // setting entities for test accounts
        await stmStErc20Facet.setAccountEntityBatch([
            {id: CONST.testId1, addr: ACCOUNT_1, },
            {id: CONST.testId2, addr: ACCOUNT_2, },
        ]);

        // metadata
        batch1_meta_keys = ["KEY_1"];
        batch1_meta_values = ["VALUE_1"];

        batch2_meta_keys = ["KEY_2.1", "KEY_2.2"];
        batch2_meta_values = ["VALUE_2.1", "VALUE_2.2"];

        batch3_meta_keys = ["KEY_3.1", "KEY_3.2", "KEY_3.3"];
        batch3_meta_values = ["VALUE_3.1", "VALUE_3.2", "VALUE_3.3"];

        // minting tokens for test accounts
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, batch1_qty, 1, ACCOUNT_1, CONST.nullFees, 0, batch1_meta_keys, batch1_meta_values, { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, batch2_qty, 1, ACCOUNT_2, CONST.nullFees, 0, batch2_meta_keys, batch2_meta_values, { from: accounts[0] });
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, batch3_qty, 1, ACCOUNT_2, CONST.nullFees, 0, batch3_meta_keys, batch3_meta_values, { from: accounts[0] });
    });

    it(`get batches - empty array`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([]);
        assert(batches.length == 0, 'wrong batches array length');
    });


    it(`get batches - querying one batch`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([1]);
        assert(batches.length == 1, 'wrong batches array length');

        await testBatch1(batches[0]);
    });

    it(`get batches - querying two batches`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([1, 2]);
        assert(batches.length == 2, 'wrong batches array length');

        await testBatch1(batches[0]);
        await testBatch2(batches[1]);
    });

    it(`get batches - querying three batches`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([3, 1, 2]);
        assert(batches.length == 3, 'wrong batches array length');

        await testBatch3(batches[0]);
        await testBatch1(batches[1]);
        await testBatch2(batches[2]);
    });

    it(`get batches - querying same batches`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([3, 3, 2]);
        assert(batches.length == 3, 'wrong batches array length');

        await testBatch3(batches[0]);
        await testBatch3(batches[1]);
        await testBatch2(batches[2]);
    });

    it(`get batches - querying zero id batches`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([2, 0]);
        assert(batches.length == 2, 'wrong batches array length');

        await testBatch2(batches[0]);
        await testNonExistingBatch(batches[1]);
    });

    it(`get batches - querying non-existing batches`, async () => {
        const batches = await stmStLedgerFacet.getSecTokenBatches([1, 0]);
        assert(batches.length == 2, 'wrong batches array length');

        await testBatch1(batches[0]);
        await testNonExistingBatch(batches[1]);
    });

    const testBatch1 = async(batchData) => {
        assert(batchData.id == 1, 'batch 1 should have id 1');

        assert(batchData.metaKeys.length === 1, 'batch 1 should have 1 metadata key');
        assert(batchData.metaValues.length === 1, 'batch 1 should have 1 metadata values');

        assert(batchData.metaKeys[0] === batch1_meta_keys[0], 'batch 1 wrong first key');
        assert(batchData.metaValues[0] === batch1_meta_values[0], 'batch 1 wrong first value');
    }

    const testBatch2 = async(batchData) => {
        assert(batchData.id == 2, 'batch 2 should have id 2');

        assert(batchData.metaKeys.length === 2, 'batch 2 should have 2 metadata key');
        assert(batchData.metaValues.length === 2, 'batch 2 should have 2 metadata values');

        assert(batchData.metaKeys[0] === batch2_meta_keys[0], 'batch 2 wrong first key');
        assert(batchData.metaValues[0] === batch2_meta_values[0], 'batch 2 wrong first value');

        assert(batchData.metaKeys[1] === batch2_meta_keys[1], 'batch 2 wrong second key');
        assert(batchData.metaValues[1] === batch2_meta_values[1], 'batch 2 wrong second value');
    }

    const testBatch3 = async(batchData) => {
        assert(batchData.id == 3, 'batch 3 should have id 3');

        assert(batchData.metaKeys.length === 3, 'batch 3 should have 3 metadata key');
        assert(batchData.metaValues.length === 3, 'batch 3 should have 3 metadata values');

        assert(batchData.metaKeys[0] === batch3_meta_keys[0], 'batch 3 wrong first key');
        assert(batchData.metaValues[0] === batch3_meta_values[0], 'batch 3 wrong first value');

        assert(batchData.metaKeys[1] === batch3_meta_keys[1], 'batch 3 wrong second key');
        assert(batchData.metaValues[1] === batch3_meta_values[1], 'batch 3 wrong second value');

        assert(batchData.metaKeys[2] === batch3_meta_keys[2], 'batch 3 wrong third key');
        assert(batchData.metaValues[2] === batch3_meta_values[2], 'batch 3 wrong third value');
    }

    const testNonExistingBatch = async(batchData) => {
        assert(batchData.id == 0, 'Non-existing batch should have id 0');
        assert(batchData.metaKeys.length === 0, 'Non-existing batch should have 0 metadata key');
        assert(batchData.metaValues.length === 0, 'Non-existing batch should have 0 metadata values');
    }
});
