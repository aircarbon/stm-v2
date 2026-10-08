import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { JsonRpcProvider } from 'ethers';
import { capture } from './backup';
import { canonicalJson, checksum } from './state';

// Only this read-only command is exposed. RPC credentials come from the process
// environment, never from a checked-in instance file or a command-line argument.
async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      chain: { type: 'string' },
      abi: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.source || !values.chain || !/^[1-9][0-9]*$/.test(values.chain) || !values.abi || !values.out) {
    throw new Error('Arguments required');
  }
  const rpc = process.env.STM_READ_RPC_URL;
  if (!rpc || !['https:', 'http:'].includes(new URL(rpc).protocol)) throw new Error('RPC required');
  const root = await realpath(fileURLToPath(new URL('../../..', import.meta.url)));
  const directory = await realpath(dirname(resolve(values.out)));
  if (directory === root || directory.startsWith(`${root}${sep}`))
    throw new Error('Private output must be outside repository');
  const abiFile = JSON.parse(await readFile(values.abi, 'utf8'));
  const provider = new JsonRpcProvider(rpc, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  try {
    const snapshot = await capture(provider, values.source, abiFile.abi ?? abiFile, BigInt(values.chain));
    const envelope = { snapshot, checksum: checksum(snapshot) };
    const bytes = `${canonicalJson(envelope)}\n`;
    const output = await open(
      resolve(values.out),
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await output.writeFile(bytes);
      await output.sync();
    } finally {
      await output.close();
    }
    const reread = await readFile(resolve(values.out));
    const byteHash = createHash('sha256').update(reread).digest('hex');
    if (!reread.equals(Buffer.from(bytes))) throw new Error('Output mismatch');
    console.log(
      JSON.stringify({
        checksum: envelope.checksum,
        fileSha256: byteHash,
        complete: false,
        omissions: snapshot.coverage.filter((c) => c.status === 'omitted').map((c) => c.group),
      }),
    );
  } finally {
    provider.destroy();
  }
}

main().catch(() => {
  // Never print raw provider, ABI, filesystem, URL or signer errors.
  console.error(
    'Backup stopped. Check arguments, read-only RPC, archive support, ABI, bounds and private output path.',
  );
  process.exitCode = 1;
});
