import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Signer, Transaction, Wallet } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PreparedOperation, planHash, type RunJournalOptions, runJournal } from './journal';

const hash = (digit: string) => `0x${digit.repeat(64)}`;
const source = `0x${'11'.repeat(20)}`;
const target = `0x${'22'.repeat(20)}`;
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'public-journal-test-'));
  directories.push(directory);
  const wallet = Wallet.createRandom();
  let tx: Transaction | null = null;
  let mode = 'mined';
  let canonical = hash('a');
  let status = 1;
  let finalNumber = 10;
  let nonce = 0;
  let wrongData = false;
  const provider = {
    send: vi.fn(async () => '0x7a69'),
    getTransactionCount: vi.fn(async () => nonce),
    broadcastTransaction: vi.fn(async (raw: string) => {
      if (mode === 'before') throw new Error('sensitive provider response');
      tx = Transaction.from(raw);
      if (mode === 'disconnect') throw new Error('sensitive provider response');
      return { hash: tx.hash };
    }),
    getTransaction: vi.fn(
      async () =>
        tx && {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          nonce: tx.nonce,
          chainId: tx.chainId,
          data: wrongData ? '0xffff' : tx.data,
          value: tx.value,
        },
    ),
    getTransactionReceipt: vi.fn(async () =>
      !tx || mode === 'pending'
        ? null
        : {
            hash: tx.hash,
            blockHash: hash('a'),
            blockNumber: 10,
            status,
            gasUsed: 21000n,
            contractAddress: null,
          },
    ),
    getBlock: vi.fn(async (tag: number | string) => ({
      hash: canonical,
      number: tag === 'finalized' ? finalNumber : 10,
    })),
  };
  const signer = {
    provider,
    getAddress: () => wallet.getAddress(),
    signTransaction: (request: Parameters<Signer['signTransaction']>[0]) => wallet.signTransaction(request),
  } as unknown as Signer;
  const operation: PreparedOperation = {
    id: 'step-1',
    stateHash: hash('b'),
    request: {
      to: target,
      data: '0x1234',
      value: 0n,
      gasLimit: 50000n,
      gasPrice: 1n,
      type: 0,
    },
    readBefore: vi.fn(async () => true),
    readAfter: vi.fn(async () => true),
  };
  const options: RunJournalOptions = {
    path: join(directory, 'journal.json'),
    signer,
    expectedChainId: 31337n,
    context: {
      chainId: '31337',
      source,
      target,
      snapshotHash: hash('c'),
      planHash: planHash([operation]),
      signerAddress: wallet.address,
      startingNonce: 0,
    },
    operations: [operation],
    maxPolls: 2,
    pollIntervalMs: 0,
  };
  return {
    options,
    provider,
    operation,
    wallet,
    setMode: (value: string) => {
      mode = value;
    },
    setCanonical: (value: string) => {
      canonical = value;
    },
    setStatus: (value: number) => {
      status = value;
    },
    setFinal: (value: number) => {
      finalNumber = value;
    },
    setNonce: (value: number) => {
      nonce = value;
    },
    mutateTx: () => {
      wrongData = true;
    },
  };
}

describe('private receipt-aware sequential journal', () => {
  it('refuses a reviewed plan that writes to the source or a different target', async () => {
    const f = await fixture();
    for (const to of [source, `0x${'55'.repeat(20)}`, null]) {
      f.operation.request.to = to;
      f.options.context.planHash = planHash([f.operation]);
      await expect(runJournal(f.options)).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
    }
    expect(f.provider.broadcastTransaction).not.toHaveBeenCalled();
  });
  it('rejects unsafe and negative quantities and mixed fee modes', async () => {
    const f = await fixture();
    for (const override of [
      { value: Number.MAX_SAFE_INTEGER + 1 },
      { value: -1n },
      { value: 1n << 256n },
      { gasLimit: 0n },
      { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n },
      { type: 4 },
    ]) {
      expect(() => planHash([{ ...f.operation, request: { ...f.operation.request, ...override } }])).toThrow();
    }
  });
  it('uses a fresh chain check and freezes requests before callbacks', async () => {
    const f = await fixture();
    f.provider.send.mockResolvedValueOnce('0x1');
    await expect(runJournal(f.options)).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
    f.operation.readBefore = async () => {
      f.operation.request.to = source;
      return true;
    };
    await runJournal(f.options);
    expect(Transaction.from(f.provider.broadcastTransaction.mock.calls[0][0]).to).toBe(target);
  });
  it('commits public evidence and rechecks completed post-state without resending', async () => {
    const f = await fixture();
    const result = await runJournal(f.options);
    expect(result.entries[0].receipt).toMatchObject({
      status: 1,
      blockNumber: 10,
      gasUsed: '21000',
    });
    await runJournal(f.options);
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
    expect(f.operation.readAfter).toHaveBeenCalledTimes(2);
    expect((await stat(f.options.path)).mode & 0o777).toBe(0o600);
    const persisted = await readFile(f.options.path, 'utf8');
    expect(persisted).not.toContain(f.wallet.privateKey);
    expect(persisted).not.toContain(f.provider.broadcastTransaction.mock.calls[0][0]);
    expect(persisted).not.toContain('0x1234');
  });
  it('stops an uncertain intent before broadcast and never resends on restart', async () => {
    const f = await fixture();
    f.setMode('before');
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'RPC',
      message: 'Journal stopped: RPC',
    });
    f.setMode('mined');
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'UNCERTAIN',
    });
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
  });
  it('recovers a mined transaction after a broadcast disconnect', async () => {
    const f = await fixture();
    f.setMode('disconnect');
    await expect(runJournal(f.options)).rejects.toMatchObject({ code: 'RPC' });
    f.setMode('mined');
    expect((await runJournal(f.options)).entries[0].complete).toBe(true);
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
  });
  it('bounds pending polls and does not resend pending transactions', async () => {
    const f = await fixture();
    f.setMode('pending');
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'PENDING',
    });
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'PENDING',
    });
    expect(f.provider.getTransactionReceipt).toHaveBeenCalledTimes(4);
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
  });
  it.each(['REVERTED', 'REORG', 'NOT_FINAL'] as const)('rejects %s receipts', async (code) => {
    const f = await fixture();
    if (code === 'REVERTED') f.setStatus(0);
    if (code === 'REORG') f.setCanonical(hash('d'));
    if (code === 'NOT_FINAL') f.setFinal(9);
    await expect(runJournal(f.options)).rejects.toMatchObject({ code });
    if (code !== 'REORG') {
      const saved = JSON.parse(await readFile(f.options.path, 'utf8'));
      expect(saved.state.entries[0]).toMatchObject({
        complete: false,
        receipt: { blockNumber: 10, status: code === 'REVERTED' ? 0 : 1 },
      });
    }
  });
  it('rejects changed transaction identity on recovery', async () => {
    const f = await fixture();
    f.setMode('disconnect');
    await expect(runJournal(f.options)).rejects.toMatchObject({ code: 'RPC' });
    f.mutateTx();
    f.setMode('mined');
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'TX_MISMATCH',
    });
  });
  it('revalidates completed operations and fails closed on post-state drift', async () => {
    const f = await fixture();
    await runJournal(f.options);
    f.operation.readAfter = async () => false;
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'POST_STATE',
    });
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
  });
  it('recovers after receipt but before commit without duplicate sends', async () => {
    const f = await fixture();
    f.operation.readAfter = async () => {
      throw new Error('private callback detail');
    };
    await expect(runJournal(f.options)).rejects.toMatchObject({ code: 'RPC' });
    f.operation.readAfter = async () => true;
    await runJournal(f.options);
    expect(f.provider.broadcastTransaction).toHaveBeenCalledTimes(1);
  });
  it('checks nonce drift and pre-state before signing or broadcasting', async () => {
    const f = await fixture();
    f.setNonce(1);
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'NONCE_DRIFT',
    });
    f.setNonce(0);
    f.operation.readBefore = async () => false;
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'PRE_STATE',
    });
    expect(f.provider.broadcastTransaction).not.toHaveBeenCalled();
  });
  it('rejects lock contention without deleting the other lock', async () => {
    const f = await fixture();
    await writeFile(`${f.options.path}.lock`, 'owner', { mode: 0o600 });
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'LOCKED',
    });
    expect(await readFile(`${f.options.path}.lock`, 'utf8')).toBe('owner');
  });
  it('does not overwrite a different context or corrupt journal', async () => {
    const f = await fixture();
    await runJournal(f.options);
    const original = await readFile(f.options.path, 'utf8');
    f.options.context.snapshotHash = hash('e');
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'CONTEXT_MISMATCH',
    });
    expect(await readFile(f.options.path, 'utf8')).toBe(original);
    await writeFile(f.options.path, original.replace('21000', '21001'));
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'CORRUPT',
    });
  });
  it('guards chain and rejects identical source and target', async () => {
    const f = await fixture();
    f.options.expectedChainId = 1n;
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'CHAIN_MISMATCH',
    });
    f.options.expectedChainId = 31337n;
    f.options.context.source = target;
    await expect(runJournal(f.options)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(f.provider.broadcastTransaction).not.toHaveBeenCalled();
  });
});
