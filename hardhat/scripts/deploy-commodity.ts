import assert from "node:assert/strict";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import { Contract, type Interface, type Signer, ZeroAddress } from "ethers";
import type { ArtifactManager } from "hardhat/types/artifacts";
import type { LocalJournal } from "./local-journal.ts";

const libraries = [
  "StructLib",
  "LibMainStorage",
  "ValidationLib",
  "CcyLib",
  "LedgerLib",
  "LoadLib",
  "SpotFeeLib",
  "TransferLib",
  "TransferLibView",
  "Erc20Lib",
  "TokenLib",
];
const plainFacets = [
  "DiamondLoupeFacet",
  "CcyCollateralizableFacet",
  "DataLoadableFacet",
  "StBurnableFacet",
  "StFeesFacet",
  "StLedgerFacet",
  "StMintableFacet",
  "StTransferableFacet",
];

export type CommodityConfig = {
  owners: string[];
  custodyType: 0 | 1;
  name: string;
  version: string;
  symbol: string;
  unit: string;
  gitCommit: string;
};
export type Manifest = {
  config: CommodityConfig;
  chainId: number;
  proxy: string;
  contracts: { name: string; address: string; txHash: string }[];
  functions: {
    name: string;
    selector: string;
    address: string;
    txHash: string;
    initAddress: string;
    calldata: string;
  }[];
  abi: string[];
};

export function selectors(abi: Interface) {
  const result: { name: string; selector: string }[] = [];
  abi.forEachFunction((fragment) => {
    if (fragment.name !== "init")
      result.push({
        name: fragment.format("sighash"),
        selector: fragment.selector,
      });
  });
  return result;
}

export async function deployCommodity(
  ethers: HardhatEthers,
  artifacts: ArtifactManager,
  signer: Signer,
  journal: LocalJournal,
  config: CommodityConfig,
): Promise<Manifest> {
  assert.equal(
    (await ethers.provider.getNetwork()).chainId,
    31337n,
    "Local chain only",
  );
  assert.equal(
    config.owners.length,
    10,
    "Preserve the ten reserved owner addresses",
  );
  assert.equal(
    new Set(config.owners.map((owner) => owner.toLowerCase())).size,
    10,
  );
  assert.equal(config.owners[0], await signer.getAddress());
  const addresses: Record<string, string> = {};
  const manifest: Manifest = {
    config,
    chainId: 31337,
    proxy: "",
    contracts: [],
    functions: [],
    abi: [],
  };
  async function deploy(name: string, args: unknown[] = []) {
    const artifact = await artifacts.readArtifact(name);
    const links: Record<string, string> = {};
    for (const references of Object.values(artifact.linkReferences)) {
      for (const library of Object.keys(references)) {
        assert.ok(
          addresses[library],
          `Missing prior library ${library} for ${name}`,
        );
        links[library] = addresses[library];
      }
    }
    const factory = await ethers.getContractFactory(name, {
      signer,
      libraries: links,
    });
    const receipt = await journal.send(
      `deploy-${name}`,
      await factory.getDeployTransaction(...args),
    );
    assert.ok(receipt.contractAddress);
    addresses[name] = receipt.contractAddress;
    manifest.contracts.push({
      name,
      address: receipt.contractAddress,
      txHash: receipt.hash,
    });
    return factory.interface;
  }
  const cutInterface = await deploy("DiamondCutFacet");
  await deploy("DiamondProxy", [config.owners[0], addresses.DiamondCutFacet]);
  manifest.proxy = addresses.DiamondProxy;
  const libraryEvents: string[] = [];
  for (const name of libraries) {
    const abi = await deploy(name);
    libraryEvents.push(
      ...abi.fragments
        .filter((fragment) => fragment.type === "event")
        .map((fragment) => fragment.format("full")),
    );
  }
  const facetInterfaces = new Map<string, Interface>([
    ["DiamondCutFacet", cutInterface],
  ]);
  for (const name of plainFacets) facetInterfaces.set(name, await deploy(name));
  async function cut(
    names: string[],
    initAddress = ZeroAddress,
    calldata = "0x",
  ) {
    const cuts = names.map((name) => ({
      facetAddress: addresses[name],
      action: 0,
      functionSelectors: selectors(facetInterfaces.get(name) as Interface).map(
        (entry) => entry.selector,
      ),
    }));
    const receipt = await journal.send(`cut-${names.join("-")}`, {
      to: manifest.proxy,
      data: cutInterface.encodeFunctionData("diamondCut", [
        cuts,
        initAddress,
        calldata,
      ]),
    });
    for (const name of names) {
      for (const entry of selectors(facetInterfaces.get(name) as Interface)) {
        manifest.functions.push({
          ...entry,
          address: addresses[name],
          txHash: receipt.hash,
          initAddress,
          calldata,
        });
      }
    }
  }
  await cut(plainFacets);
  const initialized: [string, unknown[]][] = [
    ["OwnedFacet", [config.owners, config.custodyType]],
    ["StErc20Facet", [config.symbol, 0]],
    ["StMasterFacet", [0, config.name, config.version, config.unit]],
  ];
  for (const [name, args] of initialized) {
    const abi = await deploy(name);
    facetInterfaces.set(name, abi);
    await cut([name], addresses[name], abi.encodeFunctionData("init", args));
  }
  // Keep events, overloads and tuple shapes; exclude constructors and unsafe init entry points.
  const fragments = [...facetInterfaces.values()].flatMap((abi) =>
    abi.fragments
      .filter(
        (fragment) =>
          fragment.type === "event" ||
          (fragment.type === "function" &&
            "name" in fragment &&
            fragment.name !== "init"),
      )
      .map((fragment) => fragment.format("full")),
  );
  manifest.abi = [...new Set([...fragments, ...libraryEvents])];
  const proxy = new Contract(manifest.proxy, manifest.abi, signer);
  assert.deepEqual(Array.from(await proxy.getOwners()), config.owners);
  assert.equal(await proxy.name(), config.name);
  assert.equal(await proxy.version(), config.version);
  for (const entry of manifest.functions)
    assert.equal(await proxy.facetAddress(entry.selector), entry.address);
  return manifest;
}

export async function replaceFacet(
  ethers: HardhatEthers,
  artifacts: ArtifactManager,
  signer: Signer,
  journal: LocalJournal,
  manifest: Manifest,
  name: string,
) {
  assert.equal(
    (await ethers.provider.getNetwork()).chainId,
    31337n,
    "Local chain only",
  );
  const previous = manifest.contracts.find(
    (contract) => contract.name === name,
  );
  assert.ok(
    previous && name.endsWith("Facet") && name !== "DiamondCutFacet",
    "Choose an installed application facet",
  );
  const artifact = await artifacts.readArtifact(name);
  const links: Record<string, string> = {};
  for (const references of Object.values(artifact.linkReferences))
    for (const library of Object.keys(references)) {
      const deployed = manifest.contracts.find(
        (contract) => contract.name === library,
      );
      assert.ok(deployed, `Missing library ${library}`);
      links[library] = deployed.address;
    }
  const factory = await ethers.getContractFactory(name, {
    signer,
    libraries: links,
  });
  const receipt = await journal.send(
    `replacement-${name}`,
    await factory.getDeployTransaction(),
  );
  assert.ok(receipt.contractAddress);
  const proxy = new Contract(manifest.proxy, manifest.abi, signer);
  const entries = selectors(factory.interface);
  assert.deepEqual(
    entries.map((entry) => entry.selector).sort(),
    manifest.functions
      .filter((entry) => entry.address === previous.address)
      .map((entry) => entry.selector)
      .sort(),
    "Replacement must preserve the selector set",
  );
  const tx = await journal.send(`replace-cut-${name}`, {
    to: manifest.proxy,
    data: proxy.interface.encodeFunctionData("diamondCut", [
      [
        {
          facetAddress: receipt.contractAddress,
          action: 1,
          functionSelectors: entries.map((entry) => entry.selector),
        },
      ],
      ZeroAddress,
      "0x",
    ]),
  });
  for (const entry of entries)
    assert.equal(
      await proxy.facetAddress(entry.selector),
      receipt.contractAddress,
    );
  return {
    address: receipt.contractAddress,
    deploymentTx: receipt.hash,
    cutTx: tx.hash,
  };
}
