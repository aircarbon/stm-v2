# Development environment

Use Node.js 16.20.0 from `.nvmrc` and Yarn 1.x.

```sh
nvm use
yarn install --frozen-lockfile
cp sol/.env.example sol/.env.local
cp sol/DEV_MNEMONIC.example.js sol/DEV_MNEMONIC.js
yarn dev:build
```

The example configuration is localhost-only. For a remote deployment, supply `RPC_URL`, `NETWORK_ID`, and `MNEMONIC` through the environment and use the `remote` Truffle network. Keep all rendered `.env` and `.npmrc` files untracked.
