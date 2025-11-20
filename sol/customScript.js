// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
const StTransferableFacet = artifacts.require('StTransferableFacet');
const StMasterFacet = artifacts.require('StMasterFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StErc20Facet = artifacts.require('StErc20Facet');
const OwnedFacet = artifacts.require('OwnedFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');

const CONST = require('./const');
const { helpers } = require('../orm/build');
const Web3 = require('web3');
const web3 = new Web3();

/**
 * Usage: `INSTANCE_ID=local truffle exec upgrade_contract/restoreWL.js -s=ADDR -t=NEW_ADDR  -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
    const addr = '0xYourAddressHere'; 

    const contract = await StTransferableFacet.at(addr);
    const contract1 = await StMasterFacet.at(addr);
    const contract2 = await StLedgerFacet.at(addr);
    const contract3 = await StErc20Facet.at(addr);
    const contract4 = await OwnedFacet.at(addr);
    const contract5 = await CcyCollateralizableFacet.at(addr);

    console.log('--- STARTING THE SCRIPT ---');

    // console.log(await contract2.getSecTokenTypes());

    //////////// 1. Seal contract and check if sealed
    // console.log('\n--- 1. Seal contract and check if sealed ---');
    // console.log("Sealed (before): ", await contract1.getContractSeal());
    // await contract1.sealContract();
    // console.log("Sealed (after): ", await contract1.getContractSeal());

    ////////// 2. Get all entities
    // console.log('\n--- 2. Get all entities ---');
    // console.log((await contract3.getAllEntities()).toString());

    //////////// 3. Create entity
    // console.log('\n--- 3. Create entity ---');
    // console.log('Entities (before): ', (await contract3.getAllEntities()).toString());
    // await contract3.createEntity({id:1, addr:"0xaa778B42EbFf619aB5639595027F2D9f368eA856"});
    // console.log('Entities (after): ', (await contract3.getAllEntities()).toString());

    //////////// 4. Get entity fee owner
    // console.log('\n--- 4. Get entity fee owner ---');
    // let entityId = 1;
    // console.log(`Entity ${entityId} fee owner: `, helpers.decodeWeb3Object(await contract3.getEntityFeeOwner(entityId)));

    //////////// 5. Set account entity batch
    // console.log('\n--- 5. Set account entity batch ---');
    // await contract3.setAccountEntityBatch([
    //     {id: 1, addr: "0xaa778B42EbFf619aB5639595027F2D9f368eA856"},
    //     {id: 1, addr: "0x5Cd5F76686B86CB66494FeA4040b9Dea83129F81"},
    //     {id: 1, addr: "0x1674C0A479040cc2154A564f191Aad9A6227Aa5D"},
    //     {id: 1, addr: "0xD074d2A86485b0F60b881D4e24144A6e1b433e52"},
    //     {id: 1, addr: "0xc57DCf3FfDf8B14B30369866EA4F8Dc0784969eD"},

    //     {id: 1, addr: "0xB49e5B7CBdFD779de474Bb227d1F657c99031E8d"},
    //     {id: 1, addr: "0x7652f35708d5dFd936Bf25A52b555b6dE1335b2E"},
    //     {id: 1, addr: "0x96a755D3f293a6F5CB1EE7b67DB65ff2B58EF4d4"},
    //     {id: 1, addr: "0x00edf685f21f76A04C552eD0C855FFC77d94eB75"},
    //     {id: 1, addr: "0x8EF3eF58e7102748dfD9E93DF0A8e7332Ed14A29"},
    // ]);

    // //////////// 6. Get entity addresses
    // console.log('\n--- 6. Get entity addresses ---');
    // let entityIdForAddress = 1;
    // console.log(`Entity ${entityIdForAddress} address:`, (await contract2.getEntityAddresses(entityIdForAddress)));

    //////////// 7. Print out entity id of an address (batch)
    // console.log('\n--- 7. Print entity id of addresses (batch) ---');
    // console.log("Entities: ", (await contract2.getAccountEntityBatch([
    //     "0xaa778B42EbFf619aB5639595027F2D9f368eA856",

    //     // "0xB83Ac778bc18045D71C358f0BcF8d8A8D7965A9c",
    //     // "0xcA3c49bdEaf48e5E0Cc46F5C767503E18EcA0369",
    //     // "0x5c63efcC037e51DCCaCD377d8ff1Ad8Fc2Ded4f2",
    //     // "0x78F89A4f1bbd44bC2ab999a3C5cdc6a436488d7C",
    //     // "0xFfAe036e4ccCCB36e6E09F6adEe94c46C7926ae8",
    //     // "0x92c0Bd35751372a2D3435BaB6E3c27a7c612bD0d",
    //     // "0xD8fD71B502dAdC26f5690016e68A32612DAc3Ce1",
    //     // "0x797d0F0599c97560a98eca0d96d427B8410722dF",
    //     // "0x2F304D7e2275162d85C448d0e2A208c3bE48dFdc",
    //     // "0x9fBE0C55BF023E682E21cc77da2538c2B8cA87Ec",
    // ])).toString());

    //////////// 8. Print all currencies
    // console.log('\n--- 8. Print all currencies ---');
    // console.log("Currencies: ", await contract5.getCcyTypes());

    //////////// 9. Add new currency
    // console.log('\n--- 9. Add new currency ---');
    // console.log("Currencies (before): ", await contract5.getCcyTypes());
    // await contract5.addCcyType("USD", "cent", 2);
    // console.log("Currencies (after): ", await contract5.getCcyTypes());

    //////////// 10. Get security token types
    // console.log('\n--- 10. Get security token types ---');
    // console.log(helpers.decodeWeb3Object(await contract2.getSecTokenTypes()));

    //////////// 11. Get ledger entry
    // console.log('\n--- 11. Get ledger entry ---');
    // console.log(helpers.decodeWeb3Object(await contract2.getLedgerEntry("0x5Aac5B8642FCF5A4634aa017106a7fd59b238532")));

    //////////// 12. Transfer function (example)
    // console.log('\n--- 12. Transfer function (example) ---');
    // const result = await contract.transfer_feePreview_ExchangeOnly({
    //     ledger_A: '0x5e4Bac1f39fdE36E6FA2EB22fc524a23C9F3a6E9',
    //     ledger_B: '0x753445E0E640c86e5a5b6eE47BC41221c4262284',
    //     qty_A: '1000',
    //     tokTypeId_A: 1,
    //     qty_B: 0,
    //     tokTypeId_B: 0,
    //     k_stIds_A: [],
    //     k_stIds_B: [],
    //     transferType: 0,
    //     ccy_amount_A: 0,
    //     ccyTypeId_A: 0,
    //     ccy_amount_B: '10000',
    //     ccyTypeId_B: 1,
    //     applyFees: true,
    //     previewFees: false,
    //     feeAddrOwner_A: '0x0000000000000000000000000000000000000000',
    //     feeAddrOwner_B: '0x0000000000000000000000000000000000000000'
    // });
    // console.log('Got results');
    // console.log(result);
    // console.log('Done.');

    console.log('--- DONE ---');
    process.exit();
};
