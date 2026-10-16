import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { configVariable, defineConfig } from "hardhat/config";
import { uatProfiles } from "./scripts/uat.ts";

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
    ...Object.fromEntries(
      Object.entries(uatProfiles).map(([name, profile]) => [
        name,
        {
          type: "http" as const,
          chainType: "generic" as const,
          chainId: profile.chainId,
          url: configVariable(profile.urlVariable),
          accounts: [],
          timeout: 120000,
        },
      ]),
    ),
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
