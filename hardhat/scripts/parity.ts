import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import solc from "solc";

// Independent solc-js build with Truffle's source-name convention. This checks
// compiler parity, not deployed bytecode or the Truffle artifact/runtime API.
const root = new URL("../../sol/contracts/", import.meta.url);
const paths = (await readdir(root, { recursive: true }))
  .filter((path) => path.endsWith(".sol"))
  .sort();
const sources = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [
      `project:/contracts/${path}`,
      { content: await readFile(new URL(path, root), "utf8") },
    ]),
  ),
);
assert.match(solc.version(), /^0\.8\.5\+commit\.a4f2e591/);
const reference = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: true, runs: 1 },
        evmVersion: "byzantium",
        outputSelection: { "*": { "*": ["abi", "evm", "storageLayout"] } },
      },
    }),
  ),
) as CompilerOutput;
assert.deepEqual(
  reference.errors?.filter((error) => error.severity === "error") ?? [],
  [],
);

type Links = Record<
  string,
  Record<string, { start: number; length: number }[]>
>;
type Bytecode = { object: string; linkReferences: Links };
type Contract = {
  abi: unknown[];
  storageLayout: unknown;
  evm: {
    bytecode: Bytecode;
    deployedBytecode: Bytecode;
    methodIdentifiers: Record<string, string>;
  };
};
type CompilerOutput = {
  contracts: Record<string, Record<string, Contract>>;
  errors?: { severity: string; formattedMessage: string }[];
};

function canonicalLinks(links: Links) {
  return Object.entries(links).flatMap(([source, libraries]) =>
    Object.entries(libraries).map(([name, positions]) => ({
      source: source.replace(/^project:?\//, ""),
      name,
      positions,
    })),
  );
}

function executable(bytecode: Bytecode, runtime: string) {
  if (!bytecode.object) return "";
  let code = bytecode.object;
  // Source names change link placeholders. Check their names/positions separately.
  for (const { positions } of canonicalLinks(bytecode.linkReferences)) {
    for (const { start, length } of positions) {
      code = `${code.slice(0, start * 2)}${"0".repeat(length * 2)}${code.slice((start + length) * 2)}`;
    }
  }
  // Creation code can append constructor revert strings AFTER the embedded
  // runtime. Locate its metadata using the runtime suffix, not the init suffix.
  const metadataBytes = Number.parseInt(runtime.slice(-4), 16);
  assert.ok(metadataBytes > 0 && metadataBytes * 2 + 4 < runtime.length);
  const metadata = runtime.slice(-(metadataBytes * 2 + 4));
  assert.equal(
    code.split(metadata).length,
    2,
    "Expected one runtime metadata section",
  );
  return code.replace(metadata, "0".repeat(metadata.length));
}

const buildDirectory = new URL("../artifacts/build-info/", import.meta.url);
const builds = (await readdir(buildDirectory)).filter(
  (name) => name.endsWith(".json") && !name.endsWith(".output.json"),
);
assert.equal(
  builds.length,
  1,
  "Expected one clean build; run hardhat clean then npm run build",
);
const actual: Record<string, Contract> = {};
for (const build of builds) {
  const info = JSON.parse(
    await readFile(new URL(build, buildDirectory), "utf8"),
  );
  assert.equal(info.solcVersion, "0.8.5");
  assert.deepEqual(info.input.settings.optimizer, { enabled: true, runs: 1 });
  assert.equal(info.input.settings.evmVersion, "byzantium");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(info.input.sources).map(([name, value]) => [
        name.replace(/^project\//, "project:/"),
        value,
      ]),
    ),
    sources,
    "Hardhat compiler inputs must match the legacy source tree",
  );
  const output = JSON.parse(
    await readFile(
      new URL(build.replace(/\.json$/, ".output.json"), buildDirectory),
      "utf8",
    ),
  ).output as CompilerOutput;
  for (const [source, contracts] of Object.entries(output.contracts)) {
    for (const [name, contract] of Object.entries(contracts)) {
      actual[`${source.replace(/^project\//, "")}:${name}`] = contract;
    }
  }
}
let count = 0;
for (const [source, contracts] of Object.entries(reference.contracts)) {
  for (const [name, expected] of Object.entries(contracts)) {
    const key = `${source.replace(/^project:\//, "")}:${name}`;
    const got = actual[key];
    assert.ok(got, `Missing Hardhat output: ${key}`);
    assert.deepEqual(got.abi, expected.abi, `${key}: ABI`);
    assert.deepEqual(
      got.evm.methodIdentifiers,
      expected.evm.methodIdentifiers,
      `${key}: selectors`,
    );
    // Layouts contain source-qualified contract names, but slot/type information
    // must otherwise remain identical. No AST IDs or storage types are discarded.
    assert.equal(
      JSON.stringify(got.storageLayout).replaceAll("project/", ""),
      JSON.stringify(expected.storageLayout).replaceAll("project:/", ""),
      `${key}: storage layout`,
    );
    for (const kind of ["bytecode", "deployedBytecode"] as const) {
      assert.deepEqual(
        canonicalLinks(got.evm[kind].linkReferences),
        canonicalLinks(expected.evm[kind].linkReferences),
        `${key}: ${kind} links`,
      );
      assert.equal(
        executable(got.evm[kind], got.evm.deployedBytecode.object),
        executable(expected.evm[kind], expected.evm.deployedBytecode.object),
        `${key}: ${kind} executable`,
      );
    }
    count++;
  }
}
assert.ok(count > 0);
assert.equal(Object.keys(actual).length, count, "Unexpected Hardhat contracts");
console.log(
  `Compiler parity passed for ${count} contracts: ABI, selectors, storage layouts, link references and executable bytecode (metadata excluded).`,
);
