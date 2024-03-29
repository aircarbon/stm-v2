# SecTokMaster - Security Token Master
  (ERC20-Compatible Commodity/Cashflow Token)

    (c) AirCarbon Pte Ltd

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Distributed under AGPLv3 license: see /LICENSE.md for terms.

## Recommended/Supported

- Recommended environment is Linux/OSX/WSL: scripts are not currently Windows/Powershell compatible.

## Setup

- `cd sol`
- `npm i`
- `npm i truffle -g`
- `npm i ganache-cli -g`

Important: for testing, use `ganache-cli`, not `ganache`

## Configs / Target Environment

Create the following .env config files, using the `.env.example` as a template:

    `.env.local` => localhost, debug instance
    `.env.DEMO` => DEV AWS, DEMO instance
    `.env.UAT` => DEV AWS, UAT instance
    `.env.DEV` => DEV AWS, DEV instance
    `.env.AC_TEST_1` => TEST(AC PrivateNet), Test1 instance

Set with env var: `INSTANCE_ID`: e.g. `export INSTANCE_ID=local` to control pre-processor, contract deployment prefix and contract database.

Pre-processor `process_sol_js` and migration script `2_deploy_contract.js` use this env var to load config from .env files, e.g. `.env.local`, `.env.UAT`, etc.

## Run local node

    `ganache-cli --accounts 1024 --networkId 888 --mnemonic "educate school blast ability display bleak club soon curve car oil ostrich" --gasLimit 7800000`

  > runs with a large number of accounts (the tests require more than 10 built into `truffle develop`)
  > runs with custom network ID 888
  > runs with gas limit ~= reported default geth Ropsten-connected node gas limit
  > runs with InstaMining by default
  > OR (better, for individual dev account separation by networkId): from repo root: `yarn ganache` after change NETWORK_ID=xxx in .env files.

## (1) Pre-process & compile

Invoke `process_sol_js` to pre-process .sol and .js files, based on supplied .env `CONTRACT_TYPE`:

    `node process_sol_js`

Pre-process, compile & output bytecode sizes (see `StMaster.sol` re. 24k bytecode limit):

    `node process_sol_js && truffle compile --reset --all && grep \"bytecode\" build/contracts/* | awk '{print $1 " " length($3)/2}'`

## (2) Pro-process, compile & migrate (Deploy) Contracts

    `export INSTANCE_ID=local && node process_sol_js && truffle migrate --network development --reset`
      (ganache-cli local node)

    `export INSTANCE_ID=DEV && node process_sol_js && truffle migrate --network ropsten_ac --reset`
      (Deploy AWS DEV instance using AirCarbon's Ropsten Geth node)

    `export INSTANCE_ID=UAT && node process_sol_js && truffle migrate --network bsc_testnet_bn --reset`
      (Deploy AWS UAT instance using Infura Ropsten)

    `export INSTANCE_ID=DEMO && node process_sol_js && truffle migrate --network bsc_testnet_bn --reset`
      (Deploy AWS DEMO instance on AirCarbon's privnet)

## Whitelist & Seal Deployed Contract

For setup of deployed contract ready for use, see `04_Web3_INIT_MULTI_DATA_AC.js` web3 test(s) to add addresses to the contract's whitelist, seal the contract and optionally submit test transactions/data.

## Run Tests

    `export INSTANCE_ID=local && node process_sol_js && truffle compile`
      or (undocumented) `... truffle compile --reset` if it keeps recompiling when there aren't any changes in the Solidity

    `export INSTANCE_ID=local && node process_sol_js && truffle test --network development`

## Docs

- `npx soldoc --output html ./contracts/interfaces/docs/soldoc ./contracts/Interfaces`
- `npx solidity-docgen -i ./contracts/interfaces -o ./contracts/interfaces/docs/solidity-docgen --contract-pages`
- `solidoc ./contracts ./docs ./ true`
- Remix Plugins: `EthDoc Generator` and `EthDoc Viewer`

## Remix Code Import

- `remixd -s` <AbsolutePathToSmartContractFolder> `--remix-ide 'https://remix.ethereum.org/#optimize\=false\&runs\=200\&evmVersion\=byzantium\&version\=soljson-v0.7.1+commit.f4a555be.js'\`
- On Remix: `Connect to Localhost`

## VS Code Extensions

[Solidity Visual Developer] (https://marketplace.visualstudio.com/items?itemName=tintinweb.solidity-visual-auditor)

- `Flatten` /contracts/StMaster/StMaster.sol
- Generate (class) `graph`,
- Generate `contract interaction graph`
- Generate `inheritance graph`
- Export as UML; or
- Import to [draw.io] (https://app.diagrams.net/) Menu --> Arrange --> Insert --> Advanced CSV

## Dbg - misc

- If you see `Error: invalid reporter "eth-gas-reporter"` -- try running `npm i` in ./packages/erc20

- `truffle deploy` using "infinite" gas?
  *  bytecode limit (24576): https://github.com/trufflesuite/ganache/issues/960
  *  https://github.com/ethereum/EIPs/issues/1662


