// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
const StLedgerFacet = artifacts.require('StLedgerFacet');

const CONST = require('./const');
const { helpers } = require('../orm/build');
const Web3 = require('web3');
const web3 = new Web3();

/**
 * Usage: `INSTANCE_ID=local truffle exec upgrade_contract/restoreWL.js -s=ADDR -t=NEW_ADDR  -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
    // const addr = '0xE294210998FB880C10403e709774FBABc903C93e'; // dev
    // const addr = '0xc84C2208cFE3ff5d51bd917dD7FfBa59b595A9fb'; // uat
    // const addr = '0x6DC2219D27b2f1285EA4C861D073C4CfadA67A51'; // demo
    const addr = '0xf4ffd2261c8Ef02806f99336554ebf6609E298a5'; // prod
    // const addr = '0x93583b7F2b5334249FD60b22fB0979eDb833bA2f'; // IDX uat
    // const addr = '0xEC4E445f4bA26983A0CfDd3835a0d4CdC73edCAC'; // IDX prod

    const contract = await StLedgerFacet.at(addr);


    console.log('Querying...');
    // console.log(helpers.decodeWeb3Object(await contract2.getSecToken("16")));
    console.log(helpers.decodeWeb3Object(await contract.getLedgerEntry("0x5Aac5B8642FCF5A4634aa017106a7fd59b238532")));
    console.log('Done');
    process.exit();
};
