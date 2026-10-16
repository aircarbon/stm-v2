import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, HDNodeWallet, ZeroAddress } from "ethers";
import { artifacts, network } from "hardhat";
import { describe, it } from "mocha";
import {
  deployCommodity,
  replaceFacet,
} from "../../scripts/deploy-commodity.ts";
import { openLocalJournal } from "../../scripts/local-journal.ts";

describe("COMMODITY lifecycle", () => {
  it("preserves exact balances, events, ordered whitelist and ledger hash across facet replacement", async () => {
    const connection = await network.create("localRehearsal");
    const { ethers } = connection;
    const wallet = HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
    ).connect(ethers.provider);
    const accounts = await ethers.getSigners();
    const directory = await mkdtemp(join(tmpdir(), "stm-lifecycle-"));
    const journal = await openLocalJournal(ethers.provider, wallet, directory);
    try {
      const owners = await Promise.all(
        accounts.slice(0, 10).map((a) => a.getAddress()),
      );
      const manifest = await deployCommodity(
        ethers,
        artifacts,
        wallet,
        journal,
        {
          owners,
          custodyType: 0,
          name: "LOCAL_IDX",
          version: "2.4",
          symbol: "ACC",
          unit: "KG",
          gitCommit: "synthetic",
        },
      );
      const proxy = new Contract(manifest.proxy, manifest.abi, wallet);
      const seller = await accounts[10].getAddress();
      const buyer = await accounts[11].getAddress();
      const outsider = new Contract(manifest.proxy, manifest.abi, accounts[12]);
      const whitelist = [buyer, owners[0], seller];
      const noFee = [0n, 0n, 0n, 0n, 0n, false];
      const minted = 9007199254741009n;
      const funded = 9007199254741003n;
      async function send(key: string, method: string, args: unknown[]) {
        return journal.send(key, {
          to: manifest.proxy,
          data: proxy.interface.encodeFunctionData(method, args),
        });
      }
      await assert.rejects(outsider.setReadOnly.staticCall(true), /Restricted/);
      await send("whitelist", "whitelistMany", [whitelist]);
      await send("entity", "createEntity", [[1, owners[0]]]);
      await send("assign", "setAccountEntityBatch", [
        whitelist.map((addr) => [1, addr]),
      ]);
      await assert.rejects(
        proxy.mintSecTokenBatch.staticCall(
          1,
          minted,
          1,
          seller,
          noFee,
          0,
          [],
          [],
        ),
        /Contract is not sealed/,
      );
      await send("seal", "sealContract", []);
      await assert.rejects(
        proxy.whitelistMany.staticCall([await accounts[12].getAddress()]),
        /Contract is sealed/,
      );
      await send("currency", "addCcyType", ["USD", "cent", 2]);
      await send("token-type", "addSecTokenType", [
        "CARBON",
        1,
        [0, 0, 0, 0, 0, 0, 0],
        ZeroAddress,
      ]);
      await assert.rejects(
        proxy.mintSecTokenBatch.staticCall(
          1,
          9223372036854775808n,
          1,
          seller,
          noFee,
          0,
          [],
          [],
        ),
        /Bad mintQty/,
      );
      await assert.rejects(
        outsider.mintSecTokenBatch.staticCall(
          1,
          minted,
          1,
          seller,
          noFee,
          0,
          [],
          [],
        ),
        /Restricted/,
      );
      const receipt = await send("mint", "mintSecTokenBatch", [
        1,
        minted,
        1,
        seller,
        noFee,
        0,
        ["project"],
        ["synthetic"],
      ]);
      const mintEvent = receipt.logs
        .map((log) => proxy.interface.parseLog(log))
        .find((event) => event?.name === "Minted");
      assert.ok(
        mintEvent,
        "Merged ABI must decode delegatecalled TokenLib events",
      );
      assert.equal(mintEvent.args.mintQty, minted);
      assert.equal(mintEvent.args.to, seller);
      assert.equal(mintEvent.args.batchId, 1n);
      await send("fund", "fundOrWithdraw", [0, 1, funded, buyer, "synthetic"]);
      await send("fee", "setFee_TokType", [
        1,
        1,
        ZeroAddress,
        [7, 0, 0, 0, 0, false],
      ]);
      await send("trade", "transferOrTrade", [
        {
          ledger_A: seller,
          ledger_B: buyer,
          qty_A: 751n,
          k_stIds_A: [],
          tokTypeId_A: 1,
          qty_B: 0,
          k_stIds_B: [],
          tokTypeId_B: 0,
          ccy_amount_A: 0,
          ccyTypeId_A: 0,
          ccy_amount_B: 103n,
          ccyTypeId_B: 1,
          applyFees: true,
          feeAddrOwner_A: ZeroAddress,
          feeAddrOwner_B: ZeroAddress,
          transferType: 0,
        },
      ]);
      await send("burn", "burnTokens", [buyer, 1, 31, []]);
      const sellerLedger = await proxy.getLedgerEntry(seller);
      const buyerLedger = await proxy.getLedgerEntry(buyer);
      assert.equal(sellerLedger.spot_sumQty, minted - 758n);
      assert.equal(buyerLedger.spot_sumQty, 720n);
      assert.equal((await proxy.getLedgerEntry(owners[0])).spot_sumQty, 7n);
      assert.equal(sellerLedger.ccys[0].balance, 103n);
      assert.equal(buyerLedger.ccys[0].balance, funded - 103n);
      assert.equal(await proxy.getSecToken_totalMintedQty(), minted);
      assert.equal(await proxy.getSecToken_totalBurnedQty(), 31n);
      assert.equal((await proxy.getSecTokenBatch(1)).burnedQty, 31n);
      assert.equal(await proxy.getAccountEntity(seller), 1n);
      assert.equal((await proxy.getFee(1, 1, 1, ZeroAddress)).fee_fixed, 7n);
      assert.deepEqual(Array.from(await proxy["getWhitelist()"]()), whitelist);
      assert.deepEqual(
        Array.from(await proxy["getWhitelist(uint256,uint256)"](0, 2)),
        [buyer, owners[0]],
      );
      assert.deepEqual(
        Array.from(await proxy["getWhitelist(uint256,uint256)"](2, 1)),
        [seller],
      );
      const hash = await proxy.getLedgerHashcode(1, 0);
      const maxId = await proxy.getSecToken_MaxId();
      const batch = (await proxy.getSecTokenBatch(1)).toArray(true);
      const ledgers = await Promise.all(
        whitelist.map(async (addr) =>
          (await proxy.getLedgerEntry(addr)).toArray(true),
        ),
      );
      await replaceFacet(
        ethers,
        artifacts,
        wallet,
        journal,
        manifest,
        "StLedgerFacet",
      );
      assert.equal(await proxy.getLedgerHashcode(1, 0), hash);
      assert.equal(await proxy.getSecToken_MaxId(), maxId);
      assert.deepEqual((await proxy.getSecTokenBatch(1)).toArray(true), batch);
      assert.deepEqual(
        await Promise.all(
          whitelist.map(async (addr) =>
            (await proxy.getLedgerEntry(addr)).toArray(true),
          ),
        ),
        ledgers,
      );
      assert.deepEqual(Array.from(await proxy["getWhitelist()"]()), whitelist);
      assert.deepEqual(Array.from(await proxy.getOwners()), owners);
      assert.equal(await proxy.getContractSeal(), true);
      assert.equal((await proxy.getFee(1, 1, 1, ZeroAddress)).fee_fixed, 7n);
    } finally {
      await journal.close();
      await connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
