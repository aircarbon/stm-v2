import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, HDNodeWallet, ZeroAddress } from "ethers";
import { artifacts, network } from "hardhat";
import { describe, it } from "mocha";
import { openAmoyJournal, recoverySource } from "../../scripts/amoy-journal.ts";
import {
  deployAmoyCommodity,
  deployCommodity,
} from "../../scripts/deploy-commodity.ts";
import { setupCommodity } from "../../scripts/setup-commodity.ts";

describe("guarded Amoy execution on disposable EDR", () => {
  it("rejects wrong chains, source writes, unrelated targets and fee overruns; replays USD setup without resending", async function () {
    this.timeout(240000);
    const local = await network.create("localRehearsal");
    const amoy = await network.create({
      network: "localRehearsal",
      override: { chainId: 80002 },
    });
    const directory = await mkdtemp(join(tmpdir(), "amoy-journal-"));
    const wallet = HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
    ).connect(amoy.ethers.provider);
    const accounts = await amoy.ethers.getSigners();
    const addresses = await Promise.all(
      accounts.slice(0, 30).map((a) => a.getAddress()),
    );
    const config = {
      owners: addresses.slice(0, 10),
      custodyType: 0 as const,
      name: "AMOY_TEST_ONLY",
      version: "2.6.6",
      symbol: "ACC",
      unit: "KG",
      gitCommit: "local-test",
    };
    let journal: Awaited<ReturnType<typeof openAmoyJournal>> | undefined;
    try {
      await assert.rejects(
        openAmoyJournal(
          local.ethers.provider,
          wallet,
          join(directory, "wrong"),
          10n ** 18n,
        ),
        /Amoy only/,
      );
      const tiny = await openAmoyJournal(
        amoy.ethers.provider,
        wallet,
        join(directory, "tiny"),
        1n,
      );
      try {
        await assert.rejects(
          tiny.send("deploy", { data: "0x60006000f3" }),
          /budget exhausted/,
        );
      } finally {
        await tiny.close();
      }
      journal = await openAmoyJournal(
        amoy.ethers.provider,
        wallet,
        join(directory, "main"),
        3n * 10n ** 18n,
      );
      await assert.rejects(
        deployCommodity(amoy.ethers, artifacts, wallet, journal, config),
        /Wrong deployment chain/,
      );
      await assert.rejects(
        journal.send("source", { to: recoverySource, data: "0x" }),
        /Source is read-only/,
      );
      await assert.rejects(
        journal.send("unrelated", { to: ZeroAddress, data: "0x" }),
        /created in this journal/,
      );
      await assert.rejects(
        journal.send("transfer", { value: 1n }),
        /No native transfers/,
      );
      assert.equal(
        await amoy.ethers.provider.getTransactionCount(wallet.address),
        0,
      );
      const manifest = await deployAmoyCommodity(
        amoy.ethers,
        artifacts,
        wallet,
        journal,
        config,
      );
      const proxy = new Contract(manifest.proxy, manifest.abi, wallet);
      await assert.rejects(
        proxy.connect(accounts[29]).getFunction("sealContract").staticCall(),
        /Restricted/,
      );
      const result = await setupCommodity(proxy, addresses, journal);
      assert.equal(await proxy.getContractSeal(), true);
      assert.equal((await proxy.getCcyTypes()).ccyTypes[0].unit, "cents");
      assert.equal((await proxy.getFee(0, 4, 1, ZeroAddress)).fee_min, 300n);
      const nonce = await amoy.ethers.provider.send("eth_getTransactionCount", [
        wallet.address,
        "latest",
      ]);
      await journal.close();
      journal = undefined;
      await assert.rejects(
        openAmoyJournal(
          amoy.ethers.provider,
          wallet,
          join(directory, "main"),
          2n * 10n ** 18n,
        ),
        /budget changed/,
      );
      journal = await openAmoyJournal(
        amoy.ethers.provider,
        wallet,
        join(directory, "main"),
        3n * 10n ** 18n,
      );
      await assert.rejects(
        journal.send("changed", { data: "0x60006000f3" }),
        /intent changed/,
      );
      assert.deepEqual(
        await deployAmoyCommodity(
          amoy.ethers,
          artifacts,
          wallet,
          journal,
          config,
        ),
        manifest,
      );
      assert.deepEqual(await setupCommodity(proxy, addresses, journal), result);
      assert.equal(
        await amoy.ethers.provider.send("eth_getTransactionCount", [
          wallet.address,
          "latest",
        ]),
        nonce,
      );
    } finally {
      await journal?.close();
      await local.close();
      await amoy.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
