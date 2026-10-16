import { inspectUat, type UatName, uatProfiles } from "./uat.ts";

try {
  const name = process.argv[2];
  if (!name || !Object.hasOwn(uatProfiles, name)) {
    throw new Error("Choose idxUat or acxUat");
  }
  const profile = uatProfiles[name as UatName];
  const endpoint = process.env[profile.urlVariable];
  if (!endpoint) throw new Error("Missing endpoint");
  console.log(
    JSON.stringify(await inspectUat(name as UatName, endpoint), null, 2),
  );
} catch {
  console.error(
    "UAT preflight failed. Choose idxUat or acxUat; check its RPC environment variable, TLS, chain ID and access. No transactions sent.",
  );
  process.exitCode = 1;
}
