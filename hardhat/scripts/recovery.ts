import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Contract,
  keccak256,
  type Signer,
  toUtf8Bytes,
  ZeroAddress,
} from "ethers";
import { artifacts, network } from "hardhat";
import { deployCommodity } from "./deploy-commodity.ts";
import type { LocalJournal } from "./local-journal.ts";

// JSON objects are ABI-shaped. Never convert contract integers through Number.
// biome-ignore lint/suspicious/noExplicitAny: Dynamic ethers ABI values are validated by encoding and full EDR replay before restore.
type AbiValue = any;
type Row = Record<string, AbiValue>;
export type RecoverySnapshot = { ledgerHash: string; info: Row; data: Row };
function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size));
  return result;
}
async function readBatches<T, R>(items: T[], read: (item: T) => Promise<R>) {
  const result: R[] = [];
  for (const group of chunks(items, 50))
    result.push(...(await Promise.all(group.map(read))));
  return result;
}
function plain(value: AbiValue): AbiValue {
  if (typeof value === "bigint") return value.toString();
  if (value?.toObject) {
    if (value.length === 0) return [];
    try {
      return plain(value.toObject());
    } catch {
      return Array.from(value).map(plain);
    }
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
    );
  return value;
}
const digest = (value: unknown) =>
  keccak256(toUtf8Bytes(JSON.stringify(value)));
const uint = (v: unknown) => {
  assert.equal(typeof v, "string", "Integers must be decimal strings");
  assert.match(v as string, /^(0|[1-9][0-9]*)$/);
  return BigInt(v as string);
};

// A legacy file alone cannot prove which hash algorithm produced ledgerHash.
// The caller must separately obtain the source's getLedgerHashcode(1,0), using
// the same owner/caller as recovery. Offchain hashes are never accepted as proof.
export function normalizeLegacyRecovery(
  input: RecoverySnapshot,
  verifiedOnchainHash: string,
): RecoverySnapshot {
  assert.ok(
    input.info.hashMod === undefined ||
      input.info.hashMod === "1" ||
      input.info.hashMod === "10",
    "Unsupported hash partition count",
  );
  assert.ok(
    input.info.contractType === 0 || input.info.contractType === "0",
    "COMMODITY only; cashflow recovery was never supported",
  );
  assert.equal(
    input.ledgerHash.toLowerCase(),
    verifiedOnchainHash.toLowerCase(),
    "Requires independently verified onchain hash, not the defective legacy offchain hash",
  );
  function integers(value: AbiValue): AbiValue {
    if (typeof value === "number") {
      assert.ok(
        Number.isSafeInteger(value),
        "Unsafe legacy Number; recover original decimal string",
      );
      return String(value);
    }
    if (Array.isArray(value)) return value.map(integers);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, integers(v)]),
      );
    return value;
  }
  const data = integers(input.data);
  if (
    data.entitiesWithFeeOwners === undefined &&
    data.accountEntities === undefined
  ) {
    assert.ok(input.info.owners?.[0], "Legacy default entity needs owners[0]");
    data.entitiesWithFeeOwners = [{ id: "1", addr: input.info.owners[0] }];
    data.accountEntities = data.whitelistAddresses.map(() => "1");
  } else {
    assert.ok(
      data.entitiesWithFeeOwners && data.accountEntities,
      "Partial entity metadata is unsupported",
    );
  }
  assert.equal(
    (data.transferedFullSecTokensEvents ?? []).length,
    0,
    "Historical transfer event overrides unsupported: provide exact globalSecTokens and onchain hash",
  );
  delete data.transferedFullSecTokensEvents;
  return {
    ledgerHash: verifiedOnchainHash,
    info: {
      format: "local-onchain-v1",
      contractType: "0",
      owners: input.info.owners,
      name: input.info.name,
      version: input.info.version,
      symbol: input.info.symbol,
      unit: input.info.unit,
      decimals: String(input.info.decimals),
      ...(input.info.hashMod === "10" ? { hashMod: "10" } : {}),
    },
    data,
  };
}
export async function captureRecovery(
  proxy: Contract,
  hashMod: 1 | 10 = 1,
): Promise<RecoverySnapshot> {
  assert.ok(hashMod === 1 || hashMod === 10);
  assert.equal(await proxy.getContractType(), 0n, "COMMODITY only");
  assert.equal(await proxy.getContractSeal(), true, "Capture a sealed source");
  const whitelistAddresses = plain(await proxy["getWhitelist()"]());
  const ledgerOwners = plain(await proxy.getLedgerOwners());
  const entitiesWithFeeOwners = plain(
    await proxy.getAllEntitiesWithFeeOwners(),
  );
  const ccyTypes = plain((await proxy.getCcyTypes()).ccyTypes);
  const tokenTypes = plain((await proxy.getSecTokenTypes()).tokenTypes);
  const ledgers = [];
  const ledgerOwnersFees = [];
  async function fees(
    kind: number,
    types: Row[],
    entity: string,
    owner: string,
  ) {
    return readBatches(types, async (type) =>
      plain(await proxy.getFee(kind, entity, type.id, owner)),
    );
  }
  for (const owner of ledgerOwners) {
    ledgers.push(plain(await proxy.getLedgerEntry(owner)));
    ledgerOwnersFees.push({
      currencies: await fees(0, ccyTypes, "0", owner),
      tokens: await fees(1, tokenTypes, "0", owner),
    });
  }
  const ccyFees: Row[] = [],
    tokenFees: Row[] = [],
    batches: Row[] = [],
    globalSecTokens: Row[] = [];
  for (const [kind, types, output] of [
    [0, ccyTypes, ccyFees],
    [1, tokenTypes, tokenFees],
  ] as const)
    for (const type of types)
      output.push(
        ...(await readBatches(entitiesWithFeeOwners as Row[], async (entity) =>
          plain(await proxy.getFee(kind, entity.id, type.id, ZeroAddress)),
        )),
      );
  const maxBatch = await proxy.getSecTokenBatch_MaxId();
  const maxToken = await proxy.getSecToken_MaxId();
  assert.ok(
    maxBatch <= 10000n && maxToken <= 10000n,
    "Bounded capture: at most 10000 IDs",
  );
  const batchIds = Array.from({ length: Number(maxBatch) }, (_, i) =>
    BigInt(i + 1),
  );
  batches.push(
    ...(await readBatches(batchIds, async (id) =>
      plain(await proxy.getSecTokenBatch(id)),
    )),
  );
  const owned = new Set(
    ledgers.flatMap((l) => l.tokens.map((t: Row) => t.stId)),
  );
  const tokenIds = Array.from({ length: Number(maxToken) }, (_, i) =>
    BigInt(i + 1),
  ).filter((id) => !owned.has(String(id)));
  globalSecTokens.push(
    ...(await readBatches(tokenIds, async (id) =>
      plain(await proxy.getSecToken(id)),
    )),
  );
  const hashes: string[] = [];
  for (let n = 0; n < hashMod; n++)
    hashes.push(await proxy.getLedgerHashcode(hashMod, n));
  return {
    ledgerHash: hashes.sort().join(","),
    info: {
      format: "local-onchain-v1",
      ...(hashMod === 10 ? { hashMod: "10" } : {}),
      contractType: "0",
      owners: plain(await proxy.getOwners()),
      name: await proxy.name(),
      version: await proxy.version(),
      symbol: await proxy.symbol(),
      unit: await proxy.unit(),
      decimals: String(await proxy.decimals()),
    },
    data: {
      entitiesWithFeeOwners,
      accountEntities: plain(
        await proxy.getAccountEntityBatch(whitelistAddresses),
      ),
      whitelistAddresses,
      ledgerOwners,
      ledgers,
      ledgerOwnersFees,
      ccyTypes,
      tokenTypes,
      ccyFees,
      tokenFees,
      batches,
      globalSecTokens,
      secTokenBaseId: String(await proxy.getSecToken_BaseId()),
      secTokenMintedCount: String(maxToken),
      secTokenMintedQty: String(await proxy.getSecToken_totalMintedQty()),
      secTokenBurnedQty: String(await proxy.getSecToken_totalBurnedQty()),
    },
  };
}

export function planRecovery(
  snapshot: RecoverySnapshot,
): [string, unknown[]][] {
  assert.equal(
    snapshot.info.contractType,
    "0",
    "CASHFLOW_BASE/CONTROLLER have no supported recovery",
  );
  assert.equal(
    snapshot.info.format,
    "local-onchain-v1",
    "Legacy hash provenance and futures overrides are not certified; normalize with an independently verified onchain hash",
  );
  const hashMod = snapshot.info.hashMod ?? "1";
  assert.ok(
    hashMod === "1" || hashMod === "10",
    "Unsupported hash partition count",
  );
  const hashes = snapshot.ledgerHash.split(",");
  assert.equal(hashes.length, Number(hashMod));
  for (const hash of hashes) assert.match(hash, /^0x[0-9a-f]{64}$/i);
  assert.deepEqual(
    hashes,
    [...hashes].sort(),
    "Canonical partition order required",
  );
  const d = snapshot.data;
  assert.ok(
    uint(d.secTokenMintedCount) <= 10000n && d.batches.length <= 10000,
    "Bounded recovery: at most 10000 token/batch IDs",
  );
  uint(d.secTokenBaseId);
  uint(d.secTokenMintedQty);
  uint(d.secTokenBurnedQty);
  assert.equal(d.accountEntities.length, d.whitelistAddresses.length);
  assert.equal(d.ledgers.length, d.ledgerOwners.length);
  assert.equal(d.ledgerOwnersFees.length, d.ledgerOwners.length);
  assert.equal(
    new Set(d.whitelistAddresses.map((a: string) => a.toLowerCase())).size,
    d.whitelistAddresses.length,
  );
  assert.equal(
    new Set(d.ledgerOwners.map((a: string) => a.toLowerCase())).size,
    d.ledgerOwners.length,
  );
  assert.ok(
    d.tokenTypes.every((t: Row) => uint(t.settlementType) === 1n),
    "Futures overrides cannot be recovered by LoadLib",
  );
  const plan: [string, unknown[]][] = [];
  for (const group of chunks(d.whitelistAddresses, 100))
    plan.push(["whitelistMany", [group]]);
  for (const group of chunks(d.entitiesWithFeeOwners, 20))
    plan.push(["createEntityBatch", [group]]);
  for (const [i, c] of d.ccyTypes.entries()) {
    assert.equal(uint(c.id), BigInt(i + 1));
    plan.push(["addCcyType", [c.name, c.unit, c.decimals]]);
  }
  for (const [i, t] of d.tokenTypes.entries()) {
    assert.equal(uint(t.id), BigInt(i + 1));
    plan.push([
      "addSecTokenType",
      [t.name, t.settlementType, t.ft, t.cashflowBaseAddr],
    ]);
  }
  for (const [i, b] of d.batches.entries())
    assert.equal(uint(b.id), BigInt(i + 1));
  for (const group of chunks(d.batches as Row[], 6))
    plan.push(["loadSecTokenBatch", [group, group.at(-1)?.id]]);
  const assigned = new Set<string>();
  const tokens = new Set<string>();
  const ledgerEntries: unknown[][] = [];
  const loadedTokens: Row[] = [];
  for (const [i, owner] of d.ledgerOwners.entries()) {
    const index = d.whitelistAddresses.indexOf(owner);
    assert.ok(index >= 0, "Ledger owner must be whitelisted");
    const entity = d.accountEntities[index];
    assert.ok(uint(entity) > 0n, "Ledger requires a nonzero entity");
    assigned.add(owner);
    const l = d.ledgers[i];
    ledgerEntries.push([
      owner,
      l.ccys,
      l.spot_sumQtyMinted,
      l.spot_sumQtyBurned,
      entity,
    ]);
    for (const t of l.tokens) {
      assert.ok(!tokens.has(t.stId), "Duplicate token ID");
      tokens.add(t.stId);
      loadedTokens.push({ ...t, ledgerEntryOwner: owner });
    }
  }
  for (const group of chunks(ledgerEntries, 20))
    plan.push(["createLedgerEntryBatch", [group]]);
  const assignments: Row[] = [];
  for (const [i, addr] of d.whitelistAddresses.entries())
    if (!assigned.has(addr) && uint(d.accountEntities[i]) > 0n)
      assignments.push({ id: d.accountEntities[i], addr });
  for (const group of chunks(assignments, 50))
    plan.push(["setAccountEntityBatch", [group]]);
  for (const t of d.globalSecTokens) {
    assert.ok(!tokens.has(t.stId), "Duplicate global token ID");
    tokens.add(t.stId);
    loadedTokens.push({ ...t, ledgerEntryOwner: ZeroAddress });
  }
  for (const group of chunks(loadedTokens, 20))
    plan.push(["addSecTokenBatch", [group]]);
  plan.push([
    "setTokenTotals",
    [
      d.secTokenBaseId,
      d.secTokenMintedCount,
      d.secTokenMintedQty,
      d.secTokenBurnedQty,
    ],
  ]);
  for (const [types, fees, method] of [
    [d.ccyTypes, d.ccyFees, "setFee_CcyType"],
    [d.tokenTypes, d.tokenFees, "setFee_TokType"],
  ] as const) {
    assert.equal(fees.length, types.length * d.entitiesWithFeeOwners.length);
    const feeRows: unknown[][] = [];
    for (const [i, type] of types.entries())
      for (const [j, entity] of d.entitiesWithFeeOwners.entries())
        feeRows.push([
          entity.id,
          type.id,
          ZeroAddress,
          fees[i * d.entitiesWithFeeOwners.length + j],
        ]);
    for (const [i, owner] of d.ledgerOwners.entries()) {
      const overrides =
        d.ledgerOwnersFees[i][
          method === "setFee_CcyType" ? "currencies" : "tokens"
        ];
      assert.equal(overrides.length, types.length);
      for (const [j, type] of types.entries()) {
        const fee = overrides[j];
        // SpotFeeLib derives fee-set flags from numeric fields. Avoid creating empty ledgers.
        if (Object.values(fee).some((v) => v !== "0" && v !== false))
          feeRows.push(["0", type.id, owner, fee]);
      }
    }
    for (const group of chunks(feeRows, 20))
      plan.push([
        `${method}Batch`,
        method === "setFee_CcyType"
          ? [group]
          : [0, 1, 2, 3].map((column) => group.map((row) => row[column])),
      ]);
  }
  plan.push(["sealContract", []]);
  return plan;
}

export async function restoreRecovery(
  proxy: Contract,
  snapshot: RecoverySnapshot,
  journal: LocalJournal,
  directory: string,
  stopAfter = Infinity,
) {
  const provider = proxy.runner?.provider;
  assert.ok(provider && "send" in provider);
  assert.equal(
    (await provider.getNetwork()).chainId,
    31337n,
    "Local chain only",
  );
  const rpc = provider as typeof provider & {
    send(method: string, args: unknown[]): Promise<AbiValue>;
  };
  await rpc.send("hardhat_metadata", []);
  const plan = planRecovery(snapshot);
  assert.equal(await proxy.getContractType(), 0n, "COMMODITY target only");
  assert.equal(await proxy.readOnly(), false, "Target must be writable");
  assert.ok(
    proxy.runner && "getAddress" in proxy.runner,
    "Use the recovery owner signer",
  );
  assert.equal(
    await (proxy.runner as Signer).getAddress(),
    (await proxy.getOwners())[0],
    "Hash verification requires owners[0] as caller",
  );
  const requests = plan.map(([method, args]) => ({
    to: String(proxy.target),
    data: proxy.interface.encodeFunctionData(method, args),
  }));
  const binding = digest({
    snapshot,
    target: proxy.target,
    metadata: (await rpc.send("hardhat_metadata", [])).instanceId,
  });
  const path = join(directory, "recovery-preflight.json");
  let saved: string | undefined;
  try {
    saved = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  async function verify() {
    assert.deepEqual(
      await captureRecovery(proxy, snapshot.info.hashMod === "10" ? 10 : 1),
      snapshot,
      "Exact public recovery state mismatch",
    );
  }
  if (saved) assert.equal(saved, binding, "Recovery intent/chain changed");
  else {
    assert.equal(await proxy.getContractSeal(), false, "Target must be fresh");
    assert.equal(await proxy.getLedgerOwnerCount(), 0n);
    assert.equal((await proxy["getWhitelist()"]()).length, 0);
    assert.equal((await proxy.getAllEntitiesWithFeeOwners()).length, 0);
    assert.equal((await proxy.getCcyTypes()).ccyTypes.length, 0);
    assert.equal((await proxy.getSecTokenTypes()).tokenTypes.length, 0);
    assert.equal(await proxy.getSecToken_MaxId(), 0n);
    assert.equal(await proxy.getSecTokenBatch_MaxId(), 0n);
    // Rehearse on a separate real EDR instance. A failed or killed preflight
    // cannot mutate the target, unlike a snapshot/revert on the target chain.
    const rehearsal = await network.create("localRehearsal");
    try {
      const owner = (await proxy.getOwners())[0];
      await rehearsal.ethers.provider.send("hardhat_setBalance", [
        owner,
        "0x3635c9adc5dea00000",
      ]);
      const signer = await rehearsal.ethers.getImpersonatedSigner(owner);
      // This transport mines real staging transactions. Only the eventual
      // target writes use the durable, signed openLocalJournal supplied above.
      const transport: LocalJournal = {
        async send(_key, request) {
          const receipt = await (await signer.sendTransaction(request)).wait();
          assert.ok(receipt && receipt.status === 1);
          return receipt;
        },
        async close() {},
      };
      const deployment = await deployCommodity(
        rehearsal.ethers,
        artifacts,
        signer,
        transport,
        {
          owners: Array.from(await proxy.getOwners()),
          custodyType: Number(await proxy.custodyType()) as 0 | 1,
          name: await proxy.name(),
          version: await proxy.version(),
          symbol: await proxy.symbol(),
          unit: await proxy.unit(),
          gitCommit: "local-recovery-preflight",
        },
      );
      const staged = new Contract(deployment.proxy, deployment.abi, signer);
      for (const [method, args] of plan)
        await (await staged.getFunction(method)(...args)).wait();
      assert.deepEqual(
        await captureRecovery(staged, snapshot.info.hashMod === "10" ? 10 : 1),
        snapshot,
        "Unsupported snapshot fields or ledger/hash mismatch in preflight",
      );
    } finally {
      await rehearsal.close();
    }
    await writeFile(path, binding, { flag: "wx", mode: 0o600 });
  }
  for (const [i, request] of requests.entries()) {
    if (i === stopAfter)
      throw new Error("Recovery interrupted at requested transaction boundary");
    await journal.send(`recovery-${i}`, request);
  }
  await verify();
}
