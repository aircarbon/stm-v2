const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const account = `0x${'1'.repeat(40)}`;
const source = `0x${'2'.repeat(40)}`;
const int64Max = (1n << 63n) - 1n;

// Exercise the Truffle entry point with an in-memory chain. No keys or RPC are used.
async function clear({
  quantities = ['7'],
  entityAccounts = [account],
  liveType = '3',
  dryRun = false,
  completed = false,
} = {}) {
  const tokens = quantities.map((qty, i) => ({ stId: String(i + 1), qty }));
  const plan = {
    source: {
      contractAddress: source,
      network: 'test',
      file: 'synthetic.json',
    },
    entityId: '4',
    burns: [{ account, tokTypeId: '3', tokens }],
    withdrawals: [{ account, ccyTypeId: '1', amount: '17' }],
  };
  const remaining = new Map(completed ? [] : tokens.map((token) => [token.stId, token.qty]));
  let balance = completed ? '0' : '17';
  const burns = [];
  const withdrawals = [];
  const facet = {
    getContractSeal: async () => true,
    readOnly: async () => false,
    getOwners: async () => [account],
    getEntityAddresses: async () => entityAccounts,
    getLedgerEntry: async () => ({
      exists: true,
      tokens: [...remaining].map(([stId, currentQty]) => ({
        stId,
        currentQty,
        tokTypeId: liveType,
      })),
      ccys: [{ ccyTypeId: '1', balance, reserved: '0' }],
    }),
    getSecToken: async () => ({ currentQty: '0' }),
    burnTokens: async (owner, type, qty, ids) => {
      assert.equal(owner, account);
      assert.equal(type, '3');
      assert.ok(ids.length <= 10);
      assert.ok(BigInt(qty) > 0n && BigInt(qty) <= int64Max, 'burn must fit int64');
      assert.equal(
        BigInt(qty),
        ids.reduce((sum, id) => sum + BigInt(remaining.get(id)), 0n),
      );
      burns.push({ qty, ids: [...ids] });
      for (const id of ids) remaining.delete(id);
      return { tx: 'synthetic-burn' };
    },
    fundOrWithdraw: async (_direction, _type, amount, owner) => {
      assert.equal(owner, account);
      assert.equal(amount, '17');
      withdrawals.push(amount);
      balance = '0';
      return { tx: 'synthetic-withdrawal' };
    },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../dataAdjustedRemoval/clearEntity.js');
  const context = {
    module,
    __dirname: path.dirname(filename),
    require: (name) => {
      if (name === 'fs')
        return {
          readFileSync: () => JSON.stringify(plan),
          appendFileSync: () => {},
        };
      if (name === 'yargs-parser')
        return () => ({
          s: source,
          entity: '4',
          network: 'test',
          'dry-run': dryRun,
        });
      return require(name);
    },
    process: { argv: [] },
    console: { log: () => {} },
    artifacts: { require: () => ({ at: async () => facet }) },
    web3: {
      eth: {
        getAccounts: async () => [account],
        getTransactionCount: async () => 0,
      },
    },
    setTimeout,
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const error = await new Promise((resolve) => module.exports(resolve));
  return { error, burns, withdrawals, remaining, balance };
}

test('rejects wrong-scope accounts, token types and invalid quantities before any transaction', async () => {
  for (const options of [
    { entityAccounts: [] },
    { liveType: '8' },
    { quantities: ['0'] },
    { quantities: [(int64Max + 1n).toString()] },
  ]) {
    const result = await clear(options);
    assert.match(result.error?.message ?? '', /Nothing sent/);
    assert.deepEqual(result.burns, []);
    assert.deepEqual(result.withdrawals, []);
  }
});

test('splits whole-token burns at the int64 boundary and clears the remaining currency', async () => {
  const result = await clear({
    quantities: [(int64Max - 3n).toString(), '3', '5'],
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.burns, [
    { qty: int64Max.toString(), ids: ['1', '2'] },
    { qty: '5', ids: ['3'] },
  ]);
  assert.equal(result.remaining.size, 0);
  assert.equal(result.balance, '0');
});

test('keeps the ten-token limit and does not send on dry runs or completed reruns', async () => {
  const result = await clear({ quantities: Array(11).fill('2') });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.burns.map((burn) => burn.ids.length),
    [10, 1],
  );
  for (const options of [{ dryRun: true }, { completed: true }]) {
    const rerun = await clear(options);
    assert.equal(rerun.error, undefined);
    assert.deepEqual(rerun.burns, []);
    assert.deepEqual(rerun.withdrawals, []);
  }
});
