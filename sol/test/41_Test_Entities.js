// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Re: StMintable.sol => LedgerLib.sol, SpotFeeLib.sol
const st = artifacts.require('StMaster');
const dst = artifacts.require('dcStMaster');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('./testSetupContract.js');

contract("StMaster", accounts => {
    var stm;

    before(async function () {
        stm = await st.deployed();
        await stm.whitelistMany([CONST.testAddr1, CONST.testAddr2, CONST.testAddr3, CONST.testAddr4]);
        if (await stm.getContractType() != CONST.contractType.COMMODITY) this.skip();
        await stm.sealContract();
        await setupHelper.setDefaults({ stm, accounts });
        if (!global.TaddrNdx) global.TaddrNdx = 0;
    });

    // setEntityBatch()
    it(`should set entity from an owner`, async () => {
        await stm.setEntityBatch([CONST.testAddr1, CONST.testAddr4], [CONST.testId1, CONST.testId1]);
    });

    it(`should set entity from another owner`, async () => {
        await stm.setEntityBatch([CONST.testAddr2], [CONST.testId2], {from: accounts[1]});
    });

    it(`should fail to set entity from a non-owner`, async () => {
        await CONST.expectRevert(stm.setEntity, [CONST.testAddr1, CONST.testId3, {from: accounts[10]}], 'Restricted');
    });

    it(`should fail to set entity with zero address`, async () => {
        await CONST.expectRevert(stm.setEntity, [CONST.nullAddr, CONST.testId3], 'setEntity: invalid entity address');
    });

    it(`should fail to set entity with zero entity id`, async () => {
        await CONST.expectRevert(stm.setEntity, [CONST.testAddr3, 0], 'setEntity: invalid entity id');
    });

    it(`should fail to set entity twice`, async () => {
        await CONST.expectRevert(stm.setEntity, [CONST.testAddr1, CONST.testId3], 'setEntity: address already assigned to an entity');
    });

    it(`should fail to set entity that is not white listed`, async () => {
        await CONST.expectRevert(stm.setEntity, [CONST.testAddr5, CONST.testId1], 'setEntity: address is not white listed');
    });

    // getEntity()
    it(`should get existing entities`, async () => {
        let result = await stm.getEntity(CONST.testAddr1);
        assert(result.toNumber() == CONST.testId1, 'unexpected entity id');
        result = await stm.getEntity(CONST.testAddr4);
        assert(result.toNumber() == CONST.testId1, 'unexpected entity id');
        result = await stm.getEntity(CONST.testAddr2);
        assert(result.toNumber() == CONST.testId2, 'unexpected entity id');
    });

    it(`should get zero as an entity id from a non-assigned address`, async () => {
        let result = await stm.getEntity(CONST.testAddr3);
        assert(result.toNumber() == 0, 'unexpected entity id');
    });

    it(`should fail to get entity id when passing zero address`, async () => {
        await CONST.expectRevertFromCall(stm.getEntity, [CONST.nullAddr], 'getEntity: invalid address');
    });

    // getEntityAddresses()
    it(`should get correct array of addresses for existing entities`, async () => {
        let result = await stm.getEntityAddresses(CONST.testId1);
        assert(result.length == 2, 'unexpected array length');
        assert(result[0] == CONST.testAddr1, 'unexpected adress');
        assert(result[1] == CONST.testAddr4, 'unexpected adress');

        result = await stm.getEntityAddresses(CONST.testId2);
        assert(result.length == 1, 'unexpected array length');
        assert(result[0] == CONST.testAddr2, 'unexpected adress');
    });

    it(`should get empty array of addresses for non-existing entity`, async () => {
        const result = await stm.getEntityAddresses(CONST.testId3);
        assert(result.length == 0, 'unexpected array length');
    });

    it(`should fail to get entity addresses when passing wrong entity id`, async () => {
        await CONST.expectRevertFromCall(stm.getEntityAddresses, [0], 'getEntityAddresses: wrong entity id');
    });

    // it(`temp tests`, async () => {
    //     console.log('-----');
    //     const stm2 = await dst.at(stm.address);
    //     console.log(await stm2.test1());
    //     await stm2.test2("abcdefg");
    //     console.log(await stm2.test1());
    // });
});
