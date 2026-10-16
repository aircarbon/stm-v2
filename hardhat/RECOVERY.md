# Bounded local recovery

This is a **local COMMODITY recovery rehearsal**, not complete legacy recovery
equivalence. No script imports `sol/const.js`, the ORM, or an operational legacy
script. Do not use this code on UAT or a shared chain. `sol/` and its locks are
unchanged.

## Use

Use an ethers 6 `Contract` with the merged ABI from `deployCommodity`. Use the
owners[0] wallet for source hash reads and target writes. Open an
`openLocalJournal` in a private directory. Both deployments must be on chain
31337. Deploy a fresh target with the same owners, name, version, symbol and unit.

```ts
const backup = await captureRecovery(source);
await writeFile(backupPath, JSON.stringify(backup));
const saved = JSON.parse(await readFile(backupPath, "utf8"));
await restoreRecovery(target, saved, journal, journalDirectory);
```

These functions are exports from `scripts/recovery.ts`; they are not automatic
command-line entry points. They require explicit caller-selected contracts and
directories. Do not run legacy `restore.js`: its final helper call is broken.

`captureRecovery` stores `{ledgerHash, info, data}`. Integers in the state are
decimal strings. It reads batches and global tokens by bigint ID, including tokens
that no longer belong to a ledger after a full burn. Restore uses only public
type/entity/whitelist/fee setters and the permitted DataLoadableFacet operations:
`loadSecTokenBatch`, `createLedgerEntry`, `addSecTokenBatch`, and `setTokenTotals`.
There is no raw EVM state export/import.

The restore plan preserves ordered whitelist and ledger owners, token ID lists,
batch IDs, timestamps, metadata, originator fees, currency balances/reservations,
mint/burn totals, and off-ledger tokens. Exchange fees are type-major, then entity;
ledger fee overrides use their ledger owner. Exact public-state comparison checks
all these fields, not just a hash. This is important: the current onchain hash
uses entity 1 global fees, not all entity fees, and excludes some whitelist
positions/caller addresses. The separate ordered whitelist and full fee checks
cover those omissions.

## Preflight and restart

Before the first journalled write, the code encodes the whole plan, validates
array alignment/IDs, and deploys another real diamond on a **separate EDR
instance**. Every transaction and final comparison runs there first. It uses an
impersonated, locally funded owners[0] only on that disposable staging instance.
The target is not mutated during preflight, even if validation fails or the
process stops. A `finally` block closes the staging connection. The actual target
must be a fresh writable `deployCommodity` deployment from this build, with no
concurrent writer. Actual target transactions remain individually journalled;
this is not a multi-transaction atomic commit on an external node.

After successful preflight, an intent file binds the snapshot, target and EDR
instance. The existing signed journal persists each raw transaction before
broadcast. On a graceful interruption, close it and reopen the same directory;
call `restoreRecovery` with the same snapshot. Earlier signed transactions are
resolved by receipt and are not re-signed. Changed input or chain instance fails
closed. `stopAfter` is an explicit transaction-boundary interruption hook used in
the test. Do not delete or edit journal files. An ungraceful process crash can
leave `writer.lock`; confirm no writer is active before manual local cleanup.
Node/EDR restart persistence and power-loss durability are not certified.

## Legacy inputs and rejected cases

`normalizeLegacyRecovery(input, verifiedOnchainHash)` converts safe legacy numeric
values to strings. The second argument must be an independently obtained source
`getLedgerHashcode(1,0)` value with the recovery owner as caller. It must match the
file hash. It is not permission to substitute a legacy offchain hash. The old
offchain implementation has entity-fee indexing and `Number(stId)` defects; this
port does not reproduce them.

Only when **both** entity fields are absent does normalization create entity 1
with `info.owners[0]` and assign the ordered whitelist to it. Partial metadata is
an error. V2 preserves `entitiesWithFeeOwners: [{id,addr}]` and aligned
`accountEntities`, with no zero-to-one fallback for explicit entity data.

The following cases fail closed, or are outside the certified comparison:

- CASHFLOW_BASE and CASHFLOW_CONTROLLER: the existing full legacy backup producers
  explicitly support COMMODITY only. They have no existing supported recovery to
  port here. Both are rejected before restore transactions.
- Future settlement types: custom future margin/fee mappings have no supported
  LoadLib restore operation. They are rejected before rehearsal.
- Unsafe legacy JavaScript Numbers; missing/misaligned arrays; duplicate token or
  whitelist IDs; noncontiguous type/batch IDs; ledger accounts without a nonzero
  entity; ledgers outside the whitelist; malformed ABI values.
- Nonempty `transferedFullSecTokensEvents`: historical event-based overrides are
  not accepted. Supply exact global token state and a verified onchain hash.
- IDs above 10000 for the current maximum token or batch: capture is intentionally
  bounded. Quantities and totals above 2^53 are supported without Number conversion.
- Arbitrary old backup variants, absent info fields, stale global records and
  unsupported extra fields: the exact recapture must match in preflight. No field
  is silently ignored in the canonical `data` object.
- Custody configuration, read-only state, ERC20 allowances, deployment bytecode,
  entity-address enumeration order, event history, and future mappings are not in
  the snapshot comparison. Use the same deployment configuration. This is ledger
  recovery, not a claim to reproduce all contract storage or all future behavior.

There is no end-to-end test against a historical deployment or every old JSON
producer. Legacy normalization has focused assertions; legacy full equivalence
remains unproved. Old entity-free hash schemes may not match the modern target
hash; such files fail preflight rather than receiving a fabricated replacement
hash.

## Whitelist-only recovery

`scripts/recovery-whitelist.ts` reads/writes the legacy shape
`{info, wlHash, count, whitelistAddresses}`. `whitelistHash` hashes the empty
string plus first address, then each prior bytes32 hash plus next address. Order
is significant. `restoreWhitelist(target, backup, journal, directory)` validates
the entire input and an exact existing prefix, binds the complete intent, then
uses fixed 100-address journalled chunks. The first restore requires an empty
target whitelist. It does not seal the target or restore ledger state.

**The legacy generated extension to 5000 addresses is deliberately omitted.**
Only the saved addresses are written. Count and complete ordered list/hash are
checked after restore. Empty whitelist hashes remain the legacy empty string.

## Verification

Run with Node 24 in tmux session `hardhat`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/@biomejs/biome/bin/biome check scripts/recovery*.ts test/contracts/recovery*.ts
node node_modules/hardhat/dist/src/cli.js test mocha test/contracts/recovery.ts
```

The EDR test deploys two real diamonds. It writes/reads a JSON backup, restores it,
interrupts after eight journalled transactions, reopens the journal, completes
restore, and repeats restore without duplicating state. Data includes two token
types, two currencies, entities 1 and 7 with asymmetric fees, ordered whitelist,
quantities/funding above 2^53, metadata and nonzero originator fees, a transfer-split token fully burned off
ledger, and an owner fee override. Invalid variant/hash/value inputs leave the
target unchanged after preflight. The whitelist test checks order, invalid count,
repeat replay and no extension. A real PGlite registry is archived with
`dumpDataDir`, opened in a fresh engine, and checked for exact function rows and
idempotent deployment persistence. This does not certify production PostgreSQL
backup tooling or shared database recovery.
