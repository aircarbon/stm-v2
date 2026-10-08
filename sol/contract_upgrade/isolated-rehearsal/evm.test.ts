import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserProvider, Contract, ContractFactory, Interface, type InterfaceAbi } from 'ethers';
import { describe, expect, it } from 'vitest';
import { planHash, runJournal } from './journal';
import { isolatedSelectors } from './restore';

const require = createRequire(import.meta.url);
const solc = require('solc') as { compile: (input: string) => string };
const ganache = require('ganache') as {
  provider: (options: unknown) => {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    disconnect: () => Promise<void>;
  };
};
interface Artifact {
  abi: InterfaceAbi;
  evm: {
    bytecode: { object: string; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> };
  };
}
const here = dirname(fileURLToPath(import.meta.url));
const sol = resolve(here, '../..');

async function compile() {
  const sources: Record<string, { content: string }> = {};
  async function add(path: string): Promise<void> {
    if (sources[path]) return;
    const content = await readFile(join(sol, path), 'utf8');
    sources[path] = { content };
    for (const match of content.matchAll(/from\s+"([^"]+)"/g)) {
      const dependency = resolve(sol, dirname(path), match[1]).slice(sol.length + 1);
      await add(dependency);
    }
  }
  for (const path of [
    'contract_upgrade/isolated-rehearsal/IsolatedRehearsal.sol',
    'contracts/libraries/LoadLib.sol',
    'contracts/facets/StMasterFacet.sol',
    'contracts/facets/OwnedFacet.sol',
  ])
    await add(path);
  // Synthetic facet delegates to the real repository LoadLib, with narrow reads
  // to make the asymmetric token quantities and membership easy to verify.
  sources['Fixture.sol'] = {
    content: `pragma solidity 0.8.5;
import {LoadLib} from "contracts/libraries/LoadLib.sol";
import {LibMainStorage} from "contracts/libraries/LibMainStorage.sol";
contract Fixture {
 function addSecToken(address a,uint64 b,uint256 i,uint256 t,int64 m,int64 q,int128 p,int128 l,address o,int128 pl) external {
   LoadLib.addSecToken(LibMainStorage.getStorage().ld,a,b,i,t,m,q,p,l,o,pl);
 }
 function token(uint256 i) external view returns(int64,int64) {return (LibMainStorage.getStorage().ld._sts[i].mintedQty,LibMainStorage.getStorage().ld._sts[i].currentQty);}
 function ids(address a,uint256 t) external view returns(uint256[] memory) {return LibMainStorage.getStorage().ld._ledger[a].tokenType_stIds[t];}
}`,
  };
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
        },
      }),
    ),
  );
  const errors = (compiled.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  return compiled.contracts as Record<string, Record<string, Artifact>>;
}

describe('disposable in-memory STM loader rehearsal', () => {
  it('loads real STM token storage, resumes without duplicates, and rejects outsiders and sealing', async () => {
    const contracts = await compile();
    const chain = ganache.provider({
      logging: { quiet: true },
      wallet: { deterministic: true },
      chain: { chainId: 31337 },
    });
    const provider = new BrowserProvider(chain, undefined, { cacheTimeout: -1 });
    const directory = await mkdtemp(join(tmpdir(), 'stm-synthetic-'));
    try {
      const signer = await provider.getSigner(0);
      const operator = await signer.getAddress();
      const outsider = await provider.getSigner(1);
      const deployed = new Map<string, string>();
      async function deploy(file: string, name: string, args: unknown[] = []): Promise<string> {
        const key = `${file}:${name}`;
        const artifact = contracts[file][name];
        let bytecode = artifact.evm.bytecode.object;
        for (const [libraryFile, libraries] of Object.entries(artifact.evm.bytecode.linkReferences)) {
          for (const [libraryName, refs] of Object.entries(libraries)) {
            const address = deployed.get(`${libraryFile}:${libraryName}`) ?? (await deploy(libraryFile, libraryName));
            for (const ref of refs)
              bytecode =
                bytecode.slice(0, ref.start * 2) +
                address.slice(2).toLowerCase() +
                bytecode.slice((ref.start + ref.length) * 2);
          }
        }
        const contract = await new ContractFactory(artifact.abi, bytecode, signer).deploy(...args);
        await contract.waitForDeployment();
        const address = await contract.getAddress();
        deployed.set(key, address);
        return address;
      }
      const routes: { selector: string; facet: string }[] = [];
      for (const [file, name] of [
        ['Fixture.sol', 'Fixture'],
        ['contracts/facets/StMasterFacet.sol', 'StMasterFacet'],
        ['contracts/facets/OwnedFacet.sol', 'OwnedFacet'],
      ]) {
        const facet = await deploy(file, name);
        for (const selector of isolatedSelectors(contracts[file][name].abi)) routes.push({ selector, facet });
      }
      const snapshotHash = `0x${'33'.repeat(32)}`;
      const identity = ['fixture', '2', 'units', 'TEST', 0, [operator], operator, 0];
      const target = await deploy('contract_upgrade/isolated-rehearsal/IsolatedRehearsal.sol', 'IsolatedRehearsal', [
        operator,
        snapshotHash,
        identity,
        routes,
      ]);
      const token = new Contract(target, contracts['Fixture.sol'].Fixture.abi, signer);
      const master = new Contract(target, contracts['contracts/facets/StMasterFacet.sol'].StMasterFacet.abi, signer);
      const owner = new Contract(target, contracts['contracts/facets/OwnedFacet.sol'].OwnedFacet.abi, signer);
      expect(await master.getContractSeal()).toBe(false);
      expect(await owner.getOwners()).toEqual([operator]);
      const iface = new Interface(contracts['Fixture.sol'].Fixture.abi);
      const quantity = 9007199254740993n;
      const request = {
        to: target,
        data: iface.encodeFunctionData('addSecToken', [operator, 3, 7, 2, quantity, quantity - 9n, 0, 0, operator, 0]),
        gasLimit: 400000n,
        gasPrice: 2000000000n,
        type: 0,
      };
      const operation = {
        id: 'token-7',
        stateHash: `0x${'44'.repeat(32)}`,
        request,
        readBefore: async () => (await token.ids(operator, 2)).length === 0,
        readAfter: async () => {
          const [minted, current] = await token.token(7);
          return (
            minted === quantity &&
            current === quantity - 9n &&
            JSON.stringify((await token.ids(operator, 2)).map(String)) === '["7"]'
          );
        },
      };
      // Browser RPC signer cannot signTransaction; use a synthetic private key
      // generated by the disposable chain, never a real environment signer.
      const { Wallet } = await import('ethers');
      const accounts = (
        chain as unknown as { getInitialAccounts: () => Record<string, { secretKey: string }> }
      ).getInitialAccounts();
      const wallet = new Wallet(accounts[operator.toLowerCase()].secretKey, provider);
      const nonce = await provider.getTransactionCount(operator);
      const options = {
        path: join(directory, 'journal.json'),
        signer: wallet,
        expectedChainId: 31337n,
        context: {
          chainId: '31337',
          source: '0x0000000000000000000000000000000000000001',
          target,
          snapshotHash,
          planHash: planHash([operation]),
          signerAddress: operator,
          startingNonce: nonce,
        },
        operations: [operation],
        maxPolls: 2,
        pollIntervalMs: 0,
      };
      await runJournal(options);
      await runJournal(options);
      expect(await token.ids(operator, 2)).toEqual([7n]);
      expect(await provider.getTransactionCount(operator)).toBe(nonce + 1);
      const denied = await outsider.sendTransaction(request);
      await expect(denied.wait()).rejects.toThrow();
      await expect(master.sealContract()).rejects.toThrow();
      await expect(owner.init([await outsider.getAddress()], 0)).rejects.toThrow();
      expect(await master.getContractSeal()).toBe(false);
    } finally {
      provider.destroy();
      await chain.disconnect();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
