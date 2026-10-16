# Bounded ORM and ABI compatibility test

Run explicitly from the repository root. This is not part of `npm check`:

```sh
sh recovery-runtime/compatibility.sh > .amp/in/artifacts/compatibility.log 2>&1
```

Run tests in the `stm-v2` tmux session. The command needs Docker, the local
`stm-v2-frozen-compiled:42830d6` image, `postgres:16-alpine`, Node 24, and the
installed and built Hardhat package (`cd hardhat && npm run build`). It does not install dependencies into the
checkout. `COMPATIBILITY_IMAGE` can select another reviewed recovery image.
The runner creates an internal network and two containers. PostgreSQL has no
published port and stores data in tmpfs. All database credentials are synthetic
test values. Cleanup removes only resources with this invocation's name and
its temporary directory. No host environment or wallet files enter a container.

## Results on 2026-10-16

**The full integration command fails:** the actual top-level Web3
`2.0.0-alpha.1` throws `Empty outputs array given!` when decoding
`EntityAssignedForAccount(address,uint256)`, whose fields are all indexed.
The test keeps that failure visible. Do not cut over this consumer until it is
adapted or replaced; this layer does not mutate the frozen dependency graph.

Evidence: `.amp/in/artifacts/compatibility-actual-final.log`, exit 1. The frozen image inspected was
`sha256:f8ace5fbb049fd68f561924057863c5f04515de92c377fe58ff350864fa2889f`.

- Actual compiled ORM `build/index.js`, not the incorrect package `dist` main,
  calls `SaveDeployment`, `GetDeployment`, `UpdateABI`,
  `SaveContractDeployment`, and `SaveContractFunction`. No ORM methods, config,
  pool, SQL adapter, or driver are mocked.
- A real PostgreSQL 16 server accepts queries through the frozen `pg` driver.
  The real `db_type=postgres` selection, `dbo` search path, named `admin` and
  `erc20` pools, pool cache, and shutdown run. Both names use the isolated test
  database; this does not prove separate credentials for separate databases.
- Serialized JSON ABI survives the actual insert/update/read path exactly.
  Contract version, mixed-case `txHash`, missing network result, quoted contract
  name, facet transaction hash, function selector, and tuple-array calldata pass.
- The generator calls the actual `deployCommodity` on a disposable in-process
  Hardhat EVM, then consumes its returned manifest. There is no duplicate ABI
  merge implementation or facet/library list. No operational keys are loaded.
  **The compatibility boundary converts ethers human-readable fragments to JSON
  with `Interface.formatJson()` before persistence and Web3 construction.**
  Passing human-readable `manifest.abi` directly to the legacy JSON consumer is
  not supported by this test.
- Frozen Web3 **1.8.2** and the actual top-level **2.0.0-alpha.1** each construct an `eth.Contract` from the ORM-read ABI
  and matches all 94 application function encodings. Two explicit overload
  controls also pass, including a tuple array. Recursive test values cover
  nested tuples, dynamic/fixed arrays and exact decimal strings above `2^53`.
- Web3 1.8.2 decodes all 49 generated application event vectors, including library
  events, to the expected values. Ethers generates independent topics/data;
  these are codec tests, not chain receipts. Web3 2 alpha fails as described above;
  its small integers and BigNumber values are normalized without precision loss
  before comparison. This is a representation conversion, not a decoder bypass.

## Important image findings

The available image did **not** have `/recovery/orm/build/index.js`. The runner
therefore runs `yarn prepare` in the disposable container, using dependencies
already in the image. No dependency install or network download is required.
The root and sol top-level `web3` packages are actually `2.0.0-alpha.1`.
Web3 1.8.2 is installed under `@truffle/interface-adapter/node_modules/web3`;
the test loads that exact module and asserts its version. Do not infer that
every legacy consumer resolves to 1.8.2. These differences from the assumed
image contents were found by inspection, not corrected in legacy locks.

## Exclusions and retained limits

- Deployment runs only on the disposable local EVM. The database is also
  disposable. Codec vectors do not exercise operational RPC or emitted receipts;
  keep the Hardhat lifecycle/recovery tests as separate execution evidence.
- `sol/const.js` is not imported: its module scope loads operational environment
  state. The actual `web3_call` wrapper, its DB/version selection and RPC behavior
  remain untested. The actual Web3 constructor and ORM public API are tested
  separately, including the top-level Web3 2 alpha codec.
- Tables are a minimal synthetic schema, not a migration/schema parity test.
  SQL Server, TLS, authentication policies, concurrency, failures during writes,
  upgrade history and multiple deployment versions are outside this boundary.
- Dynamic indexed event values cannot be recovered from a topic hash; such
  events are excluded by the generator. All 49 current event vectors qualify.
- Known unrelated ORM limits remain unchanged: `GetDeploymentsByAddresses`
  chooses `MAX(id)` across networks and accepts an empty list that creates
  invalid `IN ()`; `UpdateABI` filters only by address, not network. This test
  uses one row/address for the update and does not certify those cases.
- Node 16 and frozen dependencies remain legacy recovery tools, not a supported
  production runtime. Neither legacy source nor package/lock files are changed.
