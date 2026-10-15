const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('B3 providers require an explicit endpoint and honor mnemonic environment overrides', () => {
  const env = {
    DEV_MNEMONIC: 'synthetic-dev',
    PROD_MNEMONIC: 'synthetic-prod',
  };
  class Wallet {
    constructor(mnemonic, endpoint) {
      this.mnemonic = mnemonic;
      this.endpoint = endpoint;
      this.engine = { _providers: [] };
    }
  }
  class NonceTracker {
    setEngine() {}
  }
  class Web3 {
    constructor() {
      this.utils = { toWei: (value) => value };
    }
  }
  const module = { exports: {} };
  const filename = path.join(__dirname, '../../truffle-config.js');
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      module,
      process: { env },
      require: (name) => {
        if (name === 'dotenv') return { config: () => {} };
        if (name === 'web3') return Web3;
        if (name === '@truffle/hdwallet-provider') return Wallet;
        if (name === 'web3-provider-engine/subproviders/nonce-tracker') return NonceTracker;
        if (name === 'http') return { Agent: {} };
        throw new Error(`Unexpected dependency ${name}`);
      },
    },
    { filename },
  );
  const { networks } = module.exports;
  assert.throws(() => networks.b3_private_dev.provider(), /B3_RPC_URL/);
  assert.throws(() => networks.b3_private_prod.provider(), /B3_RPC_URL/);
  env.B3_RPC_URL = 'https://rpc.example.invalid';
  assert.equal(networks.b3_private_dev.provider().endpoint, env.B3_RPC_URL);
  assert.equal(networks.b3_private_dev.provider().mnemonic, 'synthetic-dev');
  assert.equal(networks.b3_private_prod.provider().endpoint, env.B3_RPC_URL);
  assert.equal(networks.b3_private_prod.provider().mnemonic, 'synthetic-prod');
});
