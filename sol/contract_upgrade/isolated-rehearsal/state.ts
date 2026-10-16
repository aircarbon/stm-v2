import { sha256, toUtf8Bytes } from 'ethers';

export type JsonValue = null | boolean | string | number | JsonValue[] | { [key: string]: JsonValue };
export interface GetterRecord {
  method: string;
  args: JsonValue[];
  value: JsonValue;
}
export interface Coverage {
  group: string;
  fields: string[];
  status: 'observed' | 'omitted';
  reason: string;
}
export interface Snapshot {
  schema: 'stm-v2-getter-evidence/1';
  source: { chainId: string; address: string; blockNumber: string; blockHash: string };
  records: GetterRecord[];
  code: { address: string; bytecode: string; hash: string }[];
  coverage: Coverage[];
}

// These groups are fixed policy, not a caller-supplied exclusion list.
export const REQUIRED_GROUPS: ReadonlyArray<Coverage> = [
  {
    group: 'identity',
    fields: [
      'MainStorage.name',
      'version',
      'symbol',
      'decimals',
      'unit',
      'deploymentOwner',
      'owners',
      'custodyType',
      'readOnlyState',
      'ld.contractType',
      'ld._contractSealed',
    ],
    status: 'observed',
    reason: 'direct getters, including unit and lifecycle flags',
  },
  {
    group: 'types',
    fields: [
      'ctd._ct_Ccy',
      'ctd._ct_Count',
      'std._tt_name',
      'std._tt_settle',
      'std._tt_ft',
      'std._tt_addr',
      'std._tt_Count',
    ],
    status: 'observed',
    reason: 'complete type getter arrays',
  },
  {
    group: 'entities',
    fields: ['entities', 'entityExists', 'feeAddrPerEntity', 'entitiesPerAddress', 'addressesPerEntity'],
    status: 'omitted',
    reason: 'entity lists and known address assignments recorded; arbitrary mapping keys cannot be enumerated',
  },
  {
    group: 'whitelist',
    fields: ['erc20d._whitelist', 'erc20d._whitelisted'],
    status: 'omitted',
    reason: 'exact whitelist array recorded; membership mapping outside list is not enumerable',
  },
  {
    group: 'allowances',
    fields: ['erc20d._allowances'],
    status: 'omitted',
    reason: 'arbitrary owner/spender pairs cannot be enumerated',
  },
  {
    group: 'ledgers',
    fields: [
      'ld._ledgerOwners',
      'ld._ledger.exists',
      'tokenType_stIds',
      'ccyType_balance',
      'ccyType_reserved',
      'spot_sumQtyMinted',
      'spot_sumQtyBurned',
    ],
    status: 'omitted',
    reason: 'all enumerated ledger entries recorded; raw token ordering and unknown mapping keys are not exposed',
  },
  {
    group: 'tokens',
    fields: [
      'ld._sts.batchId',
      'mintedQty',
      'currentQty',
      'ft_price',
      'ft_ledgerOwner',
      'ft_lastMarkPrice',
      'ft_PL',
      'ld._tokens_base_id',
      'ld._tokens_currentMax_id',
    ],
    status: 'omitted',
    reason: 'inclusive base/max range recorded; out-of-range mapping keys and derived type identity are not proven',
  },
  {
    group: 'batches',
    fields: [
      'ld._batches.id',
      'mintedTimestamp',
      'tokTypeId',
      'mintedQty',
      'burnedQty',
      'metaKeys',
      'metaValues',
      'origTokFee',
      'origCcyFee_percBips_ExFee',
      'originator',
      'ld._batches_currentMax_id',
    ],
    status: 'omitted',
    reason: 'all sequential batches recorded; unknown mapping keys are not enumerable',
  },
  {
    group: 'totals',
    fields: ['ld._spot_totalMintedQty', 'ld._spot_totalBurnedQty'],
    status: 'observed',
    reason: 'direct getters',
  },
  {
    group: 'fees',
    fields: [
      'entityGlobalFees',
      'ld._ledger.spot_customFees',
      'FeeStruct.tok',
      'FeeStruct.ccy',
      'FeeStruct.tokType_Set',
      'FeeStruct.ccyType_Set',
    ],
    status: 'omitted',
    reason: 'known entity/address/type fees recorded; set flags and unknown keys are not exposed',
  },
  {
    group: 'futuresOverrides',
    fields: ['ld._ledger.ft_initMarginBips', 'ld._ledger.ft_feePerContract'],
    status: 'omitted',
    reason: 'per-ledger override mappings have no ordinary enumeration getters',
  },
  {
    group: 'diamond',
    fields: ['DiamondStorage.facetAddressAndSelectorPosition', 'selectors', 'supportedInterfaces', 'contractOwner'],
    status: 'omitted',
    reason:
      'optional loupe/owner evidence cannot prove selector positions, unknown routing keys or interface mapping completeness',
  },
];

for (const group of REQUIRED_GROUPS) {
  Object.freeze(group.fields);
  Object.freeze(group);
}
Object.freeze(REQUIRED_GROUPS);

export function canonicalJson(value: unknown): string {
  function encode(input: unknown): string {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return JSON.stringify(input);
    if (typeof input === 'number' && Number.isSafeInteger(input)) return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(encode).join(',')}]`;
    if (typeof input === 'object' && input !== null) {
      return `{${Object.keys(input)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode((input as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    }
    throw new Error('Non-canonical JSON value');
  }
  return encode(value);
}

export function checksum(value: unknown): string {
  return sha256(toUtf8Bytes(canonicalJson(value)));
}

export function assertRestorable(snapshot: Snapshot): void {
  const omissions = REQUIRED_GROUPS.filter(
    (required) =>
      required.status === 'omitted' ||
      snapshot.coverage.filter((actual) => actual.group === required.group && actual.status === 'observed').length !==
        1,
  );
  if (omissions.length)
    throw new Error(`Snapshot is not restorable: ${omissions.map((item) => item.group).join(', ')}`);
}
