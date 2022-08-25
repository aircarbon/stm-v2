// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const { soliditySha3 } = require('web3-utils');
const fs = require('fs');
const path = require('path');
const { toBN } = require('web3-utils');
const chalk = require('chalk');
const argv = require('yargs-parser')(process.argv.slice(2));
// @ts-ignore artifacts from truffle
const StMaster = artifacts.require('StMaster');
const series = require('async/series');

const { getLedgerHashOffChain } = require('./contract_upgrade/utils');
const CONST = require('./const');

/**
 * Usage: `INSTANCE_ID=local truffle exec upgrade_contract/restoreWL.js -s=ADDR -t=NEW_ADDR  -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
  const oldContract1 = await StMaster.at("0x8fBceA9E6aE56f75cc71B042dd3C717ea900C215");
  console.log(await CONST.getLedgerHashcode(oldContract1));

};
