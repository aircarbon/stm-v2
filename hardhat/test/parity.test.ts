import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import solc from "solc";

test("parity accepts source-name metadata changes but rejects executable and compiler-setting changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "stm-parity-"));
  try {
    const tooling = join(root, "hardhat");
    const builds = join(tooling, "artifacts/build-info");
    await mkdir(builds, { recursive: true });
    await mkdir(join(tooling, "scripts"));
    await mkdir(join(root, "sol/contracts"), { recursive: true });
    await symlink(
      fileURLToPath(new URL("../node_modules", import.meta.url)),
      join(tooling, "node_modules"),
      "dir",
    );
    await cp(
      new URL("../scripts/parity.ts", import.meta.url),
      join(tooling, "scripts/parity.ts"),
    );
    const content =
      "pragma solidity 0.8.5; contract Counter { uint256 public value; constructor(uint256 initial) { require(initial > 9, 'too small'); value = initial; } }";
    await writeFile(join(root, "sol/contracts/Counter.sol"), content);
    const input = {
      language: "Solidity",
      sources: { "project/contracts/Counter.sol": { content } },
      settings: {
        optimizer: { enabled: true, runs: 1 },
        evmVersion: "byzantium",
        outputSelection: { "*": { "*": ["abi", "evm", "storageLayout"] } },
      },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const save = async () => {
      await writeFile(
        join(builds, "fixture.json"),
        JSON.stringify({ solcVersion: "0.8.5", input }),
      );
      await writeFile(
        join(builds, "fixture.output.json"),
        JSON.stringify({ output }),
      );
    };
    const parity = () =>
      spawnSync(process.execPath, [join(tooling, "scripts/parity.ts")], {
        encoding: "utf8",
      });
    await save();
    const valid = parity();
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /passed for 1 contracts/);
    const bytecode =
      output.contracts["project/contracts/Counter.sol"].Counter.evm.bytecode;
    const original = bytecode.object;
    bytecode.object = `00${original.slice(2)}`;
    await save();
    const changedCode = parity();
    assert.notEqual(changedCode.status, 0);
    assert.match(changedCode.stderr, /bytecode executable/);
    bytecode.object = original;
    input.settings.optimizer.runs = 200;
    await save();
    assert.notEqual(parity().status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
