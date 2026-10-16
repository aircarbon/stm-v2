import assert from "node:assert/strict";
import { Contract } from "ethers";
import { artifacts, network } from "hardhat";
import { describe, it } from "mocha";
import {
  deployCommodity,
  replaceFacet,
} from "../../scripts/deploy-commodity.ts";
import type { LocalJournal } from "../../scripts/local-journal.ts";

describe("seal authorization", () => {
  it("rejects outsiders before and after replacement, while a reserved owner can seal without resetting state", async () => {
    const connection = await network.create("localRehearsal");
    try {
      const { ethers } = connection;
      const accounts = await ethers.getSigners();
      const owners = await Promise.all(
        accounts.slice(0, 10).map((a) => a.getAddress()),
      );
      const transport: LocalJournal = {
        async send(_key, request) {
          const receipt = await (
            await accounts[0].sendTransaction(request)
          ).wait();
          assert.ok(receipt && receipt.status === 1);
          return receipt;
        },
        async close() {},
      };
      const manifest = await deployCommodity(
        ethers,
        artifacts,
        accounts[0],
        transport,
        {
          owners,
          custodyType: 0,
          name: "SEAL",
          version: "2.4",
          symbol: "ACC",
          unit: "KG",
          gitCommit: "synthetic",
        },
      );
      const proxy = new Contract(manifest.proxy, manifest.abi, accounts[0]);
      const outsider = new Contract(manifest.proxy, manifest.abi, accounts[10]);
      await (await proxy.whitelistMany([owners[9]])).wait();
      await assert.rejects(async () => {
        await (await outsider.sealContract()).wait();
      }, /Restricted/);
      assert.equal(await proxy.getContractSeal(), false);
      await replaceFacet(
        ethers,
        artifacts,
        accounts[0],
        transport,
        manifest,
        "StMasterFacet",
      );
      await assert.rejects(outsider.sealContract.staticCall(), /Restricted/);
      assert.equal(await proxy.getContractSeal(), false);
      const owner = new Contract(manifest.proxy, manifest.abi, accounts[9]);
      await (await owner.sealContract()).wait();
      assert.equal(await proxy.getContractSeal(), true);
      await (await owner.sealContract()).wait();
      assert.equal(await proxy.getContractSeal(), true);
      assert.deepEqual(Array.from(await proxy["getWhitelist()"]()), [
        owners[9],
      ]);
      assert.deepEqual(Array.from(await proxy.getOwners()), owners);
      assert.equal(await proxy.name(), "SEAL");
    } finally {
      await connection.close();
    }
  });
});
