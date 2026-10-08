import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { getAddress, getCreateAddress, keccak256, type Signer, Transaction, type TransactionRequest } from 'ethers';

export type JournalCode =
  | 'INVALID_INPUT'
  | 'CONTEXT_MISMATCH'
  | 'CHAIN_MISMATCH'
  | 'LOCKED'
  | 'STORAGE'
  | 'CORRUPT'
  | 'RPC'
  | 'NONCE_DRIFT'
  | 'PRE_STATE'
  | 'POST_STATE'
  | 'UNCERTAIN'
  | 'PENDING'
  | 'REVERTED'
  | 'REORG'
  | 'TX_MISMATCH'
  | 'NOT_FINAL';
export class JournalError extends Error {
  constructor(public readonly code: JournalCode) {
    super(`Journal stopped: ${code}`);
    this.name = 'JournalError';
  }
}
function fail(code: JournalCode): never {
  throw new JournalError(code);
}
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

export interface PreparedOperation {
  id: string;
  /** Hash of the reviewed expected-state specification, including both checks. */
  stateHash: string;
  request: TransactionRequest;
  readBefore: () => Promise<boolean>;
  readAfter: () => Promise<boolean>;
}
export interface JournalContext {
  chainId: string;
  source: string;
  target: string;
  snapshotHash: string;
  planHash: string;
  signerAddress: string;
  startingNonce: number;
}
export interface ReceiptEvidence {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  status: number;
  gasUsed: string;
  contractAddress: string | null;
}
interface Entry {
  id: string;
  operationHash: string;
  nonce: number;
  transactionHash: string;
  complete: boolean;
  receipt?: ReceiptEvidence;
}
export interface JournalState {
  version: 1;
  context: JournalContext;
  entries: Entry[];
}
export interface RunJournalOptions {
  path: string;
  context: JournalContext;
  expectedChainId: bigint;
  signer: Signer;
  operations: PreparedOperation[];
  maxPolls?: number;
  pollIntervalMs?: number;
}

// Only concrete, reviewed requests are accepted. Fee/gas fields must be supplied;
// do not populate a request through a network-dependent wallet helper.
function requestIdentity(op: PreparedOperation) {
  const r = op.request;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(op.id) || !hashPattern.test(op.stateHash)) fail('INVALID_INPUT');
  if (r.to !== null && typeof r.to !== 'string') fail('INVALID_INPUT');
  if (r.data !== undefined && (typeof r.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r.data)))
    fail('INVALID_INPUT');
  if (
    r.from !== undefined ||
    r.nonce !== undefined ||
    r.chainId !== undefined ||
    r.gasLimit == null ||
    r.accessList !== undefined ||
    r.blobs !== undefined ||
    r.blobVersionedHashes !== undefined ||
    r.authorizationList !== undefined
  )
    fail('INVALID_INPUT');
  const allowed = new Set([
    'to',
    'data',
    'value',
    'gasLimit',
    'gasPrice',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
    'type',
  ]);
  if (Object.keys(r).some((key) => !allowed.has(key))) fail('INVALID_INPUT');
  if (r.gasPrice == null && (r.maxFeePerGas == null || r.maxPriorityFeePerGas == null)) fail('INVALID_INPUT');
  for (const value of [r.value, r.gasLimit, r.gasPrice, r.maxFeePerGas, r.maxPriorityFeePerGas]) {
    if (value == null) continue;
    if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('INVALID_INPUT');
    if (BigInt(value) < 0n || BigInt(value) >= 1n << 256n) fail('INVALID_INPUT');
  }
  if (BigInt(r.gasLimit) === 0n || (r.type != null && ![0, 2].includes(r.type))) fail('INVALID_INPUT');
  if (r.gasPrice != null) {
    if (r.maxFeePerGas != null || r.maxPriorityFeePerGas != null || r.type === 2) fail('INVALID_INPUT');
  } else if (
    r.maxFeePerGas == null ||
    r.maxPriorityFeePerGas == null ||
    r.type === 0 ||
    BigInt(r.maxPriorityFeePerGas) > BigInt(r.maxFeePerGas)
  )
    fail('INVALID_INPUT');
  return {
    id: op.id,
    stateHash: op.stateHash.toLowerCase(),
    to: r.to === null ? null : getAddress(r.to as string),
    data: (r.data ?? '0x').toString().toLowerCase(),
    value: BigInt(r.value ?? 0).toString(),
    gasLimit: BigInt(r.gasLimit).toString(),
    gasPrice: r.gasPrice == null ? null : BigInt(r.gasPrice).toString(),
    maxFeePerGas: r.maxFeePerGas == null ? null : BigInt(r.maxFeePerGas).toString(),
    maxPriorityFeePerGas: r.maxPriorityFeePerGas == null ? null : BigInt(r.maxPriorityFeePerGas).toString(),
    type: r.type ?? null,
  };
}
export function operationHash(op: PreparedOperation): string {
  try {
    return `0x${digest(requestIdentity(op))}`;
  } catch {
    return fail('INVALID_INPUT');
  }
}
export function planHash(operations: PreparedOperation[]): string {
  return `0x${digest(operations.map(operationHash))}`;
}
async function external<T>(fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new JournalError('RPC')), 30_000);
      }),
    ]);
  } catch {
    return fail('RPC');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** No key, signed payload, provider error, or request body is written to disk. */
export async function runJournal(options: RunJournalOptions): Promise<JournalState> {
  // Freeze caller-owned input before the first await. Callbacks cannot change
  // a request after its plan hash and destination have been checked.
  options = {
    ...options,
    context: { ...options.context },
    operations: options.operations.map((op) => ({ ...op, request: { ...op.request } })),
  };
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let temporary: string | undefined;
  const lockPath = `${options.path}.lock`;
  try {
    const { operations, signer } = options;
    const maxPolls = options.maxPolls ?? 3;
    const interval = options.pollIntervalMs ?? 1000;
    if (
      !Number.isInteger(maxPolls) ||
      maxPolls < 1 ||
      maxPolls > 100 ||
      !Number.isInteger(interval) ||
      interval < 0 ||
      interval > 60_000
    )
      fail('INVALID_INPUT');
    let context: JournalContext;
    try {
      const c = options.context;
      context = {
        chainId: BigInt(c.chainId).toString(),
        source: getAddress(c.source),
        target: getAddress(c.target),
        snapshotHash: c.snapshotHash.toLowerCase(),
        planHash: c.planHash.toLowerCase(),
        signerAddress: getAddress(c.signerAddress),
        startingNonce: c.startingNonce,
      };
      if (
        context.source === context.target ||
        !hashPattern.test(context.snapshotHash) ||
        !hashPattern.test(context.planHash) ||
        !Number.isSafeInteger(context.startingNonce) ||
        context.startingNonce < 0 ||
        !Number.isSafeInteger(context.startingNonce + operations.length) ||
        new Set(operations.map((op) => op.id)).size !== operations.length ||
        context.planHash !== planHash(operations)
      )
        fail('INVALID_INPUT');
    } catch {
      return fail('INVALID_INPUT');
    }
    if (options.expectedChainId <= 0n || BigInt(context.chainId) !== options.expectedChainId) fail('CHAIN_MISMATCH');
    for (const [index, op] of operations.entries()) {
      const destination = requestIdentity(op).to;
      const actualTarget =
        destination ?? getCreateAddress({ from: context.signerAddress, nonce: context.startingNonce + index });
      if (actualTarget !== context.target) fail('CONTEXT_MISMATCH');
    }
    const provider = signer.provider;
    if (!provider || !('send' in provider) || typeof provider.send !== 'function') fail('INVALID_INPUT');
    const rpc = provider as typeof provider & { send: (method: string, params: unknown[]) => Promise<unknown> };
    const guard = async () => {
      const chain = await external(() => rpc.send('eth_chainId', []));
      if (typeof chain !== 'string' || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== options.expectedChainId)
        fail('CHAIN_MISMATCH');
      if (getAddress(await external(() => signer.getAddress())) !== context.signerAddress) fail('CONTEXT_MISMATCH');
    };
    await guard();
    try {
      lock = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await lock.sync();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('LOCKED');
      fail('STORAGE');
    }
    let state: JournalState = { version: 1, context, entries: [] };
    try {
      const stat = await lstat(options.path);
      if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) fail('CORRUPT');
      const envelope = JSON.parse(await readFile(options.path, 'utf8'));
      if (
        envelope.checksum !== digest(envelope.state) ||
        envelope.state.version !== 1 ||
        !Array.isArray(envelope.state.entries)
      )
        fail('CORRUPT');
      if (digest(envelope.state.context) !== digest(context)) fail('CONTEXT_MISMATCH');
      state = envelope.state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof JournalError) throw error;
        fail('CORRUPT');
      }
    }
    const save = async () => {
      temporary = join(dirname(options.path), `.${basename(options.path)}.${randomUUID()}.tmp`);
      const file = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(JSON.stringify({ state, checksum: digest(state) }));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, options.path);
      temporary = undefined;
      const dir = await open(dirname(options.path), constants.O_RDONLY);
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    };
    if (state.entries.length > operations.length) fail('CORRUPT');
    for (let i = 0; i < state.entries.length; i++) {
      const e = state.entries[i];
      if (
        !e ||
        e.id !== operations[i].id ||
        e.operationHash !== operationHash(operations[i]) ||
        e.nonce !== context.startingNonce + i ||
        !hashPattern.test(e.transactionHash) ||
        typeof e.complete !== 'boolean' ||
        (i < state.entries.length - 1 && !e.complete)
      )
        fail('CORRUPT');
    }
    // Persist the binding even when the first precondition fails.
    await save();
    for (let i = 0; i < operations.length; i++) {
      await guard();
      const op = operations[i];
      const nonce = context.startingNonce + i;
      let entry = state.entries[i];
      if (!entry) {
        if (
          (await external(() => provider.getTransactionCount(context.signerAddress, 'pending'))) !== nonce ||
          (await external(() => provider.getTransactionCount(context.signerAddress, 'latest'))) !== nonce
        )
          fail('NONCE_DRIFT');
        if (!(await external(op.readBefore))) fail('PRE_STATE');
        const raw = await external(() =>
          signer.signTransaction({
            ...op.request,
            chainId: options.expectedChainId,
            nonce,
          }),
        );
        let signed: Transaction;
        try {
          signed = Transaction.from(raw);
        } catch {
          return fail('TX_MISMATCH');
        }
        const identity = requestIdentity(op);
        if (
          signed.from !== context.signerAddress ||
          signed.to !== identity.to ||
          signed.nonce !== nonce ||
          signed.chainId !== options.expectedChainId ||
          signed.data.toLowerCase() !== identity.data ||
          signed.value.toString() !== identity.value ||
          signed.gasLimit.toString() !== identity.gasLimit ||
          (identity.gasPrice !== null && signed.gasPrice?.toString() !== identity.gasPrice) ||
          (identity.maxFeePerGas !== null && signed.maxFeePerGas?.toString() !== identity.maxFeePerGas) ||
          (identity.maxPriorityFeePerGas !== null &&
            signed.maxPriorityFeePerGas?.toString() !== identity.maxPriorityFeePerGas)
        )
          fail('TX_MISMATCH');
        entry = {
          id: op.id,
          operationHash: operationHash(op),
          nonce,
          transactionHash: keccak256(raw),
          complete: false,
        };
        state.entries.push(entry);
        await save(); // A crash here is uncertain: never resend this nonce.
        const sent = await external(() => provider.broadcastTransaction(raw));
        if (sent.hash.toLowerCase() !== entry.transactionHash) fail('TX_MISMATCH');
      }
      let accepted: ReceiptEvidence | undefined;
      for (let poll = 0; poll < maxPolls; poll++) {
        await guard();
        const receipt = await external(() => provider.getTransactionReceipt(entry.transactionHash));
        if (!receipt) {
          if (entry.complete || entry.receipt) fail('REORG');
          const transaction = await external(() => provider.getTransaction(entry.transactionHash));
          if (!transaction) fail('UNCERTAIN');
          if (poll === maxPolls - 1) fail('PENDING');
        } else {
          const tx = await external(() => provider.getTransaction(entry.transactionHash));
          const identity = requestIdentity(op);
          if (
            !tx ||
            tx.hash.toLowerCase() !== entry.transactionHash ||
            getAddress(tx.from) !== context.signerAddress ||
            (tx.to === null ? null : getAddress(tx.to)) !== identity.to ||
            tx.nonce !== nonce ||
            tx.chainId !== options.expectedChainId ||
            tx.data.toLowerCase() !== identity.data ||
            tx.value.toString() !== identity.value ||
            receipt.hash.toLowerCase() !== entry.transactionHash
          )
            fail('TX_MISMATCH');
          const block = await external(() => provider.getBlock(receipt.blockNumber));
          if (
            !block ||
            block.hash !== receipt.blockHash ||
            (entry.receipt &&
              (entry.receipt.blockHash !== receipt.blockHash || entry.receipt.blockNumber !== receipt.blockNumber))
          )
            fail('REORG');
          entry.receipt = {
            transactionHash: entry.transactionHash,
            blockHash: receipt.blockHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status ?? -1,
            gasUsed: receipt.gasUsed.toString(),
            contractAddress: receipt.contractAddress,
          };
          // Preserve mined evidence even when finality or the postcondition fails.
          await save();
          if (receipt.status !== 1) fail('REVERTED');
          const finalized = await external(() => provider.getBlock('finalized'));
          if (finalized && finalized.number >= receipt.blockNumber) {
            const finalizedCanonical = await external(() => provider.getBlock(finalized.number));
            if (!finalized.hash || !finalizedCanonical || finalizedCanonical.hash !== finalized.hash) fail('REORG');
            // Recheck canonical inclusion after the finality query.
            const canonical = await external(() => provider.getBlock(receipt.blockNumber));
            if (!canonical || canonical.hash !== receipt.blockHash) fail('REORG');
            accepted = entry.receipt;
            break;
          }
          if (poll === maxPolls - 1) fail('NOT_FINAL');
        }
        if (interval) await new Promise((resolve) => setTimeout(resolve, interval));
      }
      if (!accepted) fail('NOT_FINAL');
      if (!(await external(op.readAfter))) fail('POST_STATE');
      entry.receipt = accepted;
      entry.complete = true;
      await save();
    }
    return state;
  } catch (error) {
    if (error instanceof JournalError) throw error;
    return fail('STORAGE');
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
    if (lock) {
      await lock.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }
}
