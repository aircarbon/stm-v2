const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

// Use the compiled public API and real PostgreSQL SQL semantics, without a server or credentials.
function load(name, dependencies) {
  const exports = {};
  const filename = path.join(__dirname, '../build', `${name}.js`);
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      exports,
      module: { exports },
      process,
      console,
      require: (dependency) => dependencies[dependency] ?? require(dependency),
    },
    { filename },
  );
  return exports;
}

test('deployment and settings queries work on PostgreSQL, including text-based whitelist indices', async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await database.exec(`
    CREATE SCHEMA dbo; SET search_path TO dbo, public;
    CREATE TABLE contract (id SERIAL PRIMARY KEY, contract_enum TEXT, network_id INT, deployed_utc TIMESTAMP,
      addr TEXT, host_name TEXT, ip_v4 TEXT, abi TEXT, contract_ver TEXT, contract_type TEXT, "txHash" TEXT, symbol TEXT);
    CREATE TABLE global_config (config_key TEXT, config_value TEXT);
    CREATE TABLE whitelist_addr (id SERIAL PRIMARY KEY, addr TEXT);
  `);
  class Pool {
    async query(text, params) {
      const result = await database.query(text, params);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }
    async end() {}
  }
  const { createPgPool } = load('pgAdapter', { pg: { Pool } });
  const pool = await createPgPool({});
  const dependencies = { './pool': { getPool: async () => pool } };
  const deployment = load('deployment', dependencies);
  const setting = load('setting', dependencies);
  for (const version of ['1', '2']) {
    await deployment.SaveDeployment({
      contractName: 'ACX',
      networkId: '83001',
      deployedAddress: `address-${version}`,
      deployedAbi: '[]',
      contractVer: version,
      contractType: 'COMMODITY',
      txHash: `tx-${version}`,
    });
  }
  const found = await deployment.GetDeployment('83001', 'ACX', '2');
  assert.equal(found.recordset[0].addr, 'address-2');
  assert.equal(found.recordset[0].txHash, 'tx-2');
  assert.equal((await deployment.GetDeployedContracts('83001')).recordset[0].contract_enum, 'ACX');
  await setting.AddWhitelistAddress('first');
  await setting.AddWhitelistAddress('second');
  await setting.AddConfigSetting('next_wl_index', '2');
  assert.equal((await setting.GetAvailableWhitelistAddress()).recordset[0].addr, 'second');
});
