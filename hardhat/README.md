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
