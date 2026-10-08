# Offline snapshot rehearsal

Validate local contract snapshots and public address mappings without loading
Truffle, credentials or network clients. These utilities produce review artifacts,
not transactions, deployment instructions or executable restore files.

## Usage

Use Node 22 or newer. No dependency installation is required.

```sh
node --test sol/contract_upgrade/offline-rehearsal/rehearsal.test.cjs
node sol/contract_upgrade/offline-rehearsal/rehearsal.cjs plan pre.json pre-evidence.json proposal.json
node sol/contract_upgrade/offline-rehearsal/rehearsal.cjs verify pre.json pre-evidence.json post.json post-evidence.json progress.json
node sol/contract_upgrade/offline-rehearsal/rehearsal.cjs remap post.json post-evidence.json mapping.json review.json
```

- `plan`: validate exact selected-entity membership, quantities, counters and fee
  schedules; produce a whole-token proposal tied to snapshot bytes and block identity.
- `verify`: classify exact completed/pending operations and reject unrelated state
  changes. A successful report can have `complete: false`; inspect that field.
- `remap`: require zero scoped balances, validate indexed public-address mappings,
  replace only typed fields, and reject collisions or unclassified references.
  Preserve IDs, metadata and positional relationships. Remove the stale native hash.

Input backup shape is `info`/`data` from `utils.js:createBackupData`. Supported
snapshots contain commodity/spot state, complete token inventory and fee schedules.
Use decimal strings for large integers. Unsupported state fails closed.

Evidence fields: `schemaVersion: 1`, `environment: "rehearsal"`, `entityId`,
`chainId`, `network`, `contractAddress`, `block: {number, hash}`, `backupSha256`,
and `scopeAccounts`. IDs and block numbers use decimal strings. `backupSha256`
is lowercase SHA-256 of the exact backup file bytes. Scope must match the selected
entity's complete whitelist membership; it is not an arbitrary address subset.

Mapping fields: `schemaVersion: 1`, `backupSha256`, `path` (derivation prefix without
final index), positive `addressCount`, `entries: [{index, oldAddress, newAddress}]`,
and `preservedAddresses`. Indexes cover 0 through count−1. Supply public data only;
never include mnemonic or private-key material in an input or test fixture.

Outputs are new files with mode 0600; existing files cannot be overwritten. Remap
output is a review envelope with field-level changes, source hash and candidate.
Mapping/candidate hashes use canonical JSON: sorted object keys and safe integers
normalized to decimal strings. Archive a separate byte hash for each output file.

## Limits

Offline checks prove internal consistency, not RPC provenance, canonical blocks,
transaction receipts, key derivation or deployment readiness. Obtain independent
evidence and approval through a separate operational process. Keep deployment
names, inventories, account manifests, security assessments and rollout plans out
of this public repository, its issues and its CI artifacts. Tests use synthetic data.
