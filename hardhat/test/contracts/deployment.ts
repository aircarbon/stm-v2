import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, HDNodeWallet, Interface } from "ethers";
import { artifacts, network } from "hardhat";
import { describe, it } from "mocha";
import {
  deployCommodity,
  replaceFacet,
} from "../../scripts/deploy-commodity.ts";
import {
  createLocalDatabase,
  persistLocalDeployment,
} from "../../scripts/local-database.ts";
import { openLocalJournal } from "../../scripts/local-journal.ts";

describe("disposable COMMODITY deployment", () => {
  it("reconciles mined deployment after DB failure without duplicate transactions, then replaces a facet", async () => {
    const connection = await network.create("localRehearsal");
    const { ethers } = connection;
    // Hardhat's public test mnemonic. Never load operational keys into this suite.
    const wallet = HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
    ).connect(ethers.provider);
    const accounts = await ethers.getSigners();
    assert.equal(accounts.length, 1024);
    const directory = await mkdtemp(join(tmpdir(), "stm-journal-"));
    const db = await createLocalDatabase();
    let journal = await openLocalJournal(ethers.provider, wallet, directory);
    try {
      const config = {
        owners: await Promise.all(
          accounts.slice(0, 10).map((account) => account.getAddress()),
        ),
        custodyType: 0 as const,
        name: "LOCAL_ACX",
        version: "2.4",
        symbol: "ACC",
        unit: "KG",
        gitCommit: "synthetic",
      };
      await assert.rejects(
        openLocalJournal(ethers.provider, wallet, directory),
        /EEXIST/,
      );
      const deployed = await deployCommodity(
        ethers,
        artifacts,
        wallet,
        journal,
        config,
      );
      assert.equal(deployed.contracts.length, 24);
      const before = await ethers.provider.send("eth_getTransactionCount", [
        wallet.address,
        "latest",
      ]);
      assert.equal(BigInt(before), 28n);
      await db.exec(
        "ALTER TABLE contract ADD CONSTRAINT fail_projection CHECK (false)",
      );
      await assert.rejects(
        persistLocalDeployment(db, deployed),
        /fail_projection/,
      );
      assert.equal(
        (
          await db.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM contract_deployed",
          )
        ).rows[0].count,
        0,
      );
      await journal.close();
      journal = await openLocalJournal(ethers.provider, wallet, directory);
      const resumed = await deployCommodity(
        ethers,
        artifacts,
        wallet,
        journal,
        config,
      );
      assert.deepEqual(resumed, deployed);
      assert.equal(
        await ethers.provider.send("eth_getTransactionCount", [
          wallet.address,
          "latest",
        ]),
        before,
      );
      await db.exec("ALTER TABLE contract DROP CONSTRAINT fail_projection");
      await persistLocalDeployment(db, resumed);
      await persistLocalDeployment(db, resumed);
      await assert.rejects(
        persistLocalDeployment(db, {
          ...resumed,
          config: { ...resumed.config, symbol: "CHANGED" },
        }),
        /Changed database manifest/,
      );
      await assert.rejects(
        deployCommodity(ethers, artifacts, wallet, journal, {
          ...config,
          symbol: "CHANGED",
        }),
        /Changed deployment intent/,
      );
      assert.equal(
        await ethers.provider.send("eth_getTransactionCount", [
          wallet.address,
          "latest",
        ]),
        before,
      );
      const records = await db.query<{
        addr: string;
        abi: string;
        contract_type: string;
      }>("SELECT addr, abi, contract_type FROM contract");
      assert.equal(records.rows.length, 1);
      assert.equal(records.rows[0].addr, resumed.proxy);
      assert.equal(records.rows[0].contract_type, "COMMODITY");
      const abi = new Interface(JSON.parse(records.rows[0].abi));
      assert.ok(abi.getFunction("mintSecTokenBatch"));
      assert.equal(abi.getFunction("init"), null);
      const proxy = new Contract(resumed.proxy, resumed.abi, wallet);
      const oldOwners = Array.from(await proxy.getOwners());
      const replacement = await replaceFacet(
        ethers,
        artifacts,
        wallet,
        journal,
        resumed,
        "OwnedFacet",
      );
      assert.notEqual(
        replacement.address,
        resumed.contracts.find((contract) => contract.name === "OwnedFacet")
          ?.address,
      );
      assert.deepEqual(Array.from(await proxy.getOwners()), oldOwners);
      assert.equal(await proxy.name(), "LOCAL_ACX");
      const afterUpgrade = await ethers.provider.send(
        "eth_getTransactionCount",
        [wallet.address, "latest"],
      );
      assert.deepEqual(
        await replaceFacet(
          ethers,
          artifacts,
          wallet,
          journal,
          resumed,
          "OwnedFacet",
        ),
        replacement,
      );
      assert.equal(
        await ethers.provider.send("eth_getTransactionCount", [
          wallet.address,
          "latest",
        ]),
        afterUpgrade,
      );
    } finally {
      await journal.close();
      await db.close();
      await connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
