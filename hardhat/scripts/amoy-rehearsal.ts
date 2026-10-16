import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Contract, HDNodeWallet, keccak256 } from "ethers";
import { artifacts, network } from "hardhat";
import { openAmoyJournal, recoverySource } from "./amoy-journal.ts";
import {
  type CommodityConfig,
  deployAmoyCommodity,
  deployCommodity,
} from "./deploy-commodity.ts";
import type { LocalJournal } from "./local-journal.ts";
import {
  captureRecovery,
  planRecovery,
  type RecoverySnapshot,
} from "./recovery.ts";
import { setupCommodity } from "./setup-commodity.ts";

const [mode, evidenceDirectory, revision, confirmation] = process.argv.slice(2);
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
let phase = "arguments";

async function main() {
  assert.ok(["stage", "setup", "restore"].includes(mode));
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    revision,
    "Use the current committed revision",
  );
  assert.equal(
    execFileSync("git", ["status", "--porcelain", "--", "."], {
      encoding: "utf8",
    }).trim(),
    "",
    "Commit execution code before staging or writing",
  );
  const directory = resolve(evidenceDirectory);
  assert.ok(
    directory.includes("/.amp/in/"),
    "Use a private ignored evidence directory",
  );
  const raw = await readFile(
    join(directory, "acx-source-snapshot.json"),
    "utf8",
  );
  const snapshot: RecoverySnapshot = JSON.parse(raw);
  const baseline = JSON.parse(
    await readFile(join(directory, "acx-baseline.json"), "utf8"),
  );
  assert.equal(baseline.target, recoverySource);
  assert.equal(baseline.chainId, "80002");
  assert.equal(snapshot.info.owners[0], baseline.signer);
  const digest = sha256(raw);
  const config: CommodityConfig = {
    owners: snapshot.info.owners,
    custodyType: 0,
    name: snapshot.info.name,
    version: snapshot.info.version,
    symbol: snapshot.info.symbol,
    unit: snapshot.info.unit,
    gitCommit: revision,
  };
  const plan = planRecovery(snapshot);
  const stagePath = join(directory, "acx-stage.json");
  if (mode === "stage") {
    phase = "local-replay";
    const local = await network.create({
      network: "localRehearsal",
      override: { hardfork: "cancun", blockGasLimit: 500000000 },
    });
    try {
      await local.ethers.provider.send("hardhat_setBalance", [
        baseline.signer,
        "0x3635c9adc5dea00000",
      ]);
      const signer = await local.ethers.getImpersonatedSigner(baseline.signer);
      let gasUsed = 0n,
        maxGas = 0n;
      const transport: LocalJournal = {
        async send(key, request) {
          phase = `local-${key}`;
          const receipt = await (await signer.sendTransaction(request)).wait();
          assert.ok(receipt && receipt.status === 1);
          assert.ok(
            (receipt.gasUsed * 12n) / 10n <= 30000000n,
            "Split the oversized recovery transaction before UAT",
          );
          gasUsed += receipt.gasUsed;
          if (receipt.gasUsed > maxGas) maxGas = receipt.gasUsed;
          return receipt;
        },
        async close() {},
      };
      const manifest = await deployCommodity(
        local.ethers,
        artifacts,
        signer,
        transport,
        config,
      );
      const proxy = new Contract(manifest.proxy, manifest.abi, signer);
      for (const [i, [method, args]] of plan.entries()) {
        await transport.send(`recovery-${i}-${method}`, {
          to: manifest.proxy,
          data: proxy.interface.encodeFunctionData(method, args),
        });
        if (i % 100 === 0) console.log(`Local replay ${i}/${plan.length}`);
      }
      phase = "local-comparison";
      const reader = new Contract(manifest.proxy, manifest.abi, {
        provider: local.ethers.provider,
        call: (tx) =>
          local.ethers.provider.call({
            ...tx,
            from: baseline.signer,
            gasLimit: 500000000,
          }),
      });
      assert.deepEqual(
        await captureRecovery(reader, snapshot.info.hashMod === "10" ? 10 : 1),
        snapshot,
        "Source cannot be reproduced by this build",
      );
      await writeFile(
        stagePath,
        JSON.stringify({
          snapshot: digest,
          revision,
          gasUsed: String(gasUsed),
          maxGas: String(maxGas),
          transactionCount: plan.length + manifest.contracts.length + 4,
          comparison: "exact",
        }),
        { mode: 0o600 },
      );
      console.log("Local replay and exact public-state comparison passed");
    } finally {
      await local.close();
    }
    return;
  }
  assert.equal(confirmation, "--execute-amoy", "Explicit write flag required");
  const endpoint = process.env.ACX_UAT_RPC_URL?.trim();
  const mnemonic = process.env.UAT_MNEMONIC?.trim().replace(/\s+/g, " ");
  assert.ok(endpoint && mnemonic, "Secrets not injected");
  process.env.ACX_UAT_RPC_URL = endpoint;
  phase = "amoy-preflight";
  const connection = await network.create("acxUat");
  let journal: Awaited<ReturnType<typeof openAmoyJournal>> | undefined;
  try {
    const provider = connection.ethers.provider;
    assert.equal((await provider.getNetwork()).chainId, 80002n);
    assert.equal(
      (await provider.getBlock(baseline.blockNumber))?.hash,
      baseline.blockHash,
    );
    assert.equal(
      keccak256(await provider.getCode(recoverySource)),
      baseline.codeHash,
    );
    const accounts = Array.from({ length: 30 }, (_, i) =>
      HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${i}`),
    );
    const signer = accounts[0].connect(provider);
    assert.deepEqual(
      accounts.slice(0, 10).map((a) => a.address),
      config.owners,
      "Source owners differ from UAT mnemonic",
    );
    const source = new Contract(
      recoverySource,
      [
        "function custodyType() view returns(uint8)",
        "function getOwners() view returns(address[])",
      ],
      provider,
    );
    assert.equal(await source.custodyType(), 0n);
    assert.deepEqual(Array.from(await source.getOwners()), config.owners);
    const budget = (mode === "setup" ? 3n : 100n) * 10n ** 18n;
    if (mode === "restore") {
      const staged = JSON.parse(await readFile(stagePath, "utf8"));
      assert.equal(staged.snapshot, digest);
      assert.equal(staged.revision, revision);
      assert.equal(staged.comparison, "exact");
      const fee = (await provider.getFeeData()).maxFeePerGas;
      assert.ok(
        fee && ((BigInt(staged.gasUsed) * 12n) / 10n) * fee <= budget,
        "Total replay fee estimate exceeds budget",
      );
    } else {
      config.name = "UAT_HARDHAT_USD_20261016";
    }
    const runDirectory = join(directory, `amoy-${mode}`);
    await mkdir(runDirectory, { recursive: true, mode: 0o700 });
    const intent = JSON.stringify({
      mode,
      snapshot: digest,
      revision,
      source: recoverySource,
      config,
    });
    const intentPath = join(runDirectory, "intent.json");
    try {
      assert.equal(
        await readFile(intentPath, "utf8"),
        intent,
        "Run intent changed",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(intentPath, intent, { mode: 0o600, flag: "wx" });
    }
    journal = await openAmoyJournal(provider, signer, runDirectory, budget);
    const transport: LocalJournal = {
      async send(key, request) {
        phase = key;
        assert.ok(journal);
        const receipt = await journal.send(key, request);
        console.log(
          JSON.stringify({
            key,
            hash: receipt.hash,
            block: receipt.blockNumber,
          }),
        );
        return receipt;
      },
      async close() {},
    };
    const manifest = await deployAmoyCommodity(
      connection.ethers,
      artifacts,
      signer,
      transport,
      config,
    );
    await writeFile(
      join(runDirectory, "manifest.json"),
      JSON.stringify(manifest),
      { mode: 0o600 },
    );
    const proxy = new Contract(manifest.proxy, manifest.abi, signer);
    let result: unknown;
    if (mode === "setup") {
      await assert.rejects(
        proxy
          .connect(accounts[29].connect(provider))
          .getFunction("sealContract")
          .staticCall(),
        /Restricted/,
      );
      result = await setupCommodity(
        proxy,
        accounts.map((a) => a.address),
        transport,
      );
    } else {
      for (const [i, [method, args]] of plan.entries())
        await transport.send(`recovery-${i}`, {
          to: manifest.proxy,
          data: proxy.interface.encodeFunctionData(method, args),
        });
      phase = "restored-comparison";
      const block = await provider.getBlockNumber();
      const reader = new Contract(manifest.proxy, manifest.abi, {
        provider,
        call: (tx) =>
          provider.call({
            ...tx,
            from: signer.address,
            blockTag: block,
            gasLimit: 500000000,
          }),
      });
      const restored = await captureRecovery(
        reader,
        snapshot.info.hashMod === "10" ? 10 : 1,
      );
      await writeFile(
        join(runDirectory, "restored.json"),
        JSON.stringify(restored),
        { mode: 0o600 },
      );
      assert.deepEqual(restored, snapshot, "Restored public state differs");
      result = { address: manifest.proxy, comparison: "exact", block };
    }
    await writeFile(
      join(runDirectory, "result.json"),
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(result));
  } finally {
    await journal?.close();
    await connection.close();
  }
}

try {
  await main();
} catch {
  // Provider errors can contain URLs, authorization and raw signed transactions.
  console.error(
    `Rehearsal stopped at ${phase}; inspect private evidence, do not bypass guards.`,
  );
  process.exitCode = 1;
}
