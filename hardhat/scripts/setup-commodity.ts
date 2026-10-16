import assert from "node:assert/strict";
import { type Contract, ZeroAddress } from "ethers";
import type { LocalJournal } from "./local-journal.ts";

// Operational defaults from sol/devSetupContract.js and devInitSealContract.js.
// This deliberately preserves the placeholder fee owner and zero USD funding.
export async function setupCommodity(
  proxy: Contract,
  accounts: string[],
  journal: LocalJournal,
) {
  assert.equal(accounts.length, 30);
  assert.equal(new Set(accounts.map((a) => a.toLowerCase())).size, 30);
  assert.equal((await proxy.getOwners())[0], accounts[0]);
  assert.equal(await proxy.getContractType(), 0n);
  const currencies = [
    ["USD", "cents", 2],
    ["ETH", "Wei", 18],
    ["BTC", "Satoshi", 8],
  ];
  async function send(key: string, method: string, args: unknown[]) {
    return journal.send(key, {
      to: String(proxy.target),
      data: proxy.interface.encodeFunctionData(method, args),
    });
  }
  for (const token of ["CET", "ANT", "GPT"])
    await send(`setup-token-${token}`, "addSecTokenType", [
      token,
      1,
      [0, 0, 0, 0, 0, 0, 0],
      ZeroAddress,
    ]);
  for (const [name, unit, decimals] of currencies)
    await send(`setup-currency-${name}`, "addCcyType", [name, unit, decimals]);
  const feeOwner = "0x0000000000000000000000000000000000000099";
  await send("setup-entity", "createEntity", [{ id: 4, addr: feeOwner }]);
  await send("setup-fee", "setFee_CcyType", [
    4,
    1,
    ZeroAddress,
    [0, 0, 300, 0, 300, true],
  ]);
  await send("setup-owner-whitelist", "whitelistMany", [[accounts[0]]]);
  await send("setup-owner-entity", "setAccountEntity", [
    { id: 4, addr: accounts[0] },
  ]);
  await send("setup-owner-ledger", "fundOrWithdraw", [
    0,
    1,
    0,
    accounts[0],
    "DEV_INIT",
  ]);
  await send("setup-whitelist", "whitelistMany", [accounts.slice(1)]);

  const ccys = (await proxy.getCcyTypes()).ccyTypes;
  assert.deepEqual(
    ccys.map(
      (c: { id: bigint; name: string; unit: string; decimals: bigint }) => [
        c.id,
        c.name,
        c.unit,
        c.decimals,
      ],
    ),
    currencies.map(([name, unit, decimals], i) => [
      BigInt(i + 1),
      name,
      unit,
      BigInt(decimals),
    ]),
  );
  const tokens = (await proxy.getSecTokenTypes()).tokenTypes;
  assert.deepEqual(
    tokens.map(
      (t: {
        name: string;
        settlementType: bigint;
        cashflowBaseAddr: string;
        ft: Iterable<bigint>;
      }) => [t.name, t.settlementType, t.cashflowBaseAddr, Array.from(t.ft)],
    ),
    ["CET", "ANT", "GPT"].map((name) => [
      name,
      1n,
      ZeroAddress,
      Array(7).fill(0n),
    ]),
  );
  assert.deepEqual(Array.from(await proxy["getWhitelist()"]()), accounts);
  assert.deepEqual(
    Array.from(await proxy.getAllEntitiesWithFeeOwners()).map((e) =>
      Array.from(e as Iterable<unknown>),
    ),
    [[4n, feeOwner]],
  );
  assert.deepEqual(Array.from(await proxy.getAccountEntityBatch(accounts)), [
    4n,
    ...Array(29).fill(0n),
  ]);
  assert.deepEqual(Array.from(await proxy.getFee(0, 4, 1, ZeroAddress)), [
    0n,
    0n,
    300n,
    0n,
    300n,
    true,
  ]);
  const ledger = await proxy.getLedgerEntry(accounts[0]);
  assert.equal(ledger.exists, true);
  assert.equal(ledger.tokens.length, 0);
  assert.ok(
    ledger.ccys.every(
      (c: { balance: bigint; reserved: bigint }) =>
        c.balance === 0n && c.reserved === 0n,
    ),
  );
  const receipt = await send("setup-seal", "sealContract", []);
  assert.equal(await proxy.getContractSeal(), true);
  return {
    address: String(proxy.target),
    sealTxHash: receipt.hash,
    usd: { id: 1, unit: "cents", decimals: 2 },
    whitelistCount: accounts.length,
  };
}
