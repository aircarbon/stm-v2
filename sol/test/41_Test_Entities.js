// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Re: StMintable.sol => LedgerLib.sol, SpotFeeLib.sol
const st = artifacts.require('DiamondProxy');
const StErc20Facet = artifacts.require('StErc20Facet');
const StMasterFacet = artifacts.require('StMasterFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const BN = require('bn.js');
const CONST = require('../const.js');
const setupHelper = require('./testSetupContract.js');

contract("StMaster", accounts => {
    var stm;

    before(async function () {
        const contract = await st.deployed();

        const addr = contract.address;
        stm = await StErc20Facet.at(addr);
        const stmStMaster = await StMasterFacet.at(addr);
        const stmStLedger = await StLedgerFacet.at(addr);
        const stmCcyCollateralizable = await CcyCollateralizableFacet.at(addr);
        const stmFees = await StFeesFacet.at(addr);

        await stm.whitelistMany([CONST.testAddr1, CONST.testAddr2, CONST.testAddr3, CONST.testAddr4]);
        if (await stmStMaster.getContractType() != CONST.contractType.COMMODITY) this.skip();
        await stmStMaster.sealContract();
        await setupHelper.setDefaults({ StErc20Facet: stm, stmStMaster, stmStLedger, stmCcyCollateralizable, stmFees, accounts });
        if (!global.TaddrNdx) global.TaddrNdx = 0;
    });

    // createEntity()
    it(`should create entity from an owner`, async () => {
        const tx = await stm.createEntity({id: CONST.testId2, addr: CONST.testAddr2});
        const event = CONST.getEvent(tx, 'EntityCreated');
        assert(event.entityId.toNumber() == CONST.testId2, 'Unexpected entity id');
        assert(event.feeOwner == CONST.testAddr2, 'Unexpected fee owner address');
    });

    it(`should create entity with the same fee address owner`, async () => {
        const tx = await stm.createEntity({id: CONST.testId3, addr: CONST.testAddr2});
        const event = CONST.getEvent(tx, 'EntityCreated');
        assert(event.entityId.toNumber() == CONST.testId3, 'Unexpected entity id');
        assert(event.feeOwner == CONST.testAddr2, 'Unexpected fee owner address');
    });

    it(`should be able to create entity with zero fee owner address`, async () => {
        const tx = await stm.createEntity({id: CONST.testId5, addr: CONST.nullAddr});
        const event = CONST.getEvent(tx, 'EntityCreated');
        assert(event.entityId.toNumber() == CONST.testId5, 'Unexpected entity id');
        assert(event.feeOwner == CONST.nullAddr, 'Unexpected fee owner address');
    });

    it(`should fail to create entity with a zero entity id`, async () => {
        await CONST.expectRevert(stm.createEntity, [{id: 0, addr: CONST.testAddr1}], 'createEntity: invalid entity id');
    });

    it(`should fail to create entity with an existing entity id`, async () => {
        await CONST.expectRevert(stm.createEntity, [{id: CONST.testId2, addr: CONST.testAddr1}], 'createEntity: entity already exists');
    });

    it(`should fail to create entity from a non owner`, async () => {
        await CONST.expectRevert(stm.createEntity, [{id: CONST.testId6, addr: CONST.testAddr1}, {from: accounts[10]}], 'Restricted');
    });

    // createEntityBatch()
    // TODO: change later in the smart contract
    it(`Transaction should go through with an empty array`, async () => {
        await stm.createEntityBatch([]);
    });

    it(`should fail to create batch entity with a zero entity id`, async () => {
        await CONST.expectRevert(stm.createEntityBatch, [[{id: CONST.testId6, addr: CONST.testAddr6}, {id: 0, addr: CONST.testAddr7}]], 'createEntity: invalid entity id');
    });

    it(`should fail to create batch entity with already existing entity id`, async () => {
        await CONST.expectRevert(stm.createEntityBatch, [[{id: CONST.testId6, addr: CONST.testAddr6}, {id: CONST.testId1, addr: CONST.testAddr7}]], 'createEntity: entity already exists');
    });

    it(`should fail to create batch entity from a non-owner`, async () => {
        await CONST.expectRevert(
            stm.createEntityBatch, 
            [
                [{id: CONST.testId6, addr: CONST.testAddr6}, {id: CONST.testId7, addr: CONST.testAddr7}],
                {from: accounts[10]}
            ], 'Restricted');
    });

    it(`should be able to create entity batch with from an owner`, async () => {
        const tx = await stm.createEntityBatch([{id: CONST.testId6, addr: CONST.testAddr6}, {id: CONST.testId7, addr: CONST.testAddr7}]);
        const events = CONST.getEvents(tx, 'EntityCreated');

        assert(events.length == 2, 'Unexpected number of events');
        assert(events[0].entityId.toNumber() == CONST.testId6, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr6, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == CONST.testId7, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.testAddr7, 'Unexpected fee owner address');
    });

    it(`should be able to create entity batch with zero address fee owner`, async () => {
        const tx = await stm.createEntityBatch([{id: CONST.testId8, addr: CONST.testAddr8}, {id: CONST.testId9, addr: CONST.nullAddr}]);
        const events = CONST.getEvents(tx, 'EntityCreated');

        assert(events.length == 2, 'Unexpected number of events');
        assert(events[0].entityId.toNumber() == CONST.testId8, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr8, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == CONST.testId9, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.nullAddr, 'Unexpected fee owner address');
    });

    it(`should be able to create entity batch with already used fee owner address`, async () => {
        const tx = await stm.createEntityBatch([{id: CONST.testId10, addr: CONST.testAddr10}, {id: 11, addr: CONST.testAddr1}]);
        const events = CONST.getEvents(tx, 'EntityCreated');

        assert(events.length == 2, 'Unexpected number of events');
        assert(events[0].entityId.toNumber() == CONST.testId10, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr10, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == 11, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.testAddr1, 'Unexpected fee owner address');
    });

    // updateEntity()
    it(`should fail to update entity from a non-owner`, async () => {
        await CONST.expectRevert(stm.updateEntity, [{id: CONST.testId1, addr: CONST.testAddr2}, {from: accounts[10]}], 'Restricted');
    });

    it(`should fail to update non-existing entity`, async () => {
        await CONST.expectRevert(stm.updateEntity, [{id: 12, addr: CONST.testAddr2}], 'updateEntity: entity does not exist');
    });

    it(`should fail to update zero entity`, async () => {
        await CONST.expectRevert(stm.updateEntity, [{id: 0, addr: CONST.testAddr2}], 'updateEntity: entity does not exist');
    });

    it(`should be able to update entity from owner`, async () => {
        const tx = await stm.updateEntity({id: CONST.testId1, addr: CONST.testAddr2});
        const event = CONST.getEvent(tx, 'EntityUpdated');
        assert(event.entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(event.feeOwner == CONST.testAddr2, 'Unexpected fee owner address');
    });

    // TODO: Fix that in the smart contract
    it(`should be able to update entity with the same value`, async () => {
        const tx = await stm.updateEntity({id: CONST.testId1, addr: CONST.testAddr2});
        const event = CONST.getEvent(tx, 'EntityUpdated');
        assert(event.entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(event.feeOwner == CONST.testAddr2, 'Unexpected fee owner address');
    });

    it(`should be able to update entity more than once`, async () => {
        const tx = await stm.updateEntity({id: CONST.testId1, addr: CONST.testAddr3});
        const event = CONST.getEvent(tx, 'EntityUpdated');
        assert(event.entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(event.feeOwner == CONST.testAddr3, 'Unexpected fee owner address');
    });

    it(`should be able to update entity with zero address fee owner address`, async () => {
        const tx = await stm.updateEntity({id: CONST.testId1, addr: CONST.nullAddr});
        const event = CONST.getEvent(tx, 'EntityUpdated');
        assert(event.entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(event.feeOwner == CONST.nullAddr, 'Unexpected fee owner address');
    });

    // updateEntityBatch()
    it(`should fail to batch update entity from a non-owner`, async () => {
        await CONST.expectRevert(
            stm.updateEntityBatch, 
            [[{id: CONST.testId1, addr: CONST.testAddr8}, {id: CONST.testId2, addr: CONST.testAddr9}], {from: accounts[10]}], 
            'Restricted'
        );
    });

    it(`should fail to batch update entity for a non-existing entity`, async () => {
        await CONST.expectRevert(
            stm.updateEntityBatch, 
            [[{id: CONST.testId1, addr: CONST.testAddr8}, {id: 12, addr: CONST.testAddr9}]], 
            'updateEntity: entity does not exist'
        );
    });

    it(`should fail to batch update entity for a zero entity`, async () => {
        await CONST.expectRevert(
            stm.updateEntityBatch, 
            [[{id: CONST.testId1, addr: CONST.testAddr8}, {id: 0, addr: CONST.testAddr9}]], 
            'updateEntity: entity does not exist'
        );
    });

    // TODO: fix this in smart contract
    it(`transaction should go through for batch updating entity with empty array`, async () => {
        await stm.updateEntityBatch([]);
    });

    it(`should be able to update entity batch`, async () => {
        const tx = await stm.updateEntityBatch([{id: CONST.testId1, addr: CONST.testAddr5}, {id: CONST.testId2, addr: CONST.testAddr6}]);
        const events = CONST.getEvents(tx, 'EntityUpdated');

        assert(events.length == 2, 'Unexpected number of EntityUpdated events');
        assert(events[0].entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr5, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == CONST.testId2, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.testAddr6, 'Unexpected fee owner address');
    });

    it(`should be able to update entity batch with the same values`, async () => {
        const tx = await stm.updateEntityBatch([{id: CONST.testId1, addr: CONST.testAddr5}, {id: CONST.testId2, addr: CONST.testAddr6}]);
        const events = CONST.getEvents(tx, 'EntityUpdated');

        assert(events.length == 2, 'Unexpected number of EntityUpdated events');
        assert(events[0].entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr5, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == CONST.testId2, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.testAddr6, 'Unexpected fee owner address');
    });

    it(`should be able to update entity batch with a zero fee owner address`, async () => {
        const tx = await stm.updateEntityBatch([{id: CONST.testId1, addr: CONST.testAddr7}, {id: CONST.testId2, addr: CONST.nullAddr}]);
        const events = CONST.getEvents(tx, 'EntityUpdated');

        assert(events.length == 2, 'Unexpected number of EntityUpdated events');
        assert(events[0].entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(events[0].feeOwner == CONST.testAddr7, 'Unexpected fee owner address');
        assert(events[1].entityId.toNumber() == CONST.testId2, 'Unexpected entity id');
        assert(events[1].feeOwner == CONST.nullAddr, 'Unexpected fee owner address');
    });
});
