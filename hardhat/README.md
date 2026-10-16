# STM Hardhat tooling

This package is independent of the legacy Yarn workspaces. Do not run its
installation from `sol/` or change the root runtime to match it. Use Node
24.21.0 (see `.nvmrc`). The npm lockfile pins this package; the legacy Yarn
lockfiles remain unchanged.

From `hardhat/`:

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs typecheck, Biome lint/format checks, offline tooling tests, compilation,
independent solc-js parity, and disposable-chain deployment tests. These tests use
1,024 public synthetic accounts on an in-process Hardhat EVM and an in-memory
PGlite database. They do not read operational keys or connect to a shared DB.

The build copies the Solidity tree to ignored `contracts/` without changing
source bytes. The current tree contains no preprocessor directives. A future
directive fails the build until variant handling is reviewed. Stale generated
sources also cause an error; inspect and remove only the stale generated file.

Parity compares the Hardhat build against solc-js 0.8.5 using the legacy settings
and Truffle source-name convention. It checks the exact source contents, compiler
version, optimizer, EVM target, ABI, selectors, storage layouts, library link
names/positions, and creation/runtime executable bytecode. It masks metadata and
source-name-dependent link placeholders, but retains their byte lengths and
checks link positions separately. For creation code it locates embedded runtime
metadata before any appended constructor strings.

**This is compiler parity, not a Truffle runtime compatibility test.** Hardhat
artifacts are not drop-in replacements for `sol/build/contracts`. The existing
merged-ABI consumers, deployments, ORM writes and backup/restore commands still
use Truffle. No old entry point has been redirected. Contract execution,
signature formats, fees, nonce handling and recovery are separate acceptance
gates in [the staged plan](../docs/hardhat-migration.md).

## Read-only UAT inspection

Provide `IDX_UAT_RPC_URL` or `ACX_UAT_RPC_URL` in the process environment using
your secret manager. No endpoint or signer is committed. `.env` files are not
loaded automatically. From `hardhat/`, run:

```sh
npm run inspect:uat -- idxUat
npm run inspect:uat -- acxUat
```

Expected `eth_chainId`: IDX UAT **800135** (from the legacy configuration, still
requires live confirmation); ACX UAT Amoy **80002**. The probe reports
`net_version` separately; it is not assumed to equal `eth_chainId`. It stops on
a wrong chain before reading further. It reads the latest block's gas limit and
base fee plus `eth_gasPrice`; integer values remain exact decimal strings.

Only `eth_chainId`, `net_version`, `eth_getBlockByNumber` and `eth_gasPrice` are
sent. TLS verification stays enabled. The probe uses keep-alive, at most four
sockets, sequential reads and a 120-second deadline per request. Errors never
print the endpoint or raw RPC response. The Hardhat HTTP profiles use no local
accounts, no remote/unlocked-account fallback, and a 120-second timeout.
This is not a network-wide write firewall: an operator could still use another
client or send raw RPC through Hardhat. Do not do so without write approval.

Read-only evidence collected on 2026-10-16:

- ACX UAT Kubernetes deployments were reachable. No workloads or secrets changed.
- Public Amoy RPC preflight passed: chain ID/network ID 80002, block 50293247,
  gas limit 140000000, base fee 63 wei, suggested gas price 30000000063 wei.
  This confirms the public chain, **not the deployed ACX UAT contract or its
  configured provider**. No ABI calls or signing were tested.
- The supplied IDX UAT hostname passed TLS verification and returned HTTP 401
  without authentication. `IDX_UAT_RPC_URL` is stored in Amp secrets, but is not
  injected into this existing runner process. Authenticated chain-ID and fee
  inspection remain pending. No certificate bypass was used.

## Disposable deployment and reconciliation

`npm run test:contracts` deploys the original COMMODITY diamond using the unchanged
artifacts: 24 deployments and four sequential initialization cuts. The merged ABI
preserves tuples, events and overloads, and excludes initializer entry points.
`deployCommodity` checks all installed selectors, owners, name and version.

`openLocalJournal` requires chain 31337 and the Hardhat metadata RPC. It holds a
directory writer lock, saves signed transactions before broadcast, and reconciles
by transaction hash on restart. Use one journal per disposable chain and deployer;
do not reuse it after resetting the chain. Calls must be sequential. A crash may
leave `writer.lock`; confirm that the prior writer is stopped before removing it.
Never put real keys or operational transaction payloads in these test journals.

The test forces a PostgreSQL constraint failure after mining, verifies atomic DB
rollback, reopens the journal without changing the deployer nonce, and projects
the manifest twice without duplicate records. It then replaces an application
facet with the same compiled code, preserving owners and checking selector routing.
This is a **local rehearsal**, not a shared-database adapter or UAT deployment tool.
PGlite checks SQL transaction behavior; it does not prove the deployed DB schema,
ORM connection settings, external ABI consumers or production concurrency behavior.

## Contract lifecycle coverage

The COMMODITY lifecycle test exercises whitelist order and both whitelist ABI
overloads, entity assignment, sealing, exact bigint mint/fund/trade/burn balances,
a fixed token fee, library event decoding, permission failures, and the int64 mint
limit. It replaces `StLedgerFacet` and compares ledger hash, all populated ledgers,
batch data, token IDs, owners, fees and seal state before and after the cut.

This is focused coverage, not a port of every disabled legacy suite. The existing
Solidity `sealContract()` has no owner check; the migration does not change it.
Also, paginated `getWhitelist(pageNo, pageSize)` requires the entire requested
slice to exist: it does not shorten the final page. Recovery callers must preserve
that behavior until a separate contract change is approved.

## Remaining approval gates

Synthetic writes to disposable local EVMs and databases are approved. UAT writes
remain a separate request, with an exact target, transaction plan and recovery
procedure. Contract-suite and recovery equivalence, real ORM/ABI consumer
compatibility, and default-command cutover remain open gates. Production writes,
Solidity upgrades and contract/data migrations remain out of scope.
