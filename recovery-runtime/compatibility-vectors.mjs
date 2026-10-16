import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Interface } from "../hardhat/node_modules/ethers/lib.esm/index.js";
import {
	artifacts,
	network,
} from "../hardhat/node_modules/hardhat/dist/src/index.js";
import { deployCommodity } from "../hardhat/scripts/deploy-commodity.ts";

// Exercise the actual producer, not a second implementation of its ABI merge.
const connection = await network.create("localRehearsal");
let manifest;
try {
	const accounts = await connection.ethers.getSigners();
	manifest = await deployCommodity(
		connection.ethers,
		artifacts,
		accounts[0],
		{
			async send(_key, request) {
				const receipt = await (
					await accounts[0].sendTransaction(request)
				).wait();
				assert.ok(receipt && receipt.status === 1);
				return receipt;
			},
			async close() {},
		},
		{
			owners: await Promise.all(
				accounts.slice(0, 10).map((a) => a.getAddress()),
			),
			custodyType: 0,
			name: "ABI_COMPAT",
			version: "2.4",
			symbol: "ACC",
			unit: "KG",
			gitCommit: "synthetic",
		},
	);
} finally {
	await connection.close();
}
const iface = new Interface(manifest.abi);
function value(p) {
	if (p.baseType === "array")
		return Array.from({ length: p.arrayLength < 0 ? 2 : p.arrayLength }, () =>
			value(p.arrayChildren),
		);
	if (p.baseType === "tuple") return p.components.map(value);
	if (/^u?int/.test(p.type))
		return /^(u?int)(8|16|24|32|40|48)$/.test(p.type)
			? "1"
			: "9007199254741009";
	if (p.type === "address") return "0x1111111111111111111111111111111111111111";
	if (p.type === "bool") return true;
	if (p.type === "string") return "synthetic ' ABI";
	if (p.type === "bytes") return "0x1234";
	if (/^bytes\d+$/.test(p.type))
		return `0x${"ab".repeat(Number(p.type.slice(5)))}`;
	throw Error(`Unsupported ${p.type}`);
}
const functions = [];
iface.forEachFunction((f) => {
	const args = f.inputs.map(value);
	functions.push({
		name: f.format("sighash"),
		args,
		data: iface.encodeFunctionData(f, args),
	});
});
const events = [];
iface.forEachEvent((f) => {
	// Dynamic indexed fields are hashes, not decoded values; cover static indexed fields here.
	if (
		f.inputs.some(
			(p) =>
				p.indexed &&
				(["array", "tuple"].includes(p.baseType) ||
					["string", "bytes"].includes(p.type)),
		)
	)
		return;
	const args = f.inputs.map(value);
	events.push({
		name: f.format("sighash"),
		args,
		...iface.encodeEventLog(f, args),
	});
});
assert(
	functions.some(
		(f) =>
			f.name.includes("tuple") ||
			(f.name.includes("(") && f.name.includes("[]")),
	),
);
// Add explicit overload controls, independent of whether the application has overloads.
const controls = new Interface([
	"function probe(uint256)",
	"function probe((uint256,address)[])",
]);
controls.forEachFunction((f) =>
	functions.push({
		name: f.format("sighash"),
		args: f.inputs.map(value),
		data: controls.encodeFunctionData(f, f.inputs.map(value)),
	}),
);
writeFileSync(
	process.argv[2],
	JSON.stringify({
		abi: JSON.parse(iface.formatJson()),
		controls: JSON.parse(controls.formatJson()),
		functions,
		events,
	}),
);
