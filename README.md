# Security Token Master (STM)

An ERC-20-compatible commodity and cash-flow token implementation.

The project is distributed under AGPL-3.0; see [LICENSE.md](LICENSE.md). Copyright and third-party notices must be preserved when the code is redistributed.

## Prerequisites

- Node.js 16.20.0 (see `.nvmrc`)
- Yarn 1.x
- Ganache CLI 6.12.2 for local blockchain tests
- Microsoft SQL Server for ORM-backed deployment flows

## Setup

```sh
nvm use
yarn install --frozen-lockfile
cp sol/.env.example sol/.env.local
cp sol/DEV_MNEMONIC.example.js sol/DEV_MNEMONIC.js
```

The committed examples contain localhost values and a deterministic development mnemonic only. Put non-local database credentials, RPC URLs, package-registry tokens, and signing mnemonics in ignored local files or environment variables.

For npm or GitHub Packages authentication, copy `.npmrc.example` to `.npmrc` and set `NPM_TOKEN` and/or `GITHUB_PACKAGES_TOKEN` in the environment. Never write token values into `.npmrc`, package manifests, lockfiles, or Git URLs.

## Local development

Start Ganache in one terminal:

```sh
cd sol
INSTANCE_ID=local NETWORK_ID=888 yarn ganache
```

Build the ORM and compile the contracts:

```sh
yarn dev:build
cd sol
INSTANCE_ID=local node process_sol_js
yarn truffle compile --all
```

Run the contract tests against the local Ganache instance:

```sh
cd sol
INSTANCE_ID=local ISTEST=true yarn truffle test --network development
```

## Remote networks

Only the generic `remote` Truffle network is committed. Provide these values at runtime:

- `RPC_URL`: HTTP(S) RPC endpoint
- `WS_RPC_URL`: optional WebSocket endpoint used by direct Web3 helpers
- `NETWORK_ID`: numeric network identifier
- `MNEMONIC`: deployment signing mnemonic
- `GAS`, `GAS_PRICE`, `CONFIRMATIONS`, `TIMEOUT_BLOCKS`: optional deployment tuning

Client-specific endpoints, network aliases, production addresses, credentials, and operational runbooks are intentionally excluded.

## Transfer status

See [TRANSFER_REVIEW.md](TRANSFER_REVIEW.md) for the cleanup decisions, residual risks, validation results, and the future history-cleanup/root-commit procedure. The current branch preserves the original Git history for review and is not itself safe to transfer until the documented history step and credential rotation are completed.
