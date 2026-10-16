import { readFileSync } from 'node:fs';
import { Interface, type JsonRpcProvider } from 'ethers';
import { describe, expect, it } from 'vitest';
import { type CaptureLimits, capture } from './backup';
import { assertRestorable, canonicalJson, checksum } from './state';

const ADDRESS = '0x0000000000000000000000000000000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
const HASH = `0x${'11'.repeat(32)}`;
const BIG = 9007199254740993n;
const ABI = [
  ...['name', 'version', 'unit', 'symbol'].map((name) => `function ${name}() view returns (string)`),
  ...[
    'decimals',
    'custodyType',
    'getContractType',
    'getWhitelistCount',
    'getLedgerOwnerCount',
    'getSecTokenBatch_MaxId',
    'getSecToken_BaseId',
    'getSecToken_MaxId',
    'getSecToken_totalMintedQty',
    'getSecToken_totalBurnedQty',
  ].map((name) => `function ${name}() view returns (uint256)`),
  'function deploymentOwner() view returns (address)',
  'function readOnly() view returns (bool)',
  'function getContractSeal() view returns (bool)',
  ...['getOwners', 'getWhitelist', 'getLedgerOwners'].map((name) => `function ${name}() view returns (address[])`),
  'function getCcyTypes() view returns (tuple(tuple(uint256 id,string name)[] ccyTypes))',
  'function getSecTokenTypes() view returns (tuple(tuple(uint256 id,string name)[] tokenTypes))',
  'function getAllEntities() view returns (uint256[])',
  'function getAllEntitiesWithFeeOwners() view returns (tuple(uint256 id,address addr)[])',
  'function getEntityAddresses(uint256) view returns (address[])',
  'function getLedgerEntry(address) view returns (tuple(bool exists,tuple(uint256 stId,int256 currentQty)[] tokens))',
  'function getAccountEntity(address) view returns (uint256)',
  'function getSecTokenBatch(uint256) view returns (tuple(uint256 id))',
  'function getSecToken(uint256) view returns (tuple(uint256 stId,int256 currentQty))',
  'function getFee(uint8,uint256,uint256,address) view returns (tuple(uint256 fee_fixed,bool ccy_mirrorFee))',
  'function facets() view returns (tuple(address facetAddress,bytes4[] functionSelectors)[])',
];
const iface = new Interface(ABI);

function mock(
  options: {
    driftAt?: number;
    chain?: string;
    fail?: string;
    span?: bigint;
    batchMax?: bigint;
    emptyFinalized?: boolean;
  } = {},
) {
  const calls: { method: string; params: unknown[] }[] = [];
  let canonicalReads = 0;
  const send = async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    if (method === options.fail) throw new Error('https://private.invalid?credential=hidden');
    if (method === 'eth_chainId') return options.chain ?? '0x7a69';
    if (method === 'eth_getBlockByNumber') {
      if (params[0] === 'finalized' && options.emptyFinalized) return null;
      if (params[0] !== 'finalized') canonicalReads++;
      return { number: '0x20', hash: canonicalReads === options.driftAt ? `0x${'22'.repeat(32)}` : HASH };
    }
    if (method === 'eth_getCode') return '0x6000';
    if (method !== 'eth_call') throw new Error('Unexpected RPC');
    const tx = params[0] as { data: string };
    const parsed = iface.parseTransaction(tx);
    if (!parsed) throw new Error('Unknown mock getter');
    const values: Record<string, unknown> = {
      name: 'fixture',
      version: '2',
      unit: 'units',
      symbol: 'TEST',
      decimals: 0n,
      deploymentOwner: ADDRESS,
      custodyType: 0n,
      readOnly: true,
      getContractType: 0n,
      getContractSeal: true,
      getOwners: [ADDRESS],
      getCcyTypes: [[[1n, 'currency']]],
      getSecTokenTypes: [[[1n, 'token']]],
      getAllEntities: [BIG],
      getAllEntitiesWithFeeOwners: [[BIG, OTHER]],
      getWhitelist: [OTHER],
      getWhitelistCount: 1n,
      getLedgerOwners: [ADDRESS],
      getLedgerOwnerCount: 1n,
      getEntityAddresses: [OTHER],
      getLedgerEntry: [true, [[BIG, -BIG]]],
      getAccountEntity: BIG,
      getSecTokenBatch_MaxId: options.batchMax ?? 1n,
      getSecTokenBatch: [1n],
      getSecToken_BaseId: BIG,
      getSecToken_MaxId: BIG + (options.span ?? 1n),
      getSecToken_totalMintedQty: BIG,
      getSecToken_totalBurnedQty: 0n,
      getSecToken: [parsed.name === 'getSecToken' ? parsed.args[0] : 0n, -BIG],
      getFee: [BIG, false],
      facets: [[OTHER, ['0x12345678']]],
    };
    return iface.encodeFunctionResult(parsed.fragment, [values[parsed.name]]);
  };
  return { provider: { send } as unknown as JsonRpcProvider, calls };
}

describe('bounded getter evidence', () => {
  it('pins every call and code read, including facets, to finalized block', async () => {
    const source = mock();
    const snapshot = await capture(source.provider, ADDRESS, ABI, 31337n);
    expect(snapshot.source.blockHash).toBe(HASH);
    expect(snapshot.code.map((item) => item.address)).toEqual([ADDRESS, OTHER]);
    for (const call of source.calls.filter((item) => ['eth_call', 'eth_getCode'].includes(item.method)))
      expect(call.params[1]).toBe('0x20');
    expect(source.calls.filter((item) => item.method === 'eth_getBlockByNumber').map((item) => item.params[0])).toEqual(
      ['finalized', '0x20', '0x20'],
    );
    expect(snapshot.records.filter((item) => item.method === 'getFee')).toHaveLength(6);
  });
  it('retains integers above 2^53, signed values and orphan global tokens', async () => {
    const snapshot = await capture(mock().provider, ADDRESS, ABI, 31337n);
    const tokens = snapshot.records.filter((item) => item.method === 'getSecToken');
    expect(tokens.map((item) => item.args)).toEqual([[BIG.toString()], [(BIG + 1n).toString()]]);
    expect(tokens[0].value).toEqual({ stId: BIG.toString(), currentQty: (-BIG).toString() });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });
  it.each([1, 2])('rejects source drift at canonical check %s', async (driftAt) => {
    await expect(capture(mock({ driftAt }).provider, ADDRESS, ABI, 31337n)).rejects.toThrow('Source block drift');
  });
  it('rejects wrong chain before contract reads', async () => {
    const source = mock({ chain: '0x1' });
    await expect(capture(source.provider, ADDRESS, ABI, 31337n)).rejects.toThrow('Unexpected chain ID');
    expect(source.calls).toHaveLength(1);
  });
  it('requires finalized provenance', async () => {
    await expect(capture(mock({ emptyFinalized: true }).provider, ADDRESS, ABI, 31337n)).rejects.toThrow(
      'Finalized block unavailable',
    );
  });
  it.each([
    [{ maxCalls: 2 }, {}, 'call bound'],
    [{ maxTokenSpan: 1 }, {}, 'token span bound'],
    [{ maxBatches: 1 }, { batchMax: 2n }, 'batch bound'],
    [{ maxItems: 1 }, {}, 'address bound'],
    [{ maxCalls: 0 }, {}, 'Invalid capture limit'],
  ])('fails instead of truncating at limits %j', async (limits, options, message) => {
    await expect(
      capture(mock(options).provider, ADDRESS, ABI, 31337n, limits as Partial<CaptureLimits>),
    ).rejects.toThrow(message);
  });
  it('aborts RPC failures without exposing endpoint details', async () => {
    await expect(capture(mock({ fail: 'eth_call' }).provider, ADDRESS, ABI, 31337n)).rejects.toThrow(
      /^Capture RPC failed: eth_call$/,
    );
  });
  it('cannot bypass omissions by editing coverage', async () => {
    const snapshot = await capture(mock().provider, ADDRESS, ABI, 31337n);
    expect(() => assertRestorable(snapshot)).toThrow('allowances');
    snapshot.coverage.forEach((item) => {
      item.status = 'observed';
    });
    expect(() => assertRestorable(snapshot)).toThrow('futuresOverrides');
    snapshot.coverage = [];
    expect(() => assertRestorable(snapshot)).toThrow('types');
  });
  it('does not import stale cache or deployment helpers', async () => {
    const source = readFileSync(new URL('./backup.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/(?:readFile|require\(|from ['"].*(?:utils|const|truffle|orm|cache))/);
    // Each capture reads the provider again; no previous-ledger or cache input exists.
    const first = mock();
    const second = mock();
    await capture(first.provider, ADDRESS, ABI, 31337n);
    await capture(second.provider, ADDRESS, ABI, 31337n);
    expect(second.calls).toEqual(first.calls);
  });
  it('canonical JSON and checksum are stable across object key order', () => {
    expect(canonicalJson({ z: '2', a: { b: '1', a: true } })).toBe('{"a":{"a":true,"b":"1"},"z":"2"}');
    expect(checksum({ a: '1', b: '2' })).toBe(checksum({ b: '2', a: '1' }));
    expect(checksum({ a: ['1', '2'] })).not.toBe(checksum({ a: ['2', '1'] }));
    expect(() => canonicalJson({ bad: Number(BIG) })).toThrow();
  });
});
