import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Contract, HDNodeWallet, ZeroAddress } from "ethers";
import { artifacts, network } from "hardhat";
import { describe, it } from "mocha";
import { deployCommodity } from "../../scripts/deploy-commodity.ts";
import {
  createLocalDatabase,
  persistLocalDeployment,
} from "../../scripts/local-database.ts";
import { openLocalJournal } from "../../scripts/local-journal.ts";
import {
  captureRecovery,
  normalizeLegacyRecovery,
  restoreRecovery,
} from "../../scripts/recovery.ts";
import {
  captureWhitelist,
  restoreWhitelist,
  whitelistHash,
} from "../../scripts/recovery-whitelist.ts";

describe("bounded local recovery", () => {
  it("restores JSON backup with split/burned tokens and asymmetric entity fees; reopens signed journal", async function () {
    this.timeout(240000);
    const connection = await network.create("localRehearsal");
    const { ethers } = connection;
    const wallet = HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
    ).connect(ethers.provider);
    const directory = await mkdtemp(join(tmpdir(), "stm-recovery-"));
    let journal = await openLocalJournal(
      ethers.provider,
      wallet,
      join(directory, "source"),
    );
    try {
      const accounts = await ethers.getSigners();
      const owners = await Promise.all(
        accounts.slice(0, 10).map((a) => a.getAddress()),
      );
      const config = {
        owners,
        custodyType: 0 as const,
        name: "RECOVERY",
        version: "2.4",
        symbol: "ACC",
        unit: "KG",
        gitCommit: "synthetic",
      };
      const source = await deployCommodity(
        ethers,
        artifacts,
        wallet,
        journal,
        config,
      );
      const proxy = new Contract(source.proxy, source.abi, wallet);
      const a = await accounts[10].getAddress(),
        b = await accounts[11].getAddress();
      const wl = [
        b,
        owners[0],
        a,
        owners[1],
        ...(await Promise.all(
          accounts.slice(12, 213).map((account) => account.getAddress()),
        )),
      ];
      async function send(method: string, args: unknown[]) {
        await (await proxy.getFunction(method)(...args)).wait();
      }
      const zero = [0, 0, 0, 0, 0, false];
      await send("whitelistMany", [wl]);
      await send("createEntityBatch", [
        [
          { id: "1", addr: owners[0] },
          { id: "7", addr: owners[1] },
        ],
      ]);
      await send("setAccountEntityBatch", [
        [
          { id: "7", addr: b },
          { id: "1", addr: a },
          { id: "1", addr: owners[0] },
          { id: "7", addr: owners[1] },
          { id: "1", addr: wl[4] },
        ],
      ]);
      await send("sealContract", []);
      for (const name of ["USD", "EUR"])
        await send("addCcyType", [name, "cent", 2]);
      for (const name of ["CARBON", "OTHER"])
        await send("addSecTokenType", [
          name,
          1,
          [0, 0, 0, 0, 0, 0, 0],
          ZeroAddress,
        ]);
      await send("mintSecTokenBatch", [
        1,
        9007199254741009n,
        1,
        a,
        [13, 5, 0, 0, 0, false],
        3,
        ["project", "vintage"],
        ["local", "2026"],
      ]);
      await send("mintSecTokenBatch", [
        2,
        9007199254741017n,
        1,
        a,
        zero,
        0,
        [],
        [],
      ]);
      await send("fundOrWithdraw", [0, 1, 9007199254741003n, b, "local"]);
      await send("transferOrTrade", [
        {
          ledger_A: a,
          ledger_B: b,
          qty_A: 751,
          k_stIds_A: [],
          tokTypeId_A: 1,
          qty_B: 0,
          k_stIds_B: [],
          tokTypeId_B: 0,
          ccy_amount_A: 0,
          ccyTypeId_A: 0,
          ccy_amount_B: 0,
          ccyTypeId_B: 0,
          applyFees: false,
          feeAddrOwner_A: ZeroAddress,
          feeAddrOwner_B: ZeroAddress,
          transferType: 6,
        },
      ]);
      await send("burnTokens", [b, 1, 751, []]);
      for (const entity of [1, 7])
        for (const type of [1, 2]) {
          await send("setFee_TokType", [
            entity,
            type,
            ZeroAddress,
            [entity * 100 + type, 0, 0, 0, 0, false],
          ]);
          await send("setFee_CcyType", [
            entity,
            type,
            ZeroAddress,
            [entity * 200 + type, 0, 0, 0, 0, false],
          ]);
        }
      await send("setFee_TokType", [0, 1, a, [31, 0, 0, 0, 0, false]]);
      for (let i = 0; i < 5; i++)
        await send("mintSecTokenBatch", [1, 17 + i, 1, a, zero, 0, [], []]);
      await send("mintSecTokenBatch", [1, 23, 1, wl[4], zero, 0, [], []]);
      const scalar = await captureRecovery(proxy);
      const captured = await captureRecovery(proxy, 10);
      assert.deepEqual(captured.data, scalar.data);
      assert.equal(
        captured.data.ledgers[captured.data.ledgerOwners.indexOf(wl[4])].tokens
          .length,
        1,
      );
      const hashes: string[] = [];
      for (let n = 0; n < 10; n++)
        hashes.push(await proxy.getLedgerHashcode(10, n));
      assert.equal(captured.ledgerHash, hashes.sort().join(","));
      assert.ok(
        captured.data.globalSecTokens.length > 0,
        "Fully burned split token is off ledger",
      );
      await writeFile(join(directory, "backup.json"), JSON.stringify(captured));
      const backup = JSON.parse(
        await readFile(join(directory, "backup.json"), "utf8"),
      );
      assert.deepEqual(
        normalizeLegacyRecovery(backup, backup.ledgerHash),
        backup,
      );
      const legacy = structuredClone(backup);
      delete legacy.data.entitiesWithFeeOwners;
      delete legacy.data.accountEntities;
      assert.deepEqual(
        normalizeLegacyRecovery(legacy, legacy.ledgerHash).data
          .entitiesWithFeeOwners,
        [{ id: "1", addr: owners[0] }],
      );
      assert.throws(() =>
        normalizeLegacyRecovery(legacy, `0x${"12".repeat(32)}`),
      );
      legacy.data.accountEntities = [];
      assert.throws(
        () => normalizeLegacyRecovery(legacy, legacy.ledgerHash),
        /Partial entity/,
      );
      assert.throws(
        () =>
          normalizeLegacyRecovery(
            {
              ...backup,
              data: { ...backup.data, secTokenMintedQty: 9007199254740992 },
            },
            backup.ledgerHash,
          ),
        /Unsafe legacy Number/,
      );
      await journal.close();
      journal = await openLocalJournal(
        ethers.provider,
        wallet,
        join(directory, "target"),
      );
      const target = await deployCommodity(
        ethers,
        artifacts,
        wallet,
        journal,
        config,
      );
      const restored = new Contract(target.proxy, target.abi, wallet);
      const isolation = await ethers.provider.send("evm_snapshot", []);
      const wlBackup = await captureWhitelist(proxy);
      assert.notEqual(whitelistHash([...wl].reverse()), wlBackup.wlHash);
      await assert.rejects(
        restoreWhitelist(
          restored,
          { ...wlBackup, count: 5000 },
          journal,
          join(directory, "target"),
        ),
      );
      await restoreWhitelist(
        restored,
        wlBackup,
        journal,
        join(directory, "target"),
      );
      await restoreWhitelist(
        restored,
        wlBackup,
        journal,
        join(directory, "target"),
      );
      assert.deepEqual(await captureWhitelist(restored), wlBackup);
      assert.equal((await restored["getWhitelist()"]()).length, wl.length);
      await ethers.provider.send("evm_revert", [isolation]);
      const before = await ethers.provider.send("eth_blockNumber", []);
      for (const invalid of [
        { ...backup, info: { ...backup.info, contractType: "1" } },
        { ...backup, info: { ...backup.info, contractType: "2" } },
        { ...backup, info: { ...backup.info, format: undefined } },
        { ...backup, info: { ...backup.info, hashMod: "11" } },
        {
          ...backup,
          ledgerHash: backup.ledgerHash.split(",").slice(1).join(","),
        },
        { ...backup, ledgerHash: `0x${"11".repeat(32)}` },
        { ...backup, data: { ...backup.data, secTokenMintedQty: "bogus" } },
        { ...backup, data: { ...backup.data, accountEntities: [] } },
        {
          ...backup,
          data: {
            ...backup.data,
            whitelistAddresses: [wl[0], wl[0], wl[2], wl[3]],
          },
        },
        {
          ...backup,
          data: {
            ...backup.data,
            tokenTypes: backup.data.tokenTypes.map(
              (t: Record<string, unknown>) => ({ ...t, settlementType: "2" }),
            ),
          },
        },
      ]) {
        await assert.rejects(
          restoreRecovery(
            restored,
            invalid,
            journal,
            join(directory, "target"),
          ),
        );
        assert.deepEqual(Array.from(await restored.getLedgerOwners()), []);
        assert.deepEqual(Array.from(await restored["getWhitelist()"]()), []);
        assert.equal(await ethers.provider.send("eth_blockNumber", []), before);
      }
      await assert.rejects(
        restoreRecovery(
          restored,
          backup,
          journal,
          join(directory, "target"),
          8,
        ),
        /interrupted/,
      );
      await journal.close();
      journal = await openLocalJournal(
        ethers.provider,
        wallet,
        join(directory, "target"),
      );
      await assert.rejects(
        restoreRecovery(
          restored,
          {
            ...backup,
            ledgerHash: Array(10)
              .fill(`0x${"22".repeat(32)}`)
              .join(","),
          },
          journal,
          join(directory, "target"),
        ),
        /intent\/chain changed/,
      );
      await restoreRecovery(
        restored,
        backup,
        journal,
        join(directory, "target"),
      );
      assert.deepEqual(await captureRecovery(restored, 10), backup);
      await restoreRecovery(
        restored,
        backup,
        journal,
        join(directory, "target"),
      );
      assert.equal(await restored.getLedgerHashcode(1, 0), scalar.ledgerHash);
      // Real disposable PostgreSQL-compatible registry backup and fresh engine restore.
      const db = await createLocalDatabase();
      let archive: Blob;
      let rows: unknown;
      try {
        await persistLocalDeployment(db, target);
        rows = (await db.query("SELECT * FROM contract_function ORDER BY id"))
          .rows;
        archive = await db.dumpDataDir();
      } finally {
        await db.close();
      }
      const recoveredDb = new PGlite({ loadDataDir: archive });
      try {
        assert.deepEqual(
          (
            await recoveredDb.query(
              "SELECT * FROM contract_function ORDER BY id",
            )
          ).rows,
          rows,
        );
        await persistLocalDeployment(recoveredDb, target);
        assert.deepEqual(
          (
            await recoveredDb.query(
              "SELECT * FROM contract_function ORDER BY id",
            )
          ).rows,
          rows,
        );
      } finally {
        await recoveredDb.close();
      }
    } finally {
      await journal.close();
      await connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
