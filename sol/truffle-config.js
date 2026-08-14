// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the remote network`);
  }
  return value;
}

function numberFromEnv(name, fallback) {
  return process.env[name] ? Number(process.env[name]) : fallback;
}

function remoteProvider() {
  return new HDWalletProvider(required('MNEMONIC'), required('RPC_URL'), 0, numberFromEnv('ACCOUNT_COUNT', 10));
}

module.exports = {
  networks: {
    development: {
      host: process.env.GANACHE_HOST || '127.0.0.1',
      port: numberFromEnv('GANACHE_PORT', 8545),
      network_id: '*',
      gas: numberFromEnv('GAS', 7900000),
      gasPrice: numberFromEnv('GAS_PRICE', 5000000000),
    },
    remote: {
      provider: remoteProvider,
      network_id: process.env.NETWORK_ID || '*',
      gas: numberFromEnv('GAS', 7900000),
      gasPrice: numberFromEnv('GAS_PRICE', 5000000000),
      confirmations: numberFromEnv('CONFIRMATIONS', 1),
      timeoutBlocks: numberFromEnv('TIMEOUT_BLOCKS', 200),
      networkCheckTimeout: numberFromEnv('NETWORK_CHECK_TIMEOUT', 90000),
      skipDryRun: process.env.SKIP_DRY_RUN === 'true',
    },
  },
  mocha: {
    timeout: 0,
    enableTimeouts: false,
  },
  compilers: {
    solc: {
      version: '0.8.5',
      docker: false,
      settings: {
        optimizer: {
          enabled: true,
          runs: 1,
        },
        evmVersion: 'byzantium',
      },
    },
  },
  all: false,
  compileAll: false,
};
