// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
const StTransferableFacet = artifacts.require('StTransferableFacet');
const StMasterFacet = artifacts.require('StMasterFacet');

const CONST = require('./const');
const Web3 = require('web3');
const web3 = new Web3();

/**
 * Usage: `INSTANCE_ID=local truffle exec upgrade_contract/restoreWL.js -s=ADDR -t=NEW_ADDR  -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
    console.log("Starting...");

    const contract = await StTransferableFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    const contract1 = await StMasterFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    // const contract = await StTransferableFacet.at('0x71A974Ef68F9a4cfC6336d78672e68326e9e4804');
    console.log('Sending..');
    console.log(await contract1.name());
    console.log('Sending..');

    const result = await contract.transfer_feePreview_ExchangeOnly({
        ledger_A: '0x5e4Bac1f39fdE36E6FA2EB22fc524a23C9F3a6E9',
        ledger_B: '0x753445E0E640c86e5a5b6eE47BC41221c4262284',
        qty_A: '1000',
        tokTypeId_A: 1,
        qty_B: 0,
        tokTypeId_B: 0,
        k_stIds_A: [],
        k_stIds_B: [],
        transferType: 0,
        ccy_amount_A: 0,
        ccyTypeId_A: 0,
        ccy_amount_B: '10000',
        ccyTypeId_B: 1,
        applyFees: true,
        previewFees: false,
        feeAddrOwner_A: '0x0000000000000000000000000000000000000000',
        feeAddrOwner_B: '0x0000000000000000000000000000000000000000'
    });

    console.log('Got results');
    console.log(result);
    console.log('Done.');
};
