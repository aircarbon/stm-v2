import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Contract, getAddress, solidityPackedKeccak256 } from "ethers";
import type { LocalJournal } from "./local-journal.ts";

export type WhitelistRecovery = {
  info: { name: string; version: string };
  wlHash: string;
  count: number;
  whitelistAddresses: string[];
};

// web3 soliditySha3('', address), then soliditySha3(previousBytes32, address).
export function whitelistHash(addresses: string[]) {
  let hash = "";
  for (const address of addresses) {
    getAddress(address);
    hash = hash
      ? solidityPackedKeccak256(["bytes32", "address"], [hash, address])
      : solidityPackedKeccak256(["string", "address"], ["", address]);
  }
  return hash;
}

export async function captureWhitelist(
  proxy: Contract,
): Promise<WhitelistRecovery> {
  const whitelistAddresses = Array.from(
    await proxy["getWhitelist()"](),
  ) as string[];
  return {
    info: { name: await proxy.name(), version: await proxy.version() },
    wlHash: whitelistHash(whitelistAddresses),
    count: whitelistAddresses.length,
    whitelistAddresses,
  };
}

export async function restoreWhitelist(
  proxy: Contract,
  backup: WhitelistRecovery,
  journal: LocalJournal,
  directory: string,
) {
  assert.equal((await proxy.runner?.provider?.getNetwork())?.chainId, 31337n);
  assert.equal(backup.count, backup.whitelistAddresses.length);
  assert.equal(
    new Set(backup.whitelistAddresses.map((a) => getAddress(a))).size,
    backup.count,
  );
  assert.equal(whitelistHash(backup.whitelistAddresses), backup.wlHash);
  assert.equal(await proxy.getContractSeal(), false);
  const current: string[] = Array.from(await proxy["getWhitelist()"]());
  assert.deepEqual(
    current,
    backup.whitelistAddresses.slice(0, current.length),
    "Target whitelist must be an exact prefix",
  );
  const path = join(directory, "recovery-whitelist-intent.json");
  const intent = JSON.stringify({
    target: String(proxy.target),
    addresses: backup.whitelistAddresses,
  });
  try {
    assert.equal(
      await readFile(path, "utf8"),
      intent,
      "Whitelist intent changed",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    assert.equal(
      current.length,
      0,
      "First restore requires an empty whitelist",
    );
    await writeFile(path, intent, { flag: "wx", mode: 0o600 });
  }
  // Deliberately omit legacy restoreWL's generated extension to 5000 addresses.
  // Replay all fixed chunks: signed journal receipts, not current lengths, drive resume.
  for (let i = 0; i < backup.count; i += 100)
    await journal.send(`recovery-wl-${i}`, {
      to: String(proxy.target),
      data: proxy.interface.encodeFunctionData("whitelistMany", [
        backup.whitelistAddresses.slice(i, i + 100),
      ]),
    });
  const restored = await captureWhitelist(proxy);
  assert.deepEqual(restored.whitelistAddresses, backup.whitelistAddresses);
  assert.equal(restored.wlHash, backup.wlHash);
}
