import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { inspectUat, uatProfiles } from "../scripts/uat.ts";

test("UAT inspection uses read-only RPC, distinguishes network ID, and fails closed on wrong chains/errors", async () => {
  const methods: string[] = [];
  const sockets = new Set<unknown>();
  let chainId = "0xc3587"; // 800135, independently encoded IDX UAT ID.
  let fail = false;
  const server = createServer(async (req, res) => {
    sockets.add(req.socket);
    let body = "";
    for await (const chunk of req) body += chunk;
    const { id, method } = JSON.parse(body);
    methods.push(method);
    const results: Record<string, unknown> = {
      eth_chainId: chainId,
      net_version: "917",
      eth_getBlockByNumber: {
        number: "0x23",
        gasLimit: "0x1c9c380",
        ...(chainId === "0x13882" ? { baseFeePerGas: "0x20000000000001" } : {}),
      },
      eth_gasPrice: "0x3b9aca00",
    };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        ...(fail
          ? { error: { message: "secret-token" } }
          : { result: results[method] }),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/secret-token`;
  try {
    assert.deepEqual(await inspectUat("idxUat", endpoint), {
      network: "idxUat",
      chainId: "800135",
      networkId: "917",
      blockNumber: "35",
      gasLimit: "30000000",
      baseFeePerGas: null,
      gasPrice: "1000000000",
    });
    assert.equal(
      sockets.size,
      1,
      "reuse the connection for sequential RPC reads",
    );
    assert.deepEqual(methods, [
      "eth_chainId",
      "net_version",
      "eth_getBlockByNumber",
      "eth_gasPrice",
    ]);
    methods.length = 0;
    chainId = "0x89"; // Polygon mainnet must not pass ACX UAT validation.
    await assert.rejects(inspectUat("acxUat", endpoint), /Wrong chain ID/);
    assert.deepEqual(methods, ["eth_chainId"]);
    chainId = "0x13882";
    const amoy = await inspectUat("acxUat", endpoint);
    assert.equal(amoy.chainId, String(uatProfiles.acxUat.chainId));
    assert.equal(amoy.baseFeePerGas, "9007199254740993");
    fail = true;
    await assert.rejects(inspectUat("acxUat", endpoint), (error: Error) => {
      assert.doesNotMatch(error.message, /secret-token/);
      return /eth_chainId failed/.test(error.message);
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
