# Frozen Truffle recovery runtime

Scope: offline recovery regression tests and compilation of tracked source at
`42830d6c3dae5649e48405c901bbcc2e57125757`. This is not approval to deploy,
restore a database, sign, or call a chain.

## Build and verify

Run from the repository root, in a tmux window with that directory as its cwd:

```sh
sh recovery-runtime/build.sh --no-cache -t stm-v2-frozen-compiled:42830d6 \
  > .amp/in/artifacts/frozen-build.log 2>&1
sh recovery-runtime/verify.sh > .amp/in/artifacts/frozen-verify.log 2>&1
docker image inspect stm-v2-frozen-compiled:42830d6 --format '{{.Id}}'
```

Create the log directory first if necessary; keep `/.amp/in/` in the local
Git exclude file. Build logs contain dependency output, not credentials.

`build.sh` creates a temporary context containing only `git archive` output
and this Dockerfile. It removes the context on exit. It does not send the
checkout, `.git`, host environment, SSH agents, caches, secrets, wallet files,
or host dependencies to Docker. Do not build this Dockerfile using the live
repository as context. No secret mounts or build arguments are required.
The source commit must be available locally. The archived inputs include the
original two locks, contracts, ORM, and provider patch without edits.

The platform is deliberately bounded to `linux/arm64` (tested on this Docker
daemon). Node 16.20.0 matches the frozen `.nvmrc`; the base is digest-pinned
and Yarn 1.22.19 is checked. Both dependency installs use frozen locks and run
lifecycle scripts, including patch-package. Husky Git hooks and Puppeteer
browser download are not recovery requirements and are disabled. No engines
or dependency errors are suppressed. Lock hashes are checked after install.

Targets `source` and `installed` are available for diagnosis with `--target`.
The default `compiled` target downloads Solidity 0.8.5 via Truffle and checks
its SHA-256. This stage uses synthetic mnemonic placeholders only to load the
original configuration; compilation does not invoke providers. The resulting
compiler cache lets verification compile again with `--network none`.
Builds need public package/Git/compiler download access; verification does not.

## Observed validation and limits

Validation on 2026-10-16 produced local image
`stm-v2-frozen-compiled:42830d6`, image ID
`sha256:f8ace5fbb049fd68f561924057863c5f04515de92c377fe58ff350864fa2889f`.
Evidence is in ignored `.amp/in/artifacts/`: `frozen-build.log` (clean
installation), `frozen-compile-pinned.log` (compiler checksum),
`frozen-verify-final.log` (network-disabled verification), and
`frozen-artifact-check.log` (all 32 artifacts). An initial compile with no
cached compiler and no network failed as expected; see `frozen-runtime.log`.
The compiled image resolves that specific prerequisite, not any chain setup.

- Clean root and sol installs passed. The frozen provider patch applied.
- Node 16.20.0, Truffle 5.8.3, Ganache 7.8.0, and Web3.js 1.8.2 loaded.
- All three existing offline recovery test files passed with no skips, both
  in the source-only container and with installed dependencies. Node 16 reports
  file-level test counts; this does not mean only three assertions ran.
- The original Truffle configuration compiled 32 artifacts with
  `0.8.5+commit.a4f2e591.Emscripten.clang`. Inspected OwnedFacet metadata retains
  optimizer enabled, one run, Byzantium; artifacts contain ABI, bytecode,
  deployedBytecode, source maps, compiler, and networks fields.
- No tracked baseline artifacts exist at the frozen commit for byte-for-byte
  comparison. Truffle artifact shape is retained, but downstream consumers,
  deployment addresses/linking, real RPC/DB transport, and contract execution
  remain unverified. Compile warnings include contract code-size warnings.
- Yarn reports an optional USB native build failure on ARM64 (libudev support).
  Yarn still succeeds. Hardware-wallet/USB support is not validated. Root
  Husky reports no `.git` directory, as expected for an archive.
- Node 16 is end-of-life. Legacy dependencies and the retained provider patch
  are not security hardening (the upstream RPC code disables TLS verification).
  Do not expose this runtime as a service or use it with production secrets.
- External package availability can change; locks and a pinned base do not
  provide an offline mirror. Image timestamps/build provenance mean image IDs
  can differ between equivalent builds. Retain a reviewed image by digest for
  future recovery. Do not treat this as bit-for-bit image reproducibility.

`verify.sh` uses a disposable container, no mounts, no network, dropped Linux
capabilities, and no new privileges. It runs only version inspection, the
explicit existing test glob, compilation, and lock checks. It never runs
migrations or an operational recovery script.
