// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

const _ = require('lodash');
const chalk = require('chalk');

const CONST = require('../const.js');
const deploymentHelper = require('./deploymentHelper');
const setup = require('../devSetupContract.js');
const db = require('../../orm/build');

/**
 * Deploy with localhost values:
 * `INSTANCE_ID=local truffle migrate --network development -f 2 --to 2`
 *
 * Deploy to a configured network:
 * `INSTANCE_ID=<name> truffle migrate --network remote -f 2 --to 2`
 *
 * Remote database credentials, RPC_URL, NETWORK_ID, and MNEMONIC must be
 * supplied through the environment or an ignored environment file.
 */
module.exports = async function deployContracts(deployer) {
  const owner = await CONST.getAccountAndKey(0);
  const isTest = process.env.ISTEST === 'true';
  const instanceId = process.env.INSTANCE_ID || 'local';

  console.log(`Deploying ${instanceId} instance; deployment metadata database: ${chalk.inverse(process.env.sql_server)}`);

  if (!isTest) {
    for (const key of ['CONTRACT_VERSION', 'GIT_COMMIT']) {
      if (!process.env[key]) {
        throw new Error(`${key} is required for non-test deployments`);
      }
    }
  }

  if (String(process.env.NETWORK_ID) !== String(deployer.network_id)) {
    throw new Error(
      `NETWORK_ID (${process.env.NETWORK_ID}) does not match deployer network_id (${deployer.network_id})`,
    );
  }
  process.env.WEB3_NETWORK_ID = deployer.network_id;

  const { web3 } = CONST.getTestContextWeb3();
  const balance = await web3.eth.getBalance(owner.addr);
  console.log('owner', owner.addr);
  console.log('owner balance', web3.utils.fromWei(balance));

  const dbData = await db.GetDeployment(3, 'dummy_contractName', 'dummy_contractVer');
  if (!dbData || !dbData.recordsets) {
    throw new Error('Database connection failure');
  }

  if (!['SELF_CUSTODY', 'THIRD_PARTY_CUSTODY'].includes(process.env.CUSTODY_TYPE)) {
    process.env.CUSTODY_TYPE = 'SELF_CUSTODY';
  }

  switch (process.env.CONTRACT_TYPE) {
    case 'COMMODITY':
      await deploymentHelper.Deploy({
        deployer,
        artifacts,
        contractType: 'COMMODITY',
        custodyType: process.env.CUSTODY_TYPE,
        git_commit: process.env.GIT_COMMIT,
        version: process.env.CONTRACT_VERSION,
        isTest,
      });
      if (!isTest && !deployer.network.includes('-fork') && process.env.RESTORE_CONTRACT !== 'YES') {
        await setup.setDefaults();
      }
      return;

    case 'CASHFLOW_CONTROLLER':
      await deploymentHelper.Deploy({
        deployer,
        artifacts,
        contractType: 'CASHFLOW_CONTROLLER',
        custodyType: process.env.CUSTODY_TYPE,
      });
      await setup.setDefaults();
      return;

    case 'CASHFLOW_BASE': {
      const name = process.env.ADD_TYPE__CONTRACT_NAME;
      const symbol = process.env.ADD_TYPE__CONTRACT_SYMBOL;
      const typeName = process.env.ADD_TYPE__TYPE_NAME;
      if (!name || !symbol || !typeName) {
        throw new Error('ADD_TYPE__CONTRACT_NAME, ADD_TYPE__CONTRACT_SYMBOL, and ADD_TYPE__TYPE_NAME are required');
      }

      process.env.CONTRACT_TYPE = 'CASHFLOW_CONTROLLER';
      const controllerWhitelist = await CONST.web3_call('getWhitelist', []);
      if (!controllerWhitelist || controllerWhitelist.length === 0) {
        throw new Error('Cannot deploy a base type before the controller whitelist is configured');
      }

      process.env.CONTRACT_TYPE = 'CASHFLOW_BASE';
      const baseAddress = await deploymentHelper.Deploy({
        deployer,
        artifacts,
        contractType: 'CASHFLOW_BASE',
        custodyType: process.env.CUSTODY_TYPE,
        nameOverride: name,
        symbolOverride: symbol,
      });

      if (deployer.network.includes('-fork')) return;

      process.env.CONTRACT_TYPE = 'CASHFLOW_CONTROLLER';
      await CONST.web3_tx(
        'addSecTokenTypeBatch',
        [[{ name: typeName, settlementType: CONST.settlementType.SPOT, ft: CONST.nullFutureArgs, cashflowBaseAddr: baseAddress }]],
        owner.addr,
        owner.privKey,
      );

      await setup.setDefaults({ nameOverride: name });
      for (const chunk of _.chunk(controllerWhitelist, 50)) {
        await CONST.web3_tx('whitelistMany', [chunk], owner.addr, owner.privKey, undefined, baseAddress);
      }
      await CONST.web3_tx('sealContract', [], owner.addr, owner.privKey, undefined, baseAddress);
      return;
    }

    default:
      throw new Error(`Unknown CONTRACT_TYPE (${process.env.CONTRACT_TYPE})`);
  }
};
