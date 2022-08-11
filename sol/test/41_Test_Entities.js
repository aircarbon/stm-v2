// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Re: StMintable.sol => LedgerLib.sol, SpotFeeLib.sol
const st = artifacts.require('StMaster');
const truffleAssert = require('truffle-assertions');
//const _ = require('lodash');
const Big = require('big.js');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('./testSetupContract.js');

contract("StMaster", accounts => {
    var stm;

    before(async function () {
        stm = await st.deployed();
        if (await stm.getContractType() != CONST.contractType.COMMODITY) this.skip();
        await stm.sealContract();
        await setupHelper.setDefaults({ stm, accounts });
        if (!global.TaddrNdx) global.TaddrNdx = 0;
    });

    it(`should set entity from an owner`, async () => {
        await stm.setEntity(CONST.testAddr1, CONST.testId1);
    });

    it(`should set entity from another owner`, async () => {
        await stm.setEntity(CONST.testAddr2, CONST.testId2, {from: accounts[1]});
    });

    it(`should fail to set entity from a non-owner`, async () => {
        try {
            await stm.setEntity(CONST.testAddr1, CONST.testId3, {from: accounts[10]});
        } catch (ex) { 
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`should get existing entities`, async () => {
        let result = await stm.getEntity(CONST.testAddr1);
        assert(result.toNumber() == CONST.testId1, 'unexpected entity id');
        result = await stm.getEntity(CONST.testAddr2);
        assert(result.toNumber() == CONST.testId2, 'unexpected entity id');
    });

    it(`should get zero as an entity id from a non-existing entity`, async () => {
        let result = await stm.getEntity(CONST.testAddr3);
        assert(result.toNumber() == 0, 'unexpected entity id');
    });

    it(`should fail to set entity with zero address`, async () => {
        try {
            await stm.setEntity(CONST.nullAddr, CONST.testId3);
        } catch (ex) { 
            assert(ex.reason == 'setEntity: wrong entity address', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`should fail to set entity with zero entity id`, async () => {
        try {
            await stm.setEntity(CONST.testAddr3, 0);
        } catch (ex) { 
            assert(ex.reason == 'setEntity: wrong entity id', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`should fail to set entity with an existing entity address`, async () => {
        try {
            await stm.setEntity(CONST.testAddr1, CONST.testId3);
        } catch (ex) { 
            assert(ex.reason == 'setEntity: entity already exists', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });

    it(`should fail to set entity with an existing entity id`, async () => {
        try {
            await stm.setEntity(CONST.testAddr3, CONST.testId1);
        } catch (ex) { 
            assert(ex.reason == 'setEntity: entity id already exists', `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    });
});
