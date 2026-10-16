import { getAddress, Interface, type InterfaceAbi, type JsonRpcProvider, keccak256, type ParamType } from 'ethers';
import { type JsonValue, REQUIRED_GROUPS, type Snapshot } from './state';

export interface CaptureLimits {
  maxCalls: number;
  maxItems: number;
  maxTokenSpan: number;
  maxBatches: number;
  maxResponseBytes: number;
  timeoutMs: number;
}
const DEFAULT_LIMITS: CaptureLimits = {
  maxCalls: 100_000,
  maxItems: 100_000,
  maxTokenSpan: 100_000,
  maxBatches: 10_000,
  maxResponseBytes: 16_000_000,
  timeoutMs: 30_000,
};
const ZERO = '0x0000000000000000000000000000000000000000';

/** Read-only evidence capture. No cache, signer, deployment configuration or filesystem access. */
export async function capture(
  provider: JsonRpcProvider,
  contractAddress: string,
  abi: InterfaceAbi,
  expectedChainId: bigint,
  limits: Partial<CaptureLimits> = {},
): Promise<Snapshot> {
  const bounds = { ...DEFAULT_LIMITS, ...limits };
  for (const value of Object.values(bounds)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid capture limit');
  }
  const address = getAddress(contractAddress);
  const iface = new Interface(abi);
  let calls = 0;
  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    if (++calls > bounds.maxCalls) throw new Error('Capture call bound exceeded');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result: unknown = await Promise.race([
        provider.send(method, params),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error()), bounds.timeoutMs);
        }),
      ]);
      if (JSON.stringify(result).length > bounds.maxResponseBytes) throw new Error();
      return result;
    } catch {
      throw new Error(`Capture RPC failed: ${method}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function integer(value: unknown): bigint {
    if (typeof value !== 'string' || !/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value))
      throw new Error('Invalid integer evidence');
    return BigInt(value);
  }
  async function chain(): Promise<void> {
    if (integer(await rpc('eth_chainId', [])) !== expectedChainId) throw new Error('Unexpected chain ID');
  }
  await chain();
  const block = (await rpc('eth_getBlockByNumber', ['finalized', false])) as { number?: string; hash?: string } | null;
  if (!block?.number || !block.hash || !/^0x[0-9a-fA-F]{64}$/.test(block.hash))
    throw new Error('Finalized block unavailable');
  const number = integer(block.number);
  const tag = `0x${number.toString(16)}`;
  const hash = block.hash.toLowerCase();
  async function canonical(): Promise<void> {
    const current = (await rpc('eth_getBlockByNumber', [tag, false])) as typeof block;
    if (!current || integer(current.number) !== number || current.hash?.toLowerCase() !== hash)
      throw new Error('Source block drift');
  }
  await canonical();
  const snapshot: Snapshot = {
    schema: 'stm-v2-getter-evidence/1',
    source: { chainId: expectedChainId.toString(), address, blockNumber: number.toString(), blockHash: hash },
    records: [],
    code: [],
    coverage: REQUIRED_GROUPS.map((item) => ({ ...item, fields: [...item.fields] })),
  };
  function bounded(items: readonly unknown[]): void {
    if (items.length > bounds.maxItems) throw new Error('Capture item bound exceeded');
  }
  function json(param: ParamType, value: unknown): JsonValue {
    if (param.baseType === 'array') {
      const values = value as readonly unknown[];
      bounded(values);
      const child = param.arrayChildren;
      if (!child) throw new Error('Invalid array ABI');
      return values.map((item) => json(child, item));
    }
    if (param.baseType === 'tuple') {
      const values = value as readonly unknown[];
      if (!param.components) throw new Error('Invalid tuple ABI');
      return Object.fromEntries(param.components.map((child, i) => [child.name || String(i), json(child, values[i])]));
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    throw new Error('Invalid getter evidence');
  }
  async function read(method: string, args: JsonValue[] = []): Promise<JsonValue> {
    const fragment = iface.getFunction(method);
    if (!fragment || !['view', 'pure'].includes(fragment.stateMutability))
      throw new Error(`Missing read getter: ${method}`);
    const raw = await rpc('eth_call', [{ to: address, data: iface.encodeFunctionData(fragment, args) }, tag]);
    let value: JsonValue;
    try {
      const decoded = iface.decodeFunctionResult(fragment, raw as string);
      value =
        fragment.outputs.length === 1
          ? json(fragment.outputs[0], decoded[0])
          : Object.fromEntries(fragment.outputs.map((param, i) => [param.name || String(i), json(param, decoded[i])]));
    } catch {
      throw new Error(`Invalid getter result: ${method}`);
    }
    snapshot.records.push({ method, args, value });
    return value;
  }
  function list(value: JsonValue, field?: string): JsonValue[] {
    const result = field ? (value as Record<string, JsonValue>)[field] : value;
    if (!Array.isArray(result)) throw new Error('Invalid list evidence');
    bounded(result);
    return result;
  }
  function field(value: JsonValue, key: string): JsonValue {
    return (value as Record<string, JsonValue>)[key];
  }
  async function code(at: string): Promise<void> {
    const bytecode = await rpc('eth_getCode', [getAddress(at), tag]);
    if (typeof bytecode !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(bytecode))
      throw new Error('Source code unavailable');
    snapshot.code.push({ address: getAddress(at), bytecode, hash: keccak256(bytecode) });
  }
  await code(address);
  for (const method of [
    'name',
    'version',
    'unit',
    'symbol',
    'decimals',
    'deploymentOwner',
    'custodyType',
    'readOnly',
    'getContractType',
    'getContractSeal',
  ])
    await read(method);
  const owners = list(await read('getOwners'));
  const currencies = list(await read('getCcyTypes'), 'ccyTypes');
  const types = list(await read('getSecTokenTypes'), 'tokenTypes');
  const entities = list(await read('getAllEntities'));
  const feeOwners = list(await read('getAllEntitiesWithFeeOwners'));
  if (entities.length !== feeOwners.length || entities.some((id, i) => id !== field(feeOwners[i], 'id')))
    throw new Error('Entity evidence mismatch');
  const whitelist = list(await read('getWhitelist()'));
  if (integer(await read('getWhitelistCount')) !== BigInt(whitelist.length))
    throw new Error('Whitelist evidence mismatch');
  const ledgerOwners = list(await read('getLedgerOwners'));
  if (integer(await read('getLedgerOwnerCount')) !== BigInt(ledgerOwners.length))
    throw new Error('Ledger owner evidence mismatch');
  const addresses = new Set<string>();
  function add(values: JsonValue[]): void {
    for (const item of values) addresses.add(getAddress(item as string));
    if (addresses.size > bounds.maxItems) throw new Error('Capture address bound exceeded');
  }
  add([...owners, ...whitelist, ...ledgerOwners, ...feeOwners.map((item) => field(item, 'addr'))]);
  for (const id of entities) add(list(await read('getEntityAddresses', [id])));
  const ledgerTokens = new Set<string>();
  for (const owner of ledgerOwners) {
    const entry = await read('getLedgerEntry', [owner]);
    for (const token of list(entry, 'tokens')) ledgerTokens.add(String(field(token, 'stId')));
  }
  for (const account of addresses) await read('getAccountEntity', [account]);
  const batchMax = integer(await read('getSecTokenBatch_MaxId'));
  if (batchMax > BigInt(bounds.maxBatches)) throw new Error('Capture batch bound exceeded');
  for (let id = 1n; id <= batchMax; id++) await read('getSecTokenBatch', [id.toString()]);
  const base = integer(await read('getSecToken_BaseId'));
  const max = integer(await read('getSecToken_MaxId'));
  await read('getSecToken_totalMintedQty');
  await read('getSecToken_totalBurnedQty');
  if ((max === 0n && base !== 0n) || (max !== 0n && (base === 0n || base > max)))
    throw new Error('Invalid token range');
  if (max !== 0n && max - base + 1n > BigInt(bounds.maxTokenSpan)) throw new Error('Capture token span bound exceeded');
  for (let id = base; max !== 0n && id <= max; id++) {
    // Direct reads also retain evidence for tokens visible in ledger projections.
    await read('getSecToken', [id.toString()]);
  }
  for (const id of ledgerTokens)
    if (BigInt(id) < base || BigInt(id) > max) throw new Error('Ledger token outside source range');
  for (const [feeType, definitions] of [
    [0, currencies],
    [1, types],
  ] as const) {
    for (const definition of definitions) {
      const id = field(definition, 'id');
      for (const entity of entities) await read('getFee', [String(feeType), entity, id, ZERO]);
      for (const account of addresses) if (account !== ZERO) await read('getFee', [String(feeType), '0', id, account]);
    }
  }
  for (const optional of ['owner', 'facets']) {
    if (iface.hasFunction(optional)) {
      const evidence = await read(optional);
      if (optional === 'facets') {
        const facets = list(evidence);
        const seen = new Set(snapshot.code.map((item) => item.address));
        for (const facet of facets) {
          const at = getAddress(field(facet, 'facetAddress') as string);
          if (!seen.has(at)) {
            await code(at);
            seen.add(at);
          }
        }
      }
    }
  }
  await canonical();
  await chain();
  return snapshot;
}
