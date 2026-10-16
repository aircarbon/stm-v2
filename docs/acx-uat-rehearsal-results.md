# ACX UAT rehearsal results — 2026-10-16

This record supersedes the initial RPC blocker in [the recovery plan](acx-uat-rehearsal.md).
The plan's source-preservation and rollback rules remain unchanged. No production
or shared database writes ran. Secrets were injected, normalized in memory, and
excluded from logs and committed evidence.

## Execution and baseline

- Candidate: [ce03b84](https://github.com/aircarbon/stm-v2/commit/ce03b84ae4986d1ff954676e0909bdedf15e01aa), stack #11 through PR #21.
- Frozen reference: [PR #6](https://github.com/aircarbon/stm-v2/pull/6), merged revision 42830d6.
- Amoy chain ID: 80002.
- Source: `0x5Ec2f474500034AD6a1F8712586dc3A3aC10c384`.
- Snapshot block: 50311463, hash `0xd964186c1caa7b86b36cc6bef770f0a8aa9367004a2a708d4d66447b4877c177`.
- Snapshot SHA-256: `074c5a09b695ebe647cf0f4cc1e7304841bd4b1aa9747695fbf673c08ecf9ab4`.
- Sealed COMMODITY 2.6.6; 5,000 whitelist entries, 641 ledgers, 2,468 batches,
  5,447 token IDs, 106 SPOT types, four currencies, 62 entities.

The backup used 82,370 cached, fixed-block RPC reads with the primary owner as
caller. The block hash was rechecked. Snapshot contents and signed transactions
remain private; they are not included in this repository.

## Backup and local restore passed; live restore is blocked

The capture exposed a singleton-token array conversion bug. PR #21 fixes it using
ABI output types. The public integration test failed with the observed TypeError
before the fix and passed afterwards.

All 1,239 planned recovery calls ran on disposable local EDR. A fresh capture
matched the entire supported normalized snapshot and all ten sorted onchain
ledger-hash partitions exactly. Local replay used 4,143,065,177 gas; the largest
transaction used 14,155,097 gas, below the 30 million limit including its margin.

No Amoy restore clone was deployed. At the funding check, the fee estimate was
45,600,187,638 wei/gas. Replay with 20% margin cost an estimated 226.71 POL,
above the 100 POL restore guard and the then-available 137.29 POL balance. The
guard was not raised. Live restore needs a new fee check, sufficient test funds,
and approval for a revised bounded budget, or must remain deferred.

**PR #6 verdict: partial compatibility verified, not full live recovery approval.**
Its retained batch/fee/quantity semantics are covered by exact local replay of
the real snapshot. Entity deletion, address remapping and source-clearing writes
were not exercised. Documented unsupported recovery variants remain blocked.
The separate Web3 2 alpha all-indexed event-decoder failure remains unresolved;
prior real ORM/PostgreSQL and Web3 1.8.2 checks do not remove that limitation.

## Fresh USD deployment and owner seal passed

- Address: [`0xbb308fAb8F0224c0F62f6fbcE4192C63d7Ff929d`](https://amoy.polygonscan.com/address/0xbb308fAb8F0224c0F62f6fbcE4192C63d7Ff929d).
- Proxy deployment: [`0xe66b2a1aabf69169109417c090be9683730dc5b5b356a16c5ce408e8f62b20df`](https://amoy.polygonscan.com/tx/0xe66b2a1aabf69169109417c090be9683730dc5b5b356a16c5ce408e8f62b20df).
- Owner seal: [`0x986daf8ef09d0e516377ec6ab444c0f2bbe09e72e0c06d861f319a892581bfb5`](https://amoy.polygonscan.com/tx/0x986daf8ef09d0e516377ec6ab444c0f2bbe09e72e0c06d861f319a892581bfb5), block 50315128.
- All 41 receipts succeeded and were re-read from RPC; total gas 43,482,124,
  cost 1.982793010559595602 POL, within the separate 3 POL guard.
- [All transaction hashes and receipt blocks](acx-uat-setup-transactions.json).

Before sealing, execution verified CET/ANT/GPT SPOT types, USD cents/2,
ETH Wei/18, BTC Satoshi/8, entity 4 with placeholder fee owner `0x...0099`,
USD minimum/per-million fee 300 with mirroring, owner entity assignment,
30 ordered whitelist accounts, and the zero-funded owner ledger. An outsider's
seal static call reverted with `Restricted`; no outsider transaction was sent.
Deployment checked selector routing. After sealing, the contract reported sealed,
the expected name `UAT_HARDHAT_USD_20261016`, symbol/unit and all ten owners.
This is an isolated test contract, not an active application deployment.

## Source and DB reconciliation passed

At block 50315182, source bytecode, all ten ledger-hash partitions, owners,
ordered whitelist and seal matched the baseline. Every setup receipt was checked
to exclude the source as a transaction target.

Read-only PostgreSQL comparisons before and after setup matched the original
source row 1094, 22 related component rows and 93 selector rows exactly.
Table counts remained 64 contracts, 104 components and 310 functions. No test
deployment was registered in the shared DB; active routing was unchanged.

No rollback was required or performed. The fresh sealed test contract remains
on Amoy; spent gas cannot be reversed. No source upgrade, burn, withdrawal,
address remapping, pending-transaction cancellation or destructive DB operation ran.

## Validation and review

- `cd hardhat && npm run check`: TypeScript, Biome, three tooling tests,
  32-contract compiler parity and five EVM integration tests passed.
- Exact real-snapshot local replay passed separately.
- Code-quality-review of PR #21: APPROVE; no blocking structural finding.
- One-shot babysit checks: PR #21 green and mergeable; no external review findings.
- PR #19 compiler-parity passed after one authorized retry of its checkout DNS
  failure. No code or CI changes were needed. [Successful retry](https://github.com/aircarbon/stm-v2/actions/runs/38868052182/job/116873863329).
- No continuous monitoring, merge or production deployment was enabled.
