import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Never invoke the legacy preprocessor: it also rewrites JavaScript in place.
const source = new URL("../../sol/contracts/", import.meta.url);
const destination = new URL("../contracts/", import.meta.url);
const files = (await readdir(source, { recursive: true })).filter((file) =>
  file.endsWith(".sol"),
);
if (files.length === 0) throw new Error("No Solidity inputs found");
for (const file of files) {
  const text = await readFile(new URL(file, source), "utf8");
  if (/\/\/#(?:if|endif)/.test(text)) {
    throw new Error(`Preprocessing requires a reviewed variant: ${file}`);
  }
}
// Refuse stale inputs instead of silently compiling deleted legacy contracts.
await mkdir(destination, { recursive: true });
const existing = await readdir(destination, { recursive: true });
for (const file of existing.filter((file) => file.endsWith(".sol"))) {
  if (!files.includes(file)) {
    throw new Error(
      `Remove stale generated source before building: contracts/${file}`,
    );
  }
}
await cp(fileURLToPath(source), fileURLToPath(destination), {
  recursive: true,
});
console.log(`Prepared ${files.length} unchanged Solidity source files`);
