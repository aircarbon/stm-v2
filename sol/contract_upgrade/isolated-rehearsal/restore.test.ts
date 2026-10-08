import { Interface } from 'ethers';
import { describe, expect, it } from 'vitest';
import { compareRecords, isolatedSelectors, mapAdminSigners } from './restore';
import type { Snapshot } from './state';

const old = '0x0000000000000000000000000000000000000011';
const next = '0x0000000000000000000000000000000000000022';
function source(): Snapshot {
  return {
    schema: 'stm-v2-getter-evidence/1',
    source: {
      chainId: '31337',
      address: '0x0000000000000000000000000000000000000033',
      blockNumber: '1',
      blockHash: `0x${'11'.repeat(32)}`,
    },
    records: [
      { method: 'getOwners', args: [], value: [old] },
      { method: 'deploymentOwner', args: [], value: old },
    ],
    code: [],
    coverage: [],
  };
}
describe('isolated restore policies', () => {
  it('excludes unguarded init, seal, upgrades and business mutations', () => {
    const abi = [
      'function init(address[])',
      'function sealContract()',
      'function diamondCut()',
      'function burnTokens()',
      'function mint()',
      'function setTokenTotals(uint256,uint256,uint256,uint256)',
      'function getOwners() view returns(address[])',
    ];
    const iface = new Interface(abi);
    expect(isolatedSelectors(abi)).toEqual([
      iface.getFunction('setTokenTotals')?.selector,
      iface.getFunction('getOwners')?.selector,
    ]);
  });
  it('maps only approved administrative identities and leaves source immutable', () => {
    const before = source();
    const result = mapAdminSigners(before, [{ oldAddress: old, newAddress: next }]);
    expect(result.snapshot.records.map((r) => r.value)).toEqual([[next], next]);
    expect(before.records[0].value).toEqual([old]);
  });
  it('rejects business-address remapping and mapping collisions', () => {
    const before = source();
    before.records.push({ method: 'getLedgerEntry', args: [old], value: { balance: '9' } });
    expect(() => mapAdminSigners(before, [{ oldAddress: old, newAddress: next }])).toThrow('business state');
    expect(() => mapAdminSigners(source(), [{ oldAddress: old, newAddress: source().source.address }])).toThrow(
      'collision',
    );
    expect(() =>
      mapAdminSigners(source(), [
        { oldAddress: old, newAddress: next },
        { oldAddress: old, newAddress: next },
      ]),
    ).toThrow();
  });
  it('compares exact records, not counts or rounded quantities', () => {
    const a = [{ method: 'tokens', args: [], value: ['9007199254740993', '2'] }];
    compareRecords(a, structuredClone(a));
    expect(() => compareRecords(a, [{ ...a[0], value: ['9007199254740992', '2'] }])).toThrow();
    expect(() => compareRecords(a, [{ ...a[0], value: ['2', '9007199254740993'] }])).toThrow();
  });
});
