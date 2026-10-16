# ACX UAT recovery and setup rehearsal

Status: preflight blocked; no chain or shared database writes performed.

## Scope and stack

This rehearsal follows the tooling and isolated seal-owner security layers in
stack #11. The source is Amoy chain **80002**, contract
`0x5Ec2f474500034AD6a1F8712586dc3A3aC10c384`. Production and IDX writes are excluded.
PR #6 is the frozen Truffle reference; the current stack is the candidate.

1. Record this recovery plan and capture read-only chain/DB baselines.
2. Add a separately guarded Amoy execution path and test it locally. Keep the
   existing local-only deployment and journal guards. Do not weaken them to
   enable this rehearsal. Bind the new path to chain 80002, the approved source,
   signer, fixed snapshot, generated test targets, and a bounded gas budget.
3. Restore into a **new isolated clone**, not the source. Compare the full
   supported recovery state and ledger hash before declaring success.
4. Deploy a **second fresh contract**, apply operational USD defaults, verify
   them, seal as owner, and verify the sealed state and selector routing.
5. Record receipt hashes, addresses, comparison results, and DB reconciliation
   in a dependent evidence layer. Do not mark unexecuted steps as passed.

## Baseline gates before sending any transaction

- Confirm chain ID 80002 and non-empty source bytecode. Record a confirmed block
  number, its hash, and source bytecode hash. Pin **all** source reads to that
  block, including the ledger hash and owners. Recheck the block hash afterwards.
- Read contract type, version, seal, custody type, owners, currency/token types,
  entities, whitelist, ledger owners, batch/token bounds, and quantities. Check
  these against `hardhat/RECOVERY.md`; stop on unsupported data.
- Normalize mnemonic whitespace in memory and validate BIP39. Derive owner
  indices 0–9 using `m/44'/60'/0'/0/{index}`; never print or persist the mnemonic
  or derived keys. Compare all source owners before attempting exact recovery.
- Check signer balance, current/pending nonce equality, and an estimated total
  fee budget. Do not cancel pending transactions or fund other accounts.
- Capture the matching `dbo.contract` row (including ABI), related component and
  selector rows, and deployment counts using a read-only transaction. Save
  private evidence outside Git with restrictive permissions and SHA-256 hashes.
- Rehearse the captured snapshot on a disposable local EVM before Amoy writes.
  A synthetic fixture alone is not sufficient evidence for this source.

## Rollback and recovery

The source contract remains unchanged. Do not clear entities, remap addresses,
burn/withdraw balances, upgrade source facets, or change source ownership.
The application must continue to use the existing source address.

The shared DB is read-only for this rehearsal. Do not insert test deployments
under the active contract name or update its lookup rows. Test manifests remain
local; compare their shape through the real ORM against a disposable database.
Re-read the source registry row after testing and compare its digest. A count
change alone can come from other users and does not authorize rollback.

Before each broadcast, save the exact signed transaction and intent in a private
journal, with signer, chain, nonce, target, calldata and fee limit checks. Signed
transactions are executable material: do not publish or commit them. Persist
receipt hashes separately for review. On a timeout, reconcile by hash and nonce;
do not sign a second transaction or advance to the next step until resolved.

If deployment or restore fails, stop and retain the incomplete test addresses
and receipts. Resume only after reconciling the journal and target state. Never
reuse an unrelated address or send repair writes to the source. If a test
contract must be abandoned, record it as abandoned; spent gas cannot be undone.
Sealing is irreversible. There is no unseal or destructive DB rollback in scope.

## Verification contracts

Recovery must compare the captured and restored normalized state, onchain ledger
hash, global quantities, batches, ledger balances/tokens, fees, entities, and
ordered whitelist. Report the documented allowance and entity-address ordering
limitations separately. Unsupported futures, cashflow variants, historical
overrides, or legacy hash provenance must block an equivalence claim.

Fresh setup follows `sol/devSetupContract.js`, not the different test defaults:

- SPOT types `CET`, `ANT`, `GPT`, zero futures and null cashflow base.
- USD ID 1, unit `cents`, decimals 2; ETH/Wei/18 and BTC/Satoshi/8.
- Entity 4 with the operational `CONST.testAddr99` placeholder fee owner.
- USD fee: per-million 300, mirrored, minimum 300; remaining fee fields zero.
- Whitelist owner, assign entity 4, initialize its ledger with zero USD and
  reference `DEV_INIT`; whitelist derived accounts 0–29 before sealing.
- Verify all fields, owner list, symbol/unit, routing and non-owner rejection
  before the owner seal transaction. Verify seal after a successful receipt.

Use distinct test names in manifests. Do not silently replace the placeholder
fee owner or treat a zero balance as a funded operational account.

## Read-only findings, 2026-10-16

The ACX UAT PostgreSQL registry identifies the source as row 1094,
`UAT_80002_ACX`, network 80002, COMMODITY version 2.6.6. The registry contained
64 contract rows when inspected. A private baseline contains the source row,
22 related component rows, 93 related selector rows, and table counts (64
contracts, 104 components, 310 functions). Its SHA-256 is
`ecff42fdbf8e8512592063de94f91a1ec0b193ff56cbd3316dc5d5ef16d60559`.
The source registry row was unchanged between the two reads. No DB writes ran.

The Mac runner receives `UAT_MNEMONIC`; it validates after whitespace
normalization. `ACX_UAT_RPC_URL` is not injected. The canonical public Amoy
hostname did not resolve. A public dRPC endpoint returned chain 80002 and source
bytecode, but subsequent pinned reads failed with HTTP 500/RPC errors. This is
not a completed chain baseline or evidence of a contract defect.

Execution is blocked pending reliable RPC access and completion of the gates
above. No backup/restore equivalence, fresh address, seal transaction, or live
PR #6 compatibility result is claimed. Existing local tests do not close this
gap; the Web3 2 alpha all-indexed event decoder failure remains a separate
downstream compatibility issue.

The unchanged candidate passed `cd hardhat && npm run check`: TypeScript,
Biome, three tooling tests, 32-contract compiler parity, and four local EVM
integration tests (deployment, lifecycle, bounded recovery, owner-only seal).
