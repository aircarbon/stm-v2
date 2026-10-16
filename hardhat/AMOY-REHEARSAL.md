# Approved, isolated Amoy rehearsal

This executor is for the approved source
`0x5Ec2f474500034AD6a1F8712586dc3A3aC10c384`, chain 80002, only. It does not
upgrade that source or write to a database. The original `deployCommodity`,
`openLocalJournal`, and `restoreRecovery` entry points remain local-only.

Read `docs/acx-uat-rehearsal.md` before use. The source and active DB lookup must
remain unchanged. Capture source data at one confirmed block, record its number,
hash and bytecode hash, and verify the block hash after capture. For the observed
source, use ten onchain hash partitions and a sufficient read gas allowance.

Keep private evidence under an ignored `.amp/in/` directory:

- `acx-baseline.json`: approved `target`, decimal-string `chainId`, `blockNumber`,
  `blockHash`, `codeHash`, and primary `signer`, plus operational baseline data.
- `acx-source-snapshot.json`: exact `captureRecovery(source, 10)` output, with
  source reads pinned to the baseline block and primary owner as caller.
- The read-only DB baseline, including source ABI and related registry rows.

Inject `ACX_UAT_RPC_URL` and `UAT_MNEMONIC` through the secret manager. Do not put
either in command arguments, files, Git, logs or PR comments. The CLI normalizes
mnemonic whitespace in memory and derives the standard Ethereum account path.
All ten source owners must match, and custody must be SELF_CUSTODY (0).

Commit the tested code first. From `hardhat/`, use its exact current revision:

```sh
node scripts/amoy-rehearsal.ts stage ../.amp/in/artifacts "$(git rev-parse HEAD)"
node scripts/amoy-rehearsal.ts setup ../.amp/in/artifacts "$(git rev-parse HEAD)" --execute-amoy
node scripts/amoy-rehearsal.ts restore ../.amp/in/artifacts "$(git rev-parse HEAD)" --execute-amoy
```

`stage` has no network writes: it deploys on disposable EDR, loads the full plan,
checks each transaction against a 30-million-gas limit with 20% margin, recaptures
all supported state, and compares the snapshot and partition hashes. Its result
binds the snapshot SHA-256 and committed code revision. `restore` requires this
successful result before any UAT transaction. Local read gas is increased; the
transaction gas limit is not relaxed.

`setup` is a separate fresh contract with the operational USD defaults, a
distinct test name, and the patched owner-only seal function. It checks non-owner
rejection by `eth_call` without sending a reverted transaction. The restore clone
retains source metadata for exact comparison, but is never registered as the
active DB deployment. These are separate targets, journals and fee budgets.

The Amoy journal rejects native transfers, source calls, unrelated targets,
wrong chains, changed intents, changed fee budgets and external signer nonce
changes. It can call only contracts created earlier in the same journal. The
setup budget is 3 POL; restore is capped at 100 POL and checks its total local gas
estimate before deployment. Each transaction is capped at 30 million gas and
200 gwei maximum fee. Only one writer may use the signer during a run.

Signed transactions are saved and synced before broadcast, with restrictive
permissions. Receipts are separate evidence files. A timeout does not authorize
replacement transactions: rerun the same command and reconcile the same hash.
An ungraceful crash leaves `writer.lock`; verify there is no active writer before
manual cleanup. Do not edit transaction records. A changed revision requires a
new reviewed run, not deletion of a live journal. Replayed receipts do not resend
mined transactions.

If a transaction reverts, stop. Retain the incomplete target and evidence; do
not repair the source. Abandoning a test target cannot recover spent gas, and
sealing cannot be undone. No deployment is usable by the application until a
separate approved integration changes its routing. This CLI never does that.

The standard check includes a disposable chain-80002 EVM test for wrong-chain,
source/unrelated-target, transfer, fee-budget and changed-intent rejection, plus
fresh USD setup, owner-only seal, and replay without additional transactions.
It is not a claim of live UAT success; live receipts and comparison evidence must
be reported separately. Existing recovery exclusions still apply.
