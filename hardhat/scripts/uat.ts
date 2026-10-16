import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

export const uatProfiles = {
  idxUat: { chainId: 800135, urlVariable: "IDX_UAT_RPC_URL" },
  acxUat: { chainId: 80002, urlVariable: "ACX_UAT_RPC_URL" },
} as const;

export type UatName = keyof typeof uatProfiles;

export async function inspectUat(name: UatName, endpoint: string) {
  const url = new URL(endpoint);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Unsupported RPC protocol");
  const agent =
    url.protocol === "https:"
      ? new HttpsAgent({ keepAlive: true, maxSockets: 4 })
      : new HttpAgent({ keepAlive: true, maxSockets: 4 });
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  let id = 0;
  // There is deliberately no signing or arbitrary RPC entry point in this CLI.
  async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
    const requestId = ++id;
    try {
      return await new Promise((resolve, reject) => {
        const req = request(
          url,
          {
            method: "POST",
            agent,
            headers: { "content-type": "application/json" },
            signal: AbortSignal.timeout(120000),
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error("RPC HTTP failure"));
              return;
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk: string) => {
              body += chunk;
              if (body.length > 1024 * 1024)
                req.destroy(new Error("RPC response too large"));
            });
            res.on("error", reject);
            res.on("end", () => {
              try {
                const response = JSON.parse(body);
                if (
                  response.jsonrpc !== "2.0" ||
                  response.id !== requestId ||
                  "error" in response ||
                  !("result" in response)
                )
                  throw new Error("Invalid RPC response");
                resolve(response.result);
              } catch {
                reject(new Error("Invalid RPC response"));
              }
            });
          },
        );
        req.on("error", reject);
        req.end(
          JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        );
      });
    } catch {
      // RPC errors may echo authenticated URLs or provider secrets.
      throw new Error(`${method} failed; check endpoint, TLS and RPC access`);
    }
  }
  function quantity(value: unknown): string {
    if (
      typeof value !== "string" ||
      !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)
    )
      throw new Error("Invalid RPC quantity");
    return BigInt(value).toString();
  }
  try {
    const chainId = quantity(await rpc("eth_chainId"));
    if (chainId !== String(uatProfiles[name].chainId))
      throw new Error(`Wrong chain ID for ${name}`);
    const networkId = await rpc("net_version");
    if (typeof networkId !== "string" || !/^[0-9]+$/.test(networkId))
      throw new Error("Invalid network ID");
    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    if (
      typeof block !== "object" ||
      block === null ||
      !("number" in block) ||
      !("gasLimit" in block)
    )
      throw new Error("Invalid latest block");
    return {
      network: name,
      chainId,
      networkId,
      blockNumber: quantity(block.number),
      gasLimit: quantity(block.gasLimit),
      baseFeePerGas:
        "baseFeePerGas" in block ? quantity(block.baseFeePerGas) : null,
      gasPrice: quantity(await rpc("eth_gasPrice")),
    };
  } finally {
    agent.destroy();
  }
}
