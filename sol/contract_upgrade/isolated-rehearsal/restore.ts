import { type FunctionFragment, getAddress, Interface, type InterfaceAbi, type JsonRpcProvider } from 'ethers';
import { assertRestorable, canonicalJson, checksum, type GetterRecord, type JsonValue, type Snapshot } from './state';

// This list is deliberately separate from all production business mutations.
const LOADERS = new Set([
  'createEntity',
  'createEntityBatch',
  'whitelistMany',
  'setAccountEntity',
  'setAccountEntityBatch',
  'addCcyType',
  'addCcyTypeBatch',
  'addSecTokenTypeBatch',
  'createLedgerEntry',
  'createLedgerEntryBatch',
  'addSecToken',
  'addSecTokenBatch',
  'setTokenTotals',
  'loadSecTokenBatch',
  'setFee_TokType',
  'setFee_TokTypeBatch',
  'setFee_CcyType',
  'setFee_CcyTypeBatch',
  'setReadOnly',
]);

/** Exclude all initializers, business writes, upgrades and sealing from the host. */
export function isolatedSelectors(abi: InterfaceAbi): string[] {
  const iface = new Interface(abi);
  return iface.fragments
    .filter((f): f is FunctionFragment => f.type === 'function')
    .filter((f) => ['view', 'pure'].includes(f.stateMutability) || LOADERS.has(f.name))
    .map((f) => f.selector);
}

export interface SignerMapping {
  oldAddress: string;
  newAddress: string;
}
export interface MappingResult {
  snapshot: Snapshot;
  changes: string[];
  mappingHash: string;
}

/** Map admin roles only. Any old address also used as business state is a stop. */
export function mapAdminSigners(source: Snapshot, mapping: SignerMapping[]): MappingResult {
  const normalized = mapping.map((m) => ({
    oldAddress: getAddress(m.oldAddress),
    newAddress: getAddress(m.newAddress),
  }));
  const owners = source.records.find((r) => r.method === 'getOwners')?.value;
  if (!Array.isArray(owners)) throw new Error('Missing owners');
  const roles = new Set([
    ...owners,
    ...source.records.filter((r) => ['deploymentOwner', 'owner'].includes(r.method)).map((r) => r.value),
  ]);
  if (
    !normalized.length ||
    new Set(normalized.map((m) => m.oldAddress)).size !== normalized.length ||
    new Set(normalized.map((m) => m.newAddress)).size !== normalized.length
  )
    throw new Error('Invalid signer mapping');
  const snapshot: Snapshot = structuredClone(source);
  const changes: string[] = [];
  const allValues = canonicalJson(source.records as unknown as JsonValue).toLowerCase();
  for (const m of normalized) {
    if (
      !roles.has(m.oldAddress) ||
      m.oldAddress === m.newAddress ||
      m.newAddress === '0x0000000000000000000000000000000000000000' ||
      m.newAddress === getAddress(source.source.address) ||
      allValues.includes(m.newAddress.toLowerCase())
    ) {
      throw new Error('Signer mapping collision or unknown role');
    }
    for (const record of snapshot.records) {
      if (record.method === 'getOwners' && Array.isArray(record.value)) {
        record.value = record.value.map((value) => (value === m.oldAddress ? m.newAddress : value));
        changes.push(`getOwners:${m.oldAddress}`);
      } else if (['deploymentOwner', 'owner'].includes(record.method) && record.value === m.oldAddress) {
        record.value = m.newAddress;
        changes.push(record.method);
      } else if (
        canonicalJson(record as unknown as JsonValue)
          .toLowerCase()
          .includes(m.oldAddress.toLowerCase())
      ) {
        // Read-only fee/entity queries may be zero, but must not be silently remapped.
        throw new Error('Signer also appears in business state; explicit typed mapping required');
      }
    }
  }
  return { snapshot, changes, mappingHash: checksum(normalized as unknown as JsonValue) };
}

/** Exact getter-record equality, preserving array order, integer strings and flags. */
export function compareRecords(expected: GetterRecord[], actual: GetterRecord[]): void {
  if (canonicalJson(expected as unknown as JsonValue) !== canonicalJson(actual as unknown as JsonValue)) {
    throw new Error('Restored state mismatch');
  }
}

/** Complete-state deployment remains gated until hidden mappings can be proven. */
export async function guardRehearsal(
  snapshot: Snapshot,
  expectedChecksum: string,
  provider: JsonRpcProvider,
  expectedChainId: bigint,
  target: string,
): Promise<void> {
  if (checksum(snapshot) !== expectedChecksum) throw new Error('Snapshot checksum mismatch');
  if (
    snapshot.source.chainId !== expectedChainId.toString() ||
    getAddress(target) === getAddress(snapshot.source.address)
  )
    throw new Error('Rehearsal identity mismatch');
  assertRestorable(snapshot);
  let chain: unknown;
  try {
    chain = await provider.send('eth_chainId', []);
  } catch {
    throw new Error('Rehearsal RPC failed');
  }
  if (typeof chain !== 'string' || BigInt(chain) !== expectedChainId) throw new Error('Rehearsal chain mismatch');
}
