const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('restores type-major fees, exact global quantities and the final batch ID', async () => {
  const data = {
    entitiesWithFeeOwners: [{ id: '2' }, { id: '9' }],
    ccyTypes: [],
    ccyFees: [],
    tokenTypes: [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ],
    tokenFees: [11, 12, 21, 22, 31, 32].map((fee) => ({
      fee_fixed: String(fee),
    })),
    batches: Array.from({ length: 7 }, (_, i) => ({ id: String(i + 1) })),
    accountEntities: [],
    whitelistAddresses: [],
    ledgerOwners: [],
    ledgers: [],
    ledgerOwnersFees: [],
    globalSecTokens: [{ stId: '1', mintedQty: '9007199254740993', currentQty: '0' }],
    transferedFullSecTokensEvents: [],
  };
  const fees = [];
  const batches = [];
  const globalTokens = [];
  const facet = {
    name: async () => 'Synthetic',
    version: async () => '1',
    getAllEntitiesWithFeeOwners: async () => [],
    createEntityBatch: async () => {},
    getCcyTypes: async () => ({ ccyTypes: [] }),
    getSecTokenTypes: async () => ({ tokenTypes: data.tokenTypes }),
    getContractSeal: async () => false,
    getSecTokenBatch_MaxId: async () => '0',
    loadSecTokenBatch: async (items, max) => {
      batches.push({ ids: items.map((item) => item.id), max });
    },
    getLedgerOwners: async () => [],
    getWhitelist: async () => [],
    getSecToken: async () => ({ exists: false }),
    addSecTokenBatch: async (items) => {
      globalTokens.push(...items);
    },
    setTokenTotals: async () => {},
    sealContract: async () => {},
    setFee_TokTypeBatch: async (entities, types, _owners, args) => {
      args.forEach((fee, i) => {
        fees.push([String(entities[i]), String(types[i]), fee.fee_fixed]);
      });
    },
  };
  const createBatches = (items, size) =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
  const filename = path.join(__dirname, '../restore_v2.js');
  const module = { exports: {} };
  const context = {
    module,
    __dirname: path.dirname(filename),
    artifacts: { require: () => ({ at: async () => facet }) },
    console: {
      log: () => {},
      time: () => {},
      timeEnd: () => {},
      error: () => {},
    },
    process: { argv: [], on: () => {} },
    setTimeout: (fn) => fn(),
    require: (name) => {
      if (name === 'fs')
        return {
          readFileSync: () => JSON.stringify({ data, info: {}, ledgerHash: 'synthetic' }),
          writeFileSync: () => {},
        };
      if (name === 'yargs-parser') return () => ({ s: 'a'.repeat(40), t: 'b'.repeat(40), h: 'offchain' });
      if (name === 'chalk') return { yellow: (value) => value };
      if (name === 'web3-utils') return { toBN: (value) => value };
      if (name === '../const')
        return {
          nullAddr: `0x${'0'.repeat(40)}`,
          getAccountAndKey: async () => ({ addr: `0x${'1'.repeat(40)}` }),
        };
      if (name === '../../orm/build') return { helpers: { decodeWeb3Object: (value) => value } };
      if (name === './utils')
        return {
          createBatches,
          retry: async (functions) => Promise.all(functions.map((fn) => fn())),
          createBackupData: async () => ({ data }),
          getLedgerHashOffChain: () => 'synthetic',
        };
      if (name === 'async/series')
        return async (tasks) => {
          for (const task of tasks)
            await new Promise((resolve, reject) => task((error) => (error ? reject(error) : resolve())));
        };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const result = await new Promise((resolve, reject) => {
    module.exports(resolve).catch(reject);
  });
  assert.equal(result, 'Done.');
  assert.deepEqual(fees, [
    ['2', '1', '11'],
    ['9', '1', '12'],
    ['2', '2', '21'],
    ['9', '2', '22'],
    ['2', '3', '31'],
    ['9', '3', '32'],
  ]);
  assert.equal(globalTokens[0].mintedQty, '9007199254740993');
  assert.deepEqual(
    batches.map((batch) => [batch.ids.length, batch.max]),
    [
      [6, '6'],
      [1, '7'],
    ],
  );
});
