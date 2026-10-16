import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import type { Manifest } from "./deploy-commodity.ts";

// Disposable PostgreSQL-compatible schema: same deployment columns as orm/src/deployment.ts.
// This does not connect to, migrate or change any shared database.
export async function createLocalDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE contract_deployed (id SERIAL PRIMARY KEY, contract_name TEXT, network_id INT,
      addr TEXT, linked_to_addr TEXT, "txHash" TEXT, deployed_utc TIMESTAMP,
      version TEXT, git_commit TEXT, host_name TEXT, ip TEXT);
    CREATE TABLE contract_function (id SERIAL PRIMARY KEY, network_id INT, action TEXT,
      function_name TEXT, func_selector TEXT, contract_addr TEXT, linked_to_addr TEXT,
      tx_hash TEXT, init_addr TEXT, calldata TEXT, deployed_utc TIMESTAMP, host_name TEXT, ip TEXT);
    CREATE TABLE contract (id SERIAL PRIMARY KEY, contract_enum TEXT, network_id INT,
      deployed_utc TIMESTAMP, addr TEXT, host_name TEXT, ip_v4 TEXT, abi TEXT,
      contract_ver TEXT, contract_type TEXT, "txHash" TEXT, symbol TEXT);
    CREATE TABLE hardhat_checkpoint (proxy TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL);
  `);
  return db;
}

export async function persistLocalDeployment(db: PGlite, manifest: Manifest) {
  assert.equal(manifest.chainId, 31337, "Local chain only");
  const hash = keccak256(toUtf8Bytes(JSON.stringify(manifest)));
  await db.transaction(async (tx) => {
    const inserted = await tx.query(
      "INSERT INTO hardhat_checkpoint VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING proxy",
      [manifest.proxy, hash],
    );
    if (inserted.rows.length === 0) {
      const saved = await tx.query<{ manifest_hash: string }>(
        "SELECT manifest_hash FROM hardhat_checkpoint WHERE proxy = $1",
        [manifest.proxy],
      );
      assert.equal(
        saved.rows[0].manifest_hash,
        hash,
        "Changed database manifest",
      );
      return;
    }
    for (const contract of manifest.contracts) {
      await tx.query(
        `INSERT INTO contract_deployed
        (contract_name, network_id, addr, linked_to_addr, "txHash", deployed_utc, version, git_commit, host_name, ip)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, 'local-rehearsal', '127.0.0.1')`,
        [
          contract.name,
          manifest.chainId,
          contract.address,
          contract.name === "DiamondCutFacet"
            ? null
            : contract.name === "DiamondProxy"
              ? "this"
              : manifest.proxy,
          contract.txHash,
          manifest.config.version,
          manifest.config.gitCommit,
        ],
      );
    }
    for (const entry of manifest.functions) {
      await tx.query(
        `INSERT INTO contract_function
        (network_id, action, function_name, func_selector, contract_addr, linked_to_addr, tx_hash, init_addr, calldata, deployed_utc, host_name, ip)
        VALUES ($1, 'ADD', $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'local-rehearsal', '127.0.0.1')`,
        [
          manifest.chainId,
          entry.name,
          entry.selector,
          entry.address,
          manifest.proxy,
          entry.txHash,
          entry.initAddress,
          entry.calldata,
        ],
      );
    }
    const proxy = manifest.contracts.find(
      (contract) => contract.name === "DiamondProxy",
    );
    assert.ok(proxy);
    await tx.query(
      `INSERT INTO contract
      (contract_enum, network_id, deployed_utc, addr, host_name, ip_v4, abi, contract_ver, contract_type, "txHash", symbol)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'local-rehearsal', '127.0.0.1', $4, $5, 'COMMODITY', $6, $7)`,
      [
        manifest.config.name,
        manifest.chainId,
        manifest.proxy,
        new Interface(manifest.abi).formatJson(),
        manifest.config.version,
        proxy.txHash,
        manifest.config.symbol,
      ],
    );
  });
}
