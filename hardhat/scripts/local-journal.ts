import assert from "node:assert/strict";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/types";
import {
  keccak256,
  type Signer,
  Transaction,
  type TransactionRequest,
  toUtf8Bytes,
} from "ethers";

// Only for disposable Hardhat chains. Signed transactions are written before
// broadcast, so a restart reuses the same hash/nonce instead of signing twice.
export async function openLocalJournal(
  provider: HardhatEthersProvider,
  signer: Signer,
  directory: string,
) {
  assert.equal(
    (await provider.getNetwork()).chainId,
    31337n,
    "Local chain only",
  );
  await provider.send("hardhat_metadata", []);
  const address = await signer.getAddress();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, "writer.lock");
  const lock = await open(lockPath, "wx", 0o600);
  return {
    async send(key: string, request: TransactionRequest) {
      assert.match(key, /^[a-zA-Z0-9_-]+$/);
      const intent = {
        to: request.to ?? null,
        data: request.data ?? "0x",
        value: String(request.value ?? 0),
      };
      const digest = keccak256(toUtf8Bytes(JSON.stringify(intent)));
      const path = join(directory, `${key}.json`);
      let record: { digest: string; raw: string };
      try {
        record = JSON.parse(await readFile(path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const nonce = Number(
          BigInt(
            await provider.send("eth_getTransactionCount", [
              address,
              "pending",
            ]),
          ),
        );
        const raw = await signer.signTransaction(
          await signer.populateTransaction({
            ...request,
            nonce,
            chainId: 31337,
          }),
        );
        record = { digest, raw };
        const file = await open(path, "wx", 0o600);
        try {
          await file.writeFile(JSON.stringify(record));
          await file.sync();
        } finally {
          await file.close();
        }
      }
      assert.equal(record.digest, digest, `Changed deployment intent: ${key}`);
      const transaction = Transaction.from(record.raw);
      assert.equal(transaction.chainId, 31337n);
      assert.equal(transaction.from, address);
      assert.equal(transaction.to, intent.to);
      assert.equal(transaction.data, intent.data);
      assert.equal(transaction.value.toString(), intent.value);
      assert.ok(transaction.hash);
      let receipt = await provider.getTransactionReceipt(transaction.hash);
      if (!receipt) {
        const known = await provider.getTransaction(transaction.hash);
        const pending =
          known ?? (await provider.broadcastTransaction(record.raw));
        receipt = await pending.wait(1, 120000);
      }
      assert.equal(receipt?.status, 1, `Transaction failed: ${key}`);
      assert.ok(receipt);
      return receipt;
    },
    async close() {
      await lock.close();
      await unlink(lockPath);
    },
  };
}

export type LocalJournal = Awaited<ReturnType<typeof openLocalJournal>>;
