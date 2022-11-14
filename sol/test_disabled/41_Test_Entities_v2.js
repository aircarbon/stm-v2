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
const setupHelper = require('../test/testSetupContract.js');

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
    it(`Transaction should fail with an empty array`, async () => {
        await CONST.expectRevert(stm.createEntityBatch, [[]], 'createEntityBatch: empty args array passed');
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

    it(`should fail to update entity with the same value`, async () => {
        await CONST.expectRevert(stm.updateEntity, [{id: CONST.testId1, addr: CONST.testAddr2}], 'updateEntity: trying to update with the same value');
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

    it(`transaction should fail for batch updating entity with empty array`, async () => {
        await CONST.expectRevert(stm.updateEntityBatch, [[]], 'updateEntityBatch: empty args array passed');
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

    it(`should fail to update entity batch with the same values`, async () => {
        await CONST.expectRevert(stm.updateEntityBatch, [[{id: CONST.testId1, addr: CONST.testAddr5}, {id: CONST.testId2, addr: CONST.testAddr6}]], 'updateEntity: trying to update with the same value');
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

    // entityExists()
    it(`should be able to check if an existing entity exists`, async () => {
        assert(await stm.entityExists(CONST.testId2) === true, 'Unexpected entityExists() result');
    });

    it(`should be able to check if a non-existing entity exists`, async () => {
        assert(await stm.entityExists(999) === false, 'Unexpected entityExists() result');
    });

    it(`should be able to check if a zero id entity exists`, async () => {
        assert(await stm.entityExists(0) === false, 'Unexpected entityExists() result');
    });

    // getAllEntities()
    it(`should be able to get the list of all entities`, async () => {
        const allEntities = (await stm.getAllEntities()).map(u => u.toString());
        assert(allEntities[0] == '1', 'Unexpected entity id of existing entities');
        assert(allEntities[1] == '2', 'Unexpected entity id of existing entities');
        assert(allEntities[2] == '3', 'Unexpected entity id of existing entities');
        assert(allEntities[3] == '5', 'Unexpected entity id of existing entities');
        assert(allEntities[4] == '6', 'Unexpected entity id of existing entities');
        assert(allEntities[5] == '7', 'Unexpected entity id of existing entities');
        assert(allEntities[6] == '8', 'Unexpected entity id of existing entities');
        assert(allEntities[7] == '9', 'Unexpected entity id of existing entities');
        assert(allEntities[8] == '10', 'Unexpected entity id of existing entities');
        assert(allEntities[9] == '11', 'Unexpected entity id of existing entities');
    });

    it(`list of entities should be updated after new entity is created`, async () => {
        await stm.createEntity({id: 666, addr: CONST.testAddr2});
        const allEntities = (await stm.getAllEntities()).map(u => u.toString());
        assert(allEntities[0] == '1', 'Unexpected entity id of existing entities');
        assert(allEntities[1] == '2', 'Unexpected entity id of existing entities');
        assert(allEntities[2] == '3', 'Unexpected entity id of existing entities');
        assert(allEntities[3] == '5', 'Unexpected entity id of existing entities');
        assert(allEntities[4] == '6', 'Unexpected entity id of existing entities');
        assert(allEntities[5] == '7', 'Unexpected entity id of existing entities');
        assert(allEntities[6] == '8', 'Unexpected entity id of existing entities');
        assert(allEntities[7] == '9', 'Unexpected entity id of existing entities');
        assert(allEntities[8] == '10', 'Unexpected entity id of existing entities');
        assert(allEntities[9] == '11', 'Unexpected entity id of existing entities');
        assert(allEntities[10] == '666', 'Unexpected entity id of existing entities');
    });

    // getEntityFeeOwner()
    it(`should fail to get fee owner of zero entity id`, async () => {
        await CONST.expectRevertFromCall(stm.getEntityFeeOwner, [0], 'getEntityFeeOwner: entity does not exist');
    });

    it(`should fail to get fee owner of non-existing entity`, async () => {
        await CONST.expectRevertFromCall(stm.getEntityFeeOwner, [999], 'getEntityFeeOwner: entity does not exist');
    });

    it(`should successfully get entity fee owner`, async () => {
        assert((await stm.getEntityFeeOwner(CONST.testId1)) == CONST.testAddr7, 'unexpected fee owner address');
    });

    it(`should successfully get entity fee owner with zero address`, async () => {
        assert((await stm.getEntityFeeOwner(CONST.testId2)) == CONST.nullAddr, 'unexpected fee owner address');
    });

    // getAllEntitiesWithFeeOwners()
    it(`should be able to get the list of all entities`, async () => {
        const allEntitiesWithFeeOwners = (await stm.getAllEntitiesWithFeeOwners()).map(u => {
            return {
                id: u.id.toString(),
                addr: u.addr,
            };
        });

        assert(allEntitiesWithFeeOwners[0].id == '1', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[0].addr == CONST.testAddr7, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[1].id == '2', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[1].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[2].id == '3', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[2].addr == CONST.testAddr2, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[3].id == '5', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[3].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[4].id == '6', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[4].addr == CONST.testAddr6, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[5].id == '7', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[5].addr == CONST.testAddr7, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[6].id == '8', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[6].addr == CONST.testAddr8, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[7].id == '9', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[7].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[8].id == '10', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[8].addr == CONST.testAddr10, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[9].id == '11', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[9].addr == CONST.testAddr1, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[10].id == '666', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[10].addr == CONST.testAddr2, 'Unexpected address of existing entities');
    });

    it(`should update all entities with fee owners after another entity is created`, async () => {
        await stm.createEntity({id: 777, addr: CONST.testAddr3});

        const allEntitiesWithFeeOwners = (await stm.getAllEntitiesWithFeeOwners()).map(u => {
            return {
                id: u.id.toString(),
                addr: u.addr,
            };
        });

        assert(allEntitiesWithFeeOwners[0].id == '1', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[0].addr == CONST.testAddr7, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[1].id == '2', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[1].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[2].id == '3', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[2].addr == CONST.testAddr2, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[3].id == '5', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[3].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[4].id == '6', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[4].addr == CONST.testAddr6, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[5].id == '7', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[5].addr == CONST.testAddr7, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[6].id == '8', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[6].addr == CONST.testAddr8, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[7].id == '9', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[7].addr == CONST.nullAddr, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[8].id == '10', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[8].addr == CONST.testAddr10, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[9].id == '11', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[9].addr == CONST.testAddr1, 'Unexpected address id of existing entities');
        assert(allEntitiesWithFeeOwners[10].id == '666', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[10].addr == CONST.testAddr2, 'Unexpected address of existing entities');
        assert(allEntitiesWithFeeOwners[11].id == '777', 'Unexpected entity id of existing entities');
        assert(allEntitiesWithFeeOwners[11].addr == CONST.testAddr3, 'Unexpected address of existing entities');
    });

    let whitelisted;

    // setAccountEntity()
    it(`preparation for the test`, async () => {
        whitelisted = await stm.getWhitelist();
    });

    it(`should fail to set account entity from a non-owner`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: CONST.testId1, addr: whitelisted[0]}, {from: accounts[10]}], 'Restricted');
    });

    it(`should fail to set account entity for a non-existing entity`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: 999, addr: whitelisted[0]}], 'Entity does not exist');
    });

    it(`should fail to set account entity for a zero entity`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: 0, addr: whitelisted[0]}], 'Entity does not exist');
    });

    it(`should fail to set account entity for a zero address`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: CONST.testId1, addr: CONST.nullAddr}], 'setAccountEntity: invalid entity address');
    });

    it(`should fail to set account entity for a non-whitelistede address`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: CONST.testId1, addr: CONST.testAddr10}], 'setAccountEntity: address is not white listed');
    });

    it(`should successfully entity for an account`, async () => {
        const tx = await stm.setAccountEntity({id: CONST.testId1, addr: whitelisted[0]});
        const event = CONST.getEvent(tx, 'EntityAssignedForAccount');
        assert(event.entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(event.account == whitelisted[0], 'Unexpected account address');
    });

    it(`should fail to set account entity for an address for the second time`, async () => {
        await CONST.expectRevert(stm.setAccountEntity, [{id: CONST.testId1, addr: whitelisted[0]}], 'setAccountEntity: address is already assigned to an entity');
    });

    // setAccountEntityBatch()
    it(`transaction should fail for batch set account entity batch with empty array`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[]], 'setAccountEntityBatch: empty args array passed');
    });

    it(`should fail to set account entity from a non-owner`, async () => {
        await CONST.expectRevert(
            stm.setAccountEntityBatch, 
            [
                [
                    {id: CONST.testId1, addr: whitelisted[1]}, 
                    {id: CONST.testId2, addr: whitelisted[2]}
                ], 
                {from: accounts[10]}
            ], 
                'Restricted'
        );
    });

    it(`should fail to set account entity batch for a non-existing entity`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[{id: 999, addr: whitelisted[1]}, {id: CONST.testId2, addr: whitelisted[2]}]], 'Entity does not exist');
    });

    it(`should fail to set account entity batch for a zero entity`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[{id: 0, addr: whitelisted[1]}, {id: CONST.testId2, addr: whitelisted[2]}]], 'Entity does not exist');
    });

    it(`should fail to set account entity batch for a zero address`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[{id: CONST.testId1, addr: CONST.nullAddr}, {id: CONST.testId2, addr: whitelisted[2]}]], 'setAccountEntity: invalid entity address');
    });

    it(`should fail to set account entity batch for a non-whitelistede address`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[{id: CONST.testId1, addr: CONST.testAddr10}, {id: CONST.testId2, addr: whitelisted[2]}]], 'setAccountEntity: address is not white listed');
    });

    it(`should successfully entity batch for an account`, async () => {
        const tx = await stm.setAccountEntityBatch([{id: CONST.testId1, addr: whitelisted[1]}, {id: CONST.testId2, addr: whitelisted[2]}]);
        const events = CONST.getEvents(tx, 'EntityAssignedForAccount');

        assert(events.length == 2, 'Unexpected number of EntityAssignedForAccount events');
        assert(events[0].entityId.toNumber() == CONST.testId1, 'Unexpected entity id');
        assert(events[0].account == whitelisted[1], 'Unexpected account address');
        assert(events[1].entityId.toNumber() == CONST.testId2, 'Unexpected entity id');
        assert(events[1].account == whitelisted[2], 'Unexpected account address');
    });

    it(`should fail to set account entity batch for an address for the second time`, async () => {
        await CONST.expectRevert(stm.setAccountEntityBatch, [[{id: CONST.testId1, addr: whitelisted[3]}, {id: CONST.testId3, addr: whitelisted[2]}]], 'setAccountEntity: address is already assigned to an entity');
    });

});
