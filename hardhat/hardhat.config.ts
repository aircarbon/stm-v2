import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha],
  solidity: {
    version: "0.8.5",
    preferWasm: true,
    settings: {
      optimizer: { enabled: true, runs: 1 },
      evmVersion: "byzantium",
      outputSelection: {
        "*": { "*": ["storageLayout", "evm.methodIdentifiers"] },
      },
    },
  },
  networks: {
    localRehearsal: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
      accounts: { count: 1024 },
      blockGasLimit: 30000000,
    },
  },
  test: { mocha: { timeout: 120000 } },
});
