import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("source preparation preserves inputs and rejects unreviewed variants and stale files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stm-compile-"));
  try {
    await mkdir(join(root, "sol/contracts"), { recursive: true });
    await mkdir(join(root, "hardhat/scripts"), { recursive: true });
    await cp(
      new URL("../scripts/prepare.ts", import.meta.url),
      join(root, "hardhat/scripts/prepare.ts"),
    );
    const source = join(root, "sol/contracts/Example.sol");
    const text = "pragma solidity 0.8.5;\r\ncontract Example {}\r\n";
    await writeFile(source, text);
    const prepare = () =>
      spawnSync(process.execPath, [join(root, "hardhat/scripts/prepare.ts")], {
        encoding: "utf8",
      });
    assert.equal(prepare().status, 0);
    assert.equal(await readFile(source, "utf8"), text);
    assert.equal(
      await readFile(join(root, "hardhat/contracts/Example.sol"), "utf8"),
      text,
    );
    await writeFile(
      source,
      `//#if process.env.CONTRACT_TYPE === 'COMMODITY'\n${text}`,
    );
    const variant = prepare();
    assert.notEqual(variant.status, 0);
    assert.match(variant.stderr, /reviewed variant/);
    await writeFile(source, text);
    await writeFile(join(root, "hardhat/contracts/Stale.sol"), text);
    const stale = prepare();
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale generated source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
