const assert = require("node:assert/strict");
const { Client } = require("/recovery/node_modules/pg");
const Web3 = require("/recovery/sol/node_modules/@truffle/interface-adapter/node_modules/web3");
const { isBN, isBigNumber } = require("/recovery/sol/node_modules/web3-utils");
const vectors = require("/recovery/vectors.json");
const orm = require("/recovery/orm/build/index.js");
const pools = require("/recovery/orm/build/pool.js");

async function main() {
	assert.equal(Web3.version, "1.8.2");
	const db = new Client({
		host: "database",
		user: "compat",
		password: "synthetic-only",
		database: "compat",
	});
	await db.connect();
	try {
		await db.query(`CREATE SCHEMA dbo;
      CREATE TABLE dbo.contract (id SERIAL PRIMARY KEY, contract_enum TEXT, network_id INT,
        deployed_utc TIMESTAMP, addr TEXT, host_name TEXT, ip_v4 TEXT, abi TEXT,
        contract_ver TEXT, contract_type TEXT, "txHash" TEXT, symbol TEXT);
      CREATE TABLE dbo.contract_deployed (id SERIAL PRIMARY KEY, contract_name TEXT,
        network_id INT, addr TEXT, linked_to_addr TEXT, "txHash" TEXT, deployed_utc TIMESTAMP,
        version TEXT, git_commit TEXT, host_name TEXT, ip TEXT);
      CREATE TABLE dbo.contract_function (id SERIAL PRIMARY KEY, network_id INT, action TEXT,
        function_name TEXT, func_selector TEXT, contract_addr TEXT, linked_to_addr TEXT,
        tx_hash TEXT, init_addr TEXT, calldata TEXT, deployed_utc TIMESTAMP, host_name TEXT, ip TEXT);`);
		const address = "0x1111111111111111111111111111111111111111";
		const serialized = JSON.stringify(vectors.abi);
		assert.equal(
			await orm.SaveDeployment({
				contractName: "LOCAL_'IDX",
				networkId: "31337",
				contractVer: "2.4",
				deployedAddress: address,
				deployedAbi: "[]",
				deployerHostName: "synthetic",
				deployerIpv4: "127.0.0.1",
				contractType: "COMMODITY",
				txHash: "synthetic-tx",
				symbol: "ACC",
			}),
			true,
		);
		assert.equal(
			await orm.UpdateABI({
				deployedAddress: address,
				deployedAbi: serialized,
			}),
			true,
		);
		const result = await orm.GetDeployment("31337", "LOCAL_'IDX", "2.4");
		assert.deepEqual(result.recordsets, [result.recordset]);
		assert.equal(result.recordset.length, 1);
		assert.equal(result.recordset[0].abi, serialized);
		assert.equal(result.recordset[0].contract_ver, "2.4");
		assert.equal(result.recordset[0].txHash, "synthetic-tx");
		assert.equal(
			(await orm.GetDeployment("31338", "LOCAL_'IDX", "2.4")).recordset.length,
			0,
		);
		assert.equal(
			await orm.SaveContractDeployment({
				contractName: "StLedgerFacet",
				networkId: "31337",
				addr: address,
				linkedToAddr: address,
				txHash: "facet-tx",
				version: "2.4",
				gitCommit: "synthetic",
				deployerHostName: "synthetic",
				ip: "127.0.0.1",
			}),
			true,
		);
		for (const Consumer of [Web3, require("/recovery/sol/node_modules/web3")]) {
			const web3 = new Consumer();
			const contract = new web3.eth.Contract(
				JSON.parse(result.recordset[0].abi),
				address,
			);
			const controls = new web3.eth.Contract(vectors.controls, address);
			for (const f of vectors.functions) {
				const consumer = f.name.startsWith("probe(") ? controls : contract;
				assert.equal(
					consumer.methods[f.name](...f.args).encodeABI(),
					f.data,
					f.name,
				);
			}
			const version =
				Consumer.version ??
				require("/recovery/sol/node_modules/web3/package.json").version;
			console.log(
				`PASS Web3 ${version}: ${vectors.functions.length} encodings`,
			);
			const f = vectors.functions.find(
				(entry) =>
					entry.name === "diamondCut((address,uint8,bytes4[])[],address,bytes)",
			);
			assert.ok(f, "real tuple-array function must be present");
			assert.equal(
				await orm.SaveContractFunction({
					networkId: "31337",
					action: "Add",
					funcName: f.name,
					funcSelector: f.data.slice(0, 10),
					contrAddr: address,
					linkedToAddr: address,
					txHash: "cut-tx",
					initAddr: address,
					calldata: f.data,
					deployerHostName: "synthetic",
					ip: "127.0.0.1",
				}),
				true,
			);
			const saved = (await db.query("SELECT * FROM dbo.contract_function"))
				.rows[0];
			assert.equal(saved.calldata, f.data);
			assert.equal(saved.func_selector, f.data.slice(0, 10));
			assert.equal(
				(await db.query("SELECT * FROM dbo.contract_deployed")).rows[0].txHash,
				"facet-tx",
			);
			for (const event of vectors.events) {
				const abi = vectors.abi.find(
					(entry) =>
						entry.type === "event" &&
						web3.eth.abi.encodeEventSignature(entry) === event.topics[0],
				);
				assert.ok(abi, event.name);
				let decoded;
				try {
					decoded = web3.eth.abi.decodeLog(
						abi.inputs,
						event.data,
						event.topics.slice(1),
					);
				} catch (cause) {
					throw new Error(`Web3 ${version} cannot decode ${event.name}`, {
						cause,
					});
				}
				const normalize = (value) => {
					// Frozen Web3 2 alpha returns BigNumber; Web3 1 returns decimal strings.
					if (isBN(value) || isBigNumber(value)) return value.toString(10);
					if (typeof value === "number") {
						assert.ok(
							Number.isSafeInteger(value),
							"Decoder lost integer precision",
						);
						return String(value);
					}
					if (Array.isArray(value)) return value.map(normalize);
					return typeof value === "string" && value.startsWith("0x")
						? value.toLowerCase()
						: value;
				};
				assert.deepEqual(
					abi.inputs.map((_, i) => normalize(decoded[i])),
					event.args.map(normalize),
					event.name,
				);
			}
			console.log(
				`PASS Web3 ${Consumer.version ?? require("/recovery/sol/node_modules/web3/package.json").version}: ${vectors.functions.length} encodings; ${vectors.events.length} event decodings`,
			);
		}
		const admin = await pools.getPool("admin");
		const erc20 = await pools.getPool("erc20");
		assert.notEqual(admin, erc20);
		assert.equal(await pools.getPool("admin"), admin);
		console.log(
			`PASS: real ORM writes/reads, pg transport and named pools; ${vectors.functions.length} ethers/Web3 encodings; ${vectors.events.length} event decodings`,
		);
	} finally {
		await pools.closeAll();
		await db.end();
	}
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
