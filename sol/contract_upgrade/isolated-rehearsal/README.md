# Isolated snapshot evidence and recovery primitives (draft)

**Not a complete migration tool. Do not deploy a live rehearsal with this draft.**
Only the read-only backup CLI is exposed. `assertRestorable` rejects every current
getter-evidence snapshot. There is no override, deployment CLI, or full-state
restore-plan generator. Legacy deployment and restore scripts remain unchanged.

## Why not use the legacy scripts directly?

From `sol`, their normal backup invocation is:

```sh
INSTANCE_ID=<instance> truffle exec contract_upgrade/backup.js \
  -s=<address-without-0x> -h=offchain --network=<network>
```

`backup.js` reads contract getters through `utils.js:createBackupData`, including
types, entities, whitelist, ledger entries, batches, tokens, totals and fees.
It does not obtain a consistent database snapshot. Its owner/fee cache and
unbounded latest-block calls cannot prove pinned state. `-h=offchain` changes
hash calculation, not the data source, and does not pin reads. Truffle and
`const.js` also load environment/signing configuration. Output goes inside this
repository. The matching `restore_v2.js` seals before its final comparison,
expands the whitelist and uses legacy environment/ORM dependencies. Its ledger
hash is not a complete storage comparison. Do not feed this new schema to it.

## Read-only evidence capture

```sh
npm ci --ignore-scripts
npm run backup -- --source=<address> --chain=<decimal-chain-id> \
  --abi=<combined-getter-abi.json> --out=<private-directory>/snapshot.json
```

Supply `STM_READ_RPC_URL` through the process environment using the approved
local credential mechanism. Do not paste credentials in command arguments or
shell history. The command never loads instance files, signer material or ORM.
Use a trusted, read-only archive RPC that implements the `finalized` tag. There
is no fallback to `latest` or to an assumed confirmation count. Provider finality
semantics must be independently established before operational use.

The ABI must combine the deployed facets' getters and match the source code.
Required missing getters or RPC errors stop capture. Every getter and code read
uses the recorded block number. The chain ID and canonical block hash are checked
before and after capture. Owners and fees come directly from that block, never
from a cached file. Quantities are decimal strings, not JavaScript numbers.
Call counts, response sizes, array lengths, token spans and time are bounded.
`capture` accepts explicit bounds; exceeding them stops, never truncates.

The schema records source chain/address/block/hash, named getter arguments and
results, source/facet bytecode with hashes, and a field-level coverage report.
Object keys are sorted for SHA-256; array order is preserved. The output envelope
contains the snapshot checksum. The CLI creates a new file with mode 0600,
refuses output under this repository, and rereads the bytes to verify the write.
Keep its private parent directory on durable storage with access restricted to
the operator. No output should be committed or attached to a public issue.

## Required state and remaining gaps

`state.ts:REQUIRED_GROUPS` is the explicit coverage policy. “Observed” means a
direct getter was captured; it does not certify byte-for-byte storage coverage.

| Group | Evidence | Gap preventing complete restore |
| --- | --- | --- |
| Identity | Name, version, unit, symbol, decimals, owners, deployment owner, custody, read-only, type, seal | A sealed source cannot have identical lifecycle state on an intentionally unsealed target |
| Types and totals | Currency/token definitions and aggregate minted/burned totals | No full-state loader plan yet; draft host supports commodity identity only |
| Entities and whitelist | Arrays, entity addresses, known address assignments | Hidden mapping keys/membership not independently proven |
| Ledgers and tokens | All listed owners, entries and inclusive base/max token range | Raw token membership order and unknown/out-of-range mapping entries |
| Batches | All sequential batch IDs, metadata and originator fees | Unknown mapping keys |
| Allowances | None | Arbitrary owner/spender pairs and values |
| Fees | Known address/entity/type values | Explicit-set flags and unknown mapping keys |
| Futures | Type and token fields | Per-ledger margin and fee overrides |
| Routing | Optional owner/loupe and facet bytecode | Selector positions, unknown keys and supported-interface mapping |

A database export cannot fill these gaps without proven provenance, completeness
and freshness. This draft makes no such claim and does not read a database.
Removing an omission entry or marking it observed cannot bypass the fixed gate.
Completing this work requires a proven source of hidden state (for example,
verified storage/history reconstruction), typed loaders and comparison for that
state, plus an explicit policy for lifecycle and routing differences. Do not
silently treat unknown state as zero or compare only selected balances.

## Isolated host and signer policy

`IsolatedRehearsal.sol` is a disposable loader-only storage host, **not** the
production diamond. Its fallback permits only the fixed operator. It has no
upgrade path and rejects the seal selector. `isolatedSelectors` excludes all
initializers, business mutations and upgrades from constructed routes. Facet code
is trusted delegatecall code and must be reviewed and hash-bound before any real
deployment; ABI names are not a security proof. Production authorization defects
are not fixed by this draft.

`mapAdminSigners` accepts public old/new addresses only. It rejects collisions,
unknown roles and any old signer that also appears in business state. Such a
case needs an explicit typed mapping, not text replacement. The original snapshot
remains unchanged; mapping changes and checksum are separate evidence. This
conservative policy can reject otherwise valid operational mappings.

## Receipt-aware recovery

`runJournal` is a tested primitive, not permission to bypass `guardRehearsal`.
Its caller supplies a reviewed plan and an in-memory signer. Requests are fixed
before asynchronous work, constrained to the bound target (including the predicted
CREATE address), and checked against the signed transaction. No raw signed
transaction, key, RPC error or request payload is saved. Use a dedicated signer
with no concurrent transactions and an uncached provider.

The private journal binds chain, source, target, snapshot, plan, signer and nonce.
It writes transaction hash/nonce intent before broadcast and verifies transaction
identity, receipt success, canonical inclusion, finality and post-state. Writes
use an exclusive lock, checksum, atomic rename and fsync. Resume rechecks prior
receipts and stable postconditions; it never blindly repeats a transaction.
Postconditions must remain valid after later steps in the plan.

- Pending, reverted, mismatched, reorged or non-final transactions stop progress.
- A disconnect after broadcast can resume by the recorded hash once mined.
- A crash between saving intent and broadcast is **uncertain**. Stop for manual
  reconciliation; never delete the entry and retry automatically.
- After a crash, remove a stale lock only after independently proving the prior
  process is dead and reconciling transaction/nonce state. Do not run two writers.
- RPC timeouts do not prove a broadcast failed. Preserve the journal for recovery.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm audit --omit=dev
```

Tests use mocks and a disposable in-memory chain. The synthetic test compiles the
repository's Solidity 0.8.5 `LoadLib`, loads asymmetric quantities greater than
2^53, checks membership, resumes without duplicate writes and tests access/seal
denial. Recovery tests cover lost broadcast responses, uncertain intent, pending,
reverted, reorged and non-final receipts, changed context, nonce drift, target
restrictions, locks and corrupted files. These tests do not prove complete
production-state restore or real-network finality. Ganache/legacy solc are
development-only dependencies; do not use their synthetic keys or expose their
providers to real networks.
