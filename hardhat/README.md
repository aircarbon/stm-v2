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

`check` runs typecheck, Biome lint/format checks, offline tooling tests, compilation
and independent solc-js parity. It does not create a chain or connect to a DB.
The 1,024-account simulated network is reserved for later approved rehearsals.

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
- AWS inventory identified the IDX UAT private-chain instance. Its IP-based RPC
  probe could not complete TLS. A verified hostname/access route is needed;
  no certificate bypass or infrastructure change was attempted.

## Remaining approval gates

The current stack delivers baseline preservation, compiler parity and read-only
UAT preparation. Deployment/upgrade scripts, contract-suite ports, recovery
ports and default-command cutover are **not implemented**. Before executing
their tests, approve writes to a disposable local EVM and disposable local DB
using synthetic accounts/data only. UAT writes remain a separate request, with
an exact target, transaction plan and recovery procedure. Production writes,
Solidity upgrades and contract/data migrations remain out of scope.
