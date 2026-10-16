import assert from "node:assert/strict";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/types";
import {
  getAddress,
  type JsonRpcProvider,
  keccak256,
  type Signer,
  Transaction,
  type TransactionRequest,
  toUtf8Bytes,
} from "ethers";

export const recoverySource = "0x5Ec2f474500034AD6a1F8712586dc3A3aC10c384";

// Only creates contracts and calls contracts created earlier in this journal.
// No source upgrades, native transfers, shared DB access, or arbitrary targets.
export async function openAmoyJournal(
  provider: HardhatEthersProvider | JsonRpcProvider,
  signer: Signer,
  directory: string,
  budgetWei: bigint,
) {
  assert.equal(
    BigInt(await provider.send("eth_chainId", [])),
    80002n,
    "Amoy only",
  );
  assert.equal(signer.provider, provider, "Signer/provider mismatch");
  assert.ok(
    budgetWei > 0n && budgetWei <= 100n * 10n ** 18n,
    "Budget must be at most 100 POL",
  );
  const address = await signer.getAddress();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, "writer.lock");
  const lock = await open(lockPath, "wx", 0o600);
  async function close() {
    await lock.close();
    await unlink(lockPath);
  }
  async function save(path: string, value: unknown) {
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async function read(path: string) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  try {
    const bindingPath = join(directory, "binding.json");
    let binding = await read(bindingPath);
    if (!binding) {
      const latest = await provider.send("eth_getTransactionCount", [
        address,
        "latest",
      ]);
      const pending = await provider.send("eth_getTransactionCount", [
        address,
        "pending",
      ]);
      assert.equal(latest, pending, "Resolve pending transactions first");
      binding = {
        chainId: 80002,
        address,
        source: recoverySource,
        budget: String(budgetWei),
        startNonce: Number(BigInt(latest)),
      };
      await save(bindingPath, binding);
    }
    assert.equal(binding.chainId, 80002);
    assert.equal(binding.address, address);
    assert.equal(binding.source, recoverySource);
    assert.equal(binding.budget, String(budgetWei), "Journal budget changed");
    const targets = new Set<string>();
    let index = 0;
    let spent = 0n;
    return {
      async send(key: string, request: TransactionRequest) {
        assert.equal(
          BigInt(await provider.send("eth_chainId", [])),
          80002n,
          "Amoy only",
        );
        assert.equal(BigInt(request.value ?? 0), 0n, "No native transfers");
        const to = request.to ? getAddress(String(request.to)) : null;
        assert.notEqual(to, recoverySource, "Source is read-only");
        if (to)
          assert.ok(targets.has(to), "Target must be created in this journal");
        const data = String(request.data ?? "0x");
        const digest = keccak256(
          toUtf8Bytes(JSON.stringify({ key, to, data })),
        );
        const path = join(directory, `${String(index).padStart(5, "0")}.json`);
        let record = await read(path);
        if (!record) {
          const nonce = Number(
            BigInt(
              await provider.send("eth_getTransactionCount", [
                address,
                "pending",
              ]),
            ),
          );
          assert.equal(
            nonce,
            binding.startNonce + index,
            "Signer nonce changed outside this journal",
          );
          const estimate = await signer.estimateGas({ to, data });
          const gasLimit = (estimate * 12n) / 10n;
          const block = await provider.getBlock("latest");
          assert.ok(
            block && gasLimit <= block.gasLimit && gasLimit <= 30000000n,
            "Transaction exceeds gas budget",
          );
          const fees = await provider.getFeeData();
          assert.ok(fees.maxFeePerGas && fees.maxPriorityFeePerGas !== null);
          assert.ok(
            fees.maxFeePerGas <= 200000000000n,
            "Fee cap exceeds 200 gwei",
          );
          const maximumCost = gasLimit * fees.maxFeePerGas;
          assert.ok(
            spent + maximumCost <= budgetWei,
            "Journal fee budget exhausted",
          );
          assert.ok(
            (await provider.getBalance(address)) >= maximumCost,
            "Insufficient test funds",
          );
          const raw = await signer.signTransaction({
            to,
            data,
            value: 0,
            nonce,
            chainId: 80002,
            gasLimit,
            type: 2,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          });
          record = { key, digest, raw };
          await save(path, record);
        }
        assert.equal(record.digest, digest, "Transaction intent changed");
        const tx = Transaction.from(record.raw);
        assert.equal(tx.chainId, 80002n);
        assert.equal(tx.from, address);
        assert.equal(tx.nonce, binding.startNonce + index);
        assert.equal(tx.to, to);
        assert.equal(tx.data, data);
        assert.equal(tx.value, 0n);
        assert.ok(
          tx.hash &&
            tx.maxFeePerGas &&
            tx.gasLimit <= 30000000n &&
            tx.maxFeePerGas <= 200000000000n,
        );
        let receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt) {
          assert.ok(
            spent + tx.gasLimit * tx.maxFeePerGas <= budgetWei,
            "Journal fee budget exhausted",
          );
          const known = await provider.getTransaction(tx.hash);
          const pending =
            known ?? (await provider.broadcastTransaction(record.raw));
          receipt = await pending.wait(1, 180000);
        }
        assert.ok(receipt, "Receipt unresolved; reconcile before retry");
        // Receipts contain no signing material and can be used as review evidence.
        const receiptPath = join(
          directory,
          `${String(index).padStart(5, "0")}-receipt.json`,
        );
        if (!(await read(receiptPath)))
          await save(receiptPath, { key, ...receipt.toJSON() });
        assert.equal(receipt.status, 1, "Transaction reverted; stop");
        spent += receipt.gasUsed * receipt.gasPrice;
        if (receipt.contractAddress)
          targets.add(getAddress(receipt.contractAddress));
        index++;
        return receipt;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
