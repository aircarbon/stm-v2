# Staged Hardhat migration

Status: additive tooling only. Truffle remains the operational default. No
contract upgrade, data migration, or UAT/production write is authorised by this
document.

## Stack and acceptance gates

1. **Baseline:** freeze the Truffle source and lockfiles; run the existing offline
   recovery regression tests with an explicit, non-empty test selection.
2. **Compilation:** add an isolated Hardhat 3 / ethers 6 package. Keep Solidity
   0.8.5, optimizer enabled with one run, and the Byzantium EVM target. Compare
   compiler outputs before changing artifact consumers.
3. **Deployment and upgrade:** port library linking, diamond initialization and
   sequential cuts; record mined transactions before ORM persistence. Prove
   restart/reconciliation on a disposable chain and database before UAT use.
4. **Tests and operations:** port the supported contract suites and recovery
   operations. Verify exact quantities, whitelist ordering, ledger hashes,
   selector routing and upgrade-state preservation. Do not call the existing
   helper-only `sol/test` directory contract test coverage.
5. **UAT and cutover:** validate IDX UAT private Geth and ACX UAT Polygon Amoy.
   Keep read-only inspection separate from signing. Cutover requires review of
   all preceding gates and explicit approval of each write rehearsal.

Layers 3–5 must not be represented as complete merely because compilation passes.
The default commands must not change until the contract, recovery, database and
downstream ABI compatibility gates pass.

## Frozen Truffle recovery source

The recovery reference is commit
`42830d6c3dae5649e48405c901bbcc2e57125757` in `aircarbon/stm-v2`.
It includes the root and `sol/yarn.lock`, provider patch, CommonJS scripts,
Solidity contracts, ORM and recovery operations. Keep this commit available.

Create a separate recovery directory from tracked files only:

```sh
mkdir ../stm-v2-truffle-recovery
git archive 42830d6c3dae5649e48405c901bbcc2e57125757 | tar -x -C ../stm-v2-truffle-recovery
```

Do not copy local `.env` files, wallet files, database dumps or `node_modules`
into version control or the archive. Supply credentials only through the
approved secret mechanism at execution time. Never log mnemonics or RPC URLs.

This is a **source/lockfile freeze**, not a validated recovery container. The
legacy runtime is inconsistent (`.nvmrc` uses Node 16.20.0; `Dockerfile.dev` uses
Node 18). Both are end-of-life. A clean install and recovery rehearsal are still
required before declaring an executable recovery image available. Do not
silently regenerate the legacy locks or upgrade its dependencies.

Verify that the recovery inputs remain unchanged:

```sh
git diff --exit-code 42830d6c3dae5649e48405c901bbcc2e57125757 -- \
  sol orm package.json yarn.lock .nvmrc Dockerfile.dev docker-compose.yml
```

The offline tests below use synthetic data and mocked chain/DB boundaries. They
do not prove deployment, contract execution, RPC transport or DB compatibility:

```sh
node --test sol/contract_upgrade/test/*.test.js
```

Tooling rollback means returning to this source and its matching artifacts.
It cannot undo a mined transaction. An on-chain reverse diamond cut requires a
separate storage-compatible plan and rehearsal. A database restore cannot undo
a chain write.
