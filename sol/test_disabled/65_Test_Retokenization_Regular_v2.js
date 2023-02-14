// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StBurnable.sol => TokenLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const truffleAssert = require('truffle-assertions');
const Big = require('big.js');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

const corsia_ExampleKvps = [
    // e.g. UN_CER = old unfccc
    { k: 'REGISTRY_TYPE',         v: 'UN_CER' },
    { k: 'PROJECT_ID',            v: '0008' }, // int
    { k: 'URL_PROJECT',           v: 'https://cdm.unfccc.int/Projects/DB/DNV-CUK1095236970.6/view' }, // url
    { k: 'URL_ISSUANCE',          v: 'https://cdm.unfccc.int/Projects/DB/DNV-CUK1095236970.6/CP/S7AT4T5YDHX1RNDGO6ZOZO6SDNY485/iProcess/RWTUV1346049921.05/view' }, // url
    { k: 'ISSUANCE_SERIAL_RANGE', v: 'BR-5-85316059-1-1-0-8 - BR-5-85448545-1-1-0-8' }, // freetext
];

const nature_ExampleKvps = [
    { k: 'REGISTRY_TYPE',         v: '***' },
    { k: 'PROJECT_ID',            v: '...' },
    { k: 'URL_PROJECT',           v: '...' },
    { k: 'URL_ISSUANCE',          v: '...' },
    { k: 'ISSUANCE_SERIAL_RANGE', v: '...' }
];

contract("DiamondProxy", accounts => {
    var stm;
    var stmStMasterFacet;
    var stmStErc20Facet;
    var stmStMintableFacet;
    var stmCcyCollateralizableFacet;
    var stmStLedgerFacet;
    var stmStFeesFacet;
    var stmStBurnableFacet;
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
        stmStBurnableFacet = await StBurnableFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);

        if (await stmStMasterFacet.getContractType() != CONST.contractType.COMMODITY) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;

        await stmStErc20Facet.whitelistMany(accounts.slice(global.TaddrNdx, global.TaddrNdx + 151));
        await stmStMasterFacet.sealContract();
        
        await setupHelper.setDefaults({ 
            StErc20Facet: stmStErc20Facet, 
            stmStMaster: stmStMasterFacet, 
            stmStLedger: stmStLedgerFacet, 
            stmCcyCollateralizable: stmCcyCollateralizableFacet, 
            stmFees: stmStFeesFacet,
            accounts });

        await stmStErc20Facet.createEntity({id: 2, addr: CONST.testAddr99});
        await stmStErc20Facet.createEntity({id: 3, addr: CONST.testAddr99});
        await stmStErc20Facet.createEntity({id: 4, addr: CONST.testAddr99});
        await stmStErc20Facet.setAccountEntity({id: 1, addr: accounts[0]});
        await stmStErc20Facet.setAccountEntity({id: 2, addr: accounts[1]});
        await stmStErc20Facet.setAccountEntity({id: 3, addr: accounts[2]});
        await stmStErc20Facet.setAccountEntity({id: 4, addr: accounts[3]});
    });

    beforeEach(async () => {
        global.TaddrNdx += 5;
        await stmStErc20Facet.setAccountEntityBatch(
            [
                {id: 1, addr: accounts[global.TaddrNdx]}, 
                {id: 1, addr: accounts[global.TaddrNdx + 1]},
                {id: 1, addr: accounts[global.TaddrNdx + 2]},
                {id: 1, addr: accounts[global.TaddrNdx + 3]},
                {id: 1, addr: accounts[global.TaddrNdx + 4]},
            ]
        );
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`retokenize - should not allow retokanizing when contract is read only`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: accounts[0],
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmOwnedFacet.setReadOnly(true, { from: accounts[0] });
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 1, { from: accounts[0], });
        } catch (ex) { 
            assert(ex.reason == 'Read-only', `unexpected: ${ex.reason}`);
            await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });
    
    it(`retokenize - should not allow retokanizing from a non-owner`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: accounts[0],
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 1, { from: accounts[100], });
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with an owner without entity`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: accounts[global.TaddrNdx + 10],
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'The address is not assigned to any entity', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with an owner that is not whitelisted`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: CONST.tokenType.TOK_T1,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: CONST.testAddr1,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'The address is not assigned to any entity', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with zero token type id`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], 0, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: invalid token type id', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with first multiplier being zero`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 0, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: wrong multiplication coefficients', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with second multiplier being zero`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 0);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: wrong multiplication coefficients', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with both multiplier being zero`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 0, 0);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: wrong multiplication coefficients', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with multiplier being larger than divider`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 2, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: wrong multiplication coefficients', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with mint quantity not being zero`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 10,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: mint qty should be 0', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with empty ledger array`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: empty ledger array', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with ledger array with duplicates (1)`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B, A], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: ledgers array has duplicates', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should not allow retokanizing with ledger array with duplicates (2)`, async () => {
        const A = accounts[global.TaddrNdx];
        const B = accounts[global.TaddrNdx + 1];
        
        try {
            const args = {
                tokTypeId: 0,
                mintQty: 0,
                mintSecTokenCount: 2,
                batchOwner: A,
                origTokFee: CONST.nullFees,
                origCcyFee_percBips_ExFee: 0,
                metaKeys: [],
                metaValues: []
            }
            await stmStLedgerFacet.retokenizeSecToken(args, [A, B, B], CONST.tokenType.TOK_T1, 1, 1);
        } catch (ex) { 
            assert(ex.reason == 'retokenizeSecToken: ledgers array has duplicates', `unexpected: ${ex.reason}`);
            return;
        }
        await stmOwnedFacet.setReadOnly(false, { from: accounts[0] });
        assert.fail('expected contract exception');
    });

    it(`retokenize - should retokenize`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
        });
    });

    it(`retokenize - should retokenize same token type`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T1,
            batchOwner: accounts[0],
        });
    });

    it(`retokenize - should retokenize half of all tokens`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
            mult: 1,
            multDiv: 2,
        });
    });

    it(`retokenize - should retokenize 3/7 of all tokens`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
            mult: 3,
            multDiv: 7,
        });
    });

    it(`retokenize - should retokenize tokens when one of the ledgers is an owner`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: A,
            mult: 1,
            multDiv: 2,
        });
    });

    it(`retokenize - should retokenize in multiple transactions`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[global.TaddrNdx + 3], accounts[global.TaddrNdx + 4]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers: [A, B],
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
            mult: 1,
            multDiv: 2,
        });

        await validateRetokanizationOutcome({
            ledgers: [C],
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
            mult: 1,
            multDiv: 2,
        });

        await validateRetokanizationOutcome({
            ledgers: [D, E],
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[0],
            mult: 1,
            multDiv: 2,
        });
    });

    it(`retokenize - should retokenize tokens for accounts in different entities`, async () => {
        const [A, B, C, D, E] = [accounts[global.TaddrNdx], accounts[global.TaddrNdx + 1], accounts[global.TaddrNdx + 2], accounts[2], accounts[3]];
        const ledgers = [A, B, C, D, E];

        for(let i = 0; i < ledgers.length; i++) {
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T1, CONST.GT_CARBON * (i + 1), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
            await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON * (i + 2), 1, ledgers[i], CONST.nullFees, 0, [], [], { from: accounts[0], });
        }

        await validateRetokanizationOutcome({
            ledgers,
            burnTokTypeId: CONST.tokenType.TOK_T1,
            mintTokTypeId: CONST.tokenType.TOK_T2,
            batchOwner: accounts[1],
            mult: 1,
            multDiv: 2,
        });
    });


    const validateRetokanizationOutcome = async({
        ledgers = [], 
        burnTokTypeId, 
        mult = 1, 
        multDiv = 1, 
        metaKeys = [], 
        metaValues = [], 
        batchOwner, 
        mintTokTypeId, 
        mintQty = 0, 
        mintSecTokenCount = 1, 
        origTokFee = CONST.nullFees, 
        origCcyFee_percBips_ExFee = 0
    }) => {
        const mintParams = {
            metaKeys,
            metaValues,
            mintQty,
            mintSecTokenCount,
            origTokFee,
            origCcyFee_percBips_ExFee,
            batchOwner,
            tokTypeId: mintTokTypeId
        }
        
        // fetching data before the retokenization
        const allStTokensBefore = await getAllTokens();

        const ledgersBefore = {};
        const toBeBurnedPerAcc = {};
        let totalBurnedQty = 0;

        let totalMinted = 0;
        let ownerIsAmongLedgers = false;
        
        for(let i = 0; i < ledgers.length; i++) {
            const currLedger = ledgers[i];

            // recording ledger before retokenization
            const currLedgBef = await stmStLedgerFacet.getLedgerEntry(currLedger);
            ledgersBefore[currLedger] = currLedgBef;

            // calculating how much tokens to be burned per ledger
            let totalTok = 0;
            for(let tok of currLedgBef.tokens) {
                if(tok.tokTypeId == burnTokTypeId) {
                    totalTok += Number(tok.currentQty);
                }
            }
            toBeBurnedPerAcc[currLedger] = Math.floor(Math.floor(totalTok * mult) / multDiv);
            totalBurnedQty += toBeBurnedPerAcc[currLedger];
        }

        totalMinted = totalBurnedQty; // because now in retokenization we mint as much as we burn

        // recording ledger of the minted tokens if it is not recorded yet
        if(ledgersBefore[mintParams.batchOwner] === undefined) {
            ledgersBefore[mintParams.batchOwner] = await stmStLedgerFacet.getLedgerEntry(mintParams.batchOwner);
        } else {
            ownerIsAmongLedgers = true;
        }

        const burnedTokQtyBefore = await stmStBurnableFacet.getSecToken_totalBurnedQty();
        const mintedTokQtyBefore = await stmStMintableFacet.getSecToken_totalMintedQty();
        
        // retokenization
        const tx = await stmStLedgerFacet.retokenizeSecToken(mintParams, ledgers, burnTokTypeId, mult, multDiv);

        // validate that burn and mint events were not emmited
        truffleAssert.eventNotEmitted(tx, 'BurnedPartialSecToken');
        truffleAssert.eventNotEmitted(tx, 'BurnedFullSecToken');
        truffleAssert.eventNotEmitted(tx, 'Minted');
        truffleAssert.eventNotEmitted(tx, 'MintedSecToken');

        // validate that the retokenization event was emitted
        for(let i = 0; i < ledgers.length; i++) {
            truffleAssert.eventEmitted(
                tx, 
                'RetokenizationBurningToken', 
                ev => (ev.owner == ledgers[i] && ev.tokenTypeId == burnTokTypeId && ev.burnQty == toBeBurnedPerAcc[ledgers[i]] && ev.k_stIds.length === 0)
            ); 
        }
        
        // validate that minting event was emitted
        // const maxId = (await stmStLedgerFacet.getSecToken_MaxId()).toNumber();
        // need to manually calculate batch max id because of the transfers that happen
        truffleAssert.eventEmitted(tx, 'RetokenizationMintingToken', ev => ev.owner == mintParams.batchOwner && ev.tokenTypeId == mintTokTypeId && ev.qty == totalMinted);
        // truffleAssert.eventEmitted(tx, 'RetokenizationMintingToken', ev => ev.owner == mintParams.batchOwner && ev.tokenTypeId == burnTokTypeId && ev.batchId == maxId && ev.qty == totalMinted);

        //validate transfer events
        const eventsData = {}

        truffleAssert.eventEmitted(tx, 'TransferedFullSecToken', ev => {
            if(eventsData[ev.to]) {
                eventsData[ev.to] += Number(ev.qty.toString());
            } else {
                eventsData[ev.to] = Number(ev.qty.toString());
            }
            
            return ev.from == mintParams.batchOwner && ev.transferType.toString() == CONST.transferType.RELATED_TRANSFER;
        });

        try {
            truffleAssert.eventEmitted(tx, 'TransferedPartialSecToken', ev => {
                if(eventsData[ev.to]) {
                    eventsData[ev.to] += Number(ev.qty.toString());
                } else {
                    eventsData[ev.to] = Number(ev.qty.toString());
                }

                return ev.from == mintParams.batchOwner && ev.transferType.toString() == CONST.transferType.RELATED_TRANSFER;
            });
        } catch(err) {
            if(!err.toString().includes('AssertionError: Event of type TransferedPartialSecToken was not emitted')) {
                throw err;
            }
        }
        

        for(let addr of ledgers) {
            if(addr != batchOwner) {
                assert(eventsData[addr], 'no transfer event was found for one of the destination addresses');
                assert(eventsData[addr] = toBeBurnedPerAcc[addr], 'no transfer event was found for one of the destination addresses');
            }
        }

        // check global total burned
        const burnedTokQtyAfter = await stmStBurnableFacet.getSecToken_totalBurnedQty.call();
        assert(burnedTokQtyAfter.toNumber() == burnedTokQtyBefore.toNumber() + totalBurnedQty,'unexpected total burned TONS');

        // check global total minted
        const mintedTokQtyAfter = await stmStMintableFacet.getSecToken_totalMintedQty.call();
        assert(mintedTokQtyAfter.toNumber() == mintedTokQtyBefore.toNumber() + totalMinted,'unexpected total minted TONS');

        // check ledger
        for(let i = 0; i < Object.keys(ledgersBefore).length; i++) {
            const currAddr = Object.keys(ledgersBefore)[i];
            const ledgerAfter = await stmStLedgerFacet.getLedgerEntry(currAddr);
            const ledgerBefore = ledgersBefore[currAddr];

            assert(Number(ledgerAfter.spot_sumQty) == Number(ledgerBefore.spot_sumQty), 'unexpected ledger TONS after burn');

            if(currAddr === batchOwner) {
                assert(Number(ledgerAfter.spot_sumQtyMinted) == Number(ledgerBefore.spot_sumQtyMinted) + totalMinted, 'unexpected spot_sumQtyMinted before vs after for receiver');

                if(ownerIsAmongLedgers) {
                    assert(Number(ledgerAfter.spot_sumQtyBurned) == Number(ledgerBefore.spot_sumQtyBurned) + toBeBurnedPerAcc[currAddr], 'unexpected spot_sumQtyBurned before vs after');
                } else {
                    assert(Number(ledgerAfter.spot_sumQtyBurned) == Number(ledgerBefore.spot_sumQtyBurned), 'unexpected spot_sumQtyBurned before vs after');
                }
            } else {
                assert(Number(ledgerAfter.spot_sumQtyMinted) == Number(ledgerBefore.spot_sumQtyMinted), 'unexpected spot_sumQtyMinted before vs after');
                assert(Number(ledgerAfter.spot_sumQtyBurned) == Number(ledgerBefore.spot_sumQtyBurned) + toBeBurnedPerAcc[currAddr], 'unexpected spot_sumQtyBurned before vs after');
            }
        }

        // check token types
        const allStTokensAfter = await getAllTokens();

        const allTokens = await stmStLedgerFacet.getSecTokenTypes();

        for(let token of allTokens.tokenTypes) {
            const currTokTypeId = token.id;
            const totalMintQtyBefore = allStTokensBefore.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.mintedQty), 0);
            const totalMintQtyAfter = allStTokensAfter.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.mintedQty), 0);
            const totalCurrentQtyBefore = allStTokensBefore.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.currentQty), 0);
            const totalCurrentQtyAfter = allStTokensAfter.filter(t => t.tokTypeId == currTokTypeId).reduce((x, y) => x + Number(y.currentQty), 0);

            if(currTokTypeId == burnTokTypeId && currTokTypeId == mintTokTypeId) {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore), 'unexpected remaining cuurrent TONS in ST after burn');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore) + totalMinted, 'unexpected remaining minted TONS in ST after burn');
            } else if(currTokTypeId == burnTokTypeId) {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore) - totalBurnedQty, 'unexpected remaining cuurrent TONS in ST after burn');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore), 'unexpected remaining minted TONS in ST after burn');
            } else if(currTokTypeId == mintTokTypeId) {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore) + totalMinted, 'unexpected remaining cuurrent TONS in ST after burn');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore) + totalMinted, 'unexpected remaining minted TONS in ST after burn');
            } else {
                assert(Number(totalCurrentQtyAfter) == Number(totalCurrentQtyBefore), 'unexpected remaining cuurrent TONS in ST after burn');
                assert(Number(totalMintQtyAfter) == Number(totalMintQtyBefore), 'unexpected remaining minted TONS in ST after burn');
            }
        }
    }

    const getAllTokens = async() => {
        const maxStId = await stmStLedgerFacet.getSecToken_MaxId();
        const allStTokens = [];
        for(let i = 1; i <= maxStId; i++) {
            allStTokens.push(await stmStLedgerFacet.getSecToken(i));
        }

        return allStTokens;
    }
});
