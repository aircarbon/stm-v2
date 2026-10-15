// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
// keep -s/--entity as strings: an all-digit value would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'entity'] });

const WITHDRAW = 1; // StructLib.FundWithdrawType.WITHDRAW
const MAX_TOKENS_PER_BURN = 10;
const READ_ATTEMPTS = 5;
const READ_RETRY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clears an entity on the source contract before migration: burns all its tokens and withdraws all its currency,
 * as listed in the plan written by analyzeEntity.js.
 *
 * Safe to interrupt and re-run. Every run reads the live state of the entity's accounts, skips what is already done
 * and continues with the rest. It stops without sending anything if the chain differs from the plan in any other way
 * (new tokens, changed quantities, reserved currency), or while the signer still has pending transactions.
 * Transactions are never retried automatically: on a network error, check the log and re-run.
 *
 * Usage: `INSTANCE_ID=... truffle exec contract_upgrade/dataAdjustedRemoval/clearEntity.js -s=SOURCE_ADDR --entity=ENTITY_ID --network=NETWORK [--dry-run]`
 */
module.exports = async (callback) => {
  try {
    await run();
    callback();
  } catch (error) {
    callback(error);
  }
};

async function run() {
  const sourceAddress = `0x${String(argv?.s ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(sourceAddress)) {
    throw new Error(`Invalid source address: ${sourceAddress}`);
  }
  const entityId = String(argv?.entity ?? '');
  if (!/^[1-9][0-9]*$/.test(entityId)) {
    throw new Error(`Invalid entity ID: ${entityId}`);
  }
  const dryRun = Boolean(argv?.['dry-run']);

  const dataDir = path.join(__dirname, '..', 'data');
  const planFile = path.join(dataDir, `clear-plan-${sourceAddress}-entity-${entityId}.json`);
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.source.contractAddress.toLowerCase() !== sourceAddress || plan.entityId !== entityId) {
    throw new Error(`${planFile} is for another contract or entity`);
  }
  const logFile = path.join(dataDir, `clear-log-${sourceAddress}-entity-${entityId}.txt`);
  const log = (line) => {
    console.log(line);
    if (!dryRun) fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  };

  // @ts-ignore artifacts from truffle
  const at = (name) => artifacts.require(name).at(sourceAddress);
  const ledgerFacet = await at('StLedgerFacet');
  const burnableFacet = await at('StBurnableFacet');
  const ccyFacet = await at('CcyCollateralizableFacet');
  const masterFacet = await at('StMasterFacet');
  const ownedFacet = await at('OwnedFacet');

  // burnTokens and fundOrWithdraw need a sealed, writable contract, an owner as sender and an idle nonce
  // @ts-ignore web3 from truffle
  const [sender] = await web3.eth.getAccounts();
  if (!(await read(() => masterFacet.getContractSeal()))) throw new Error('Contract is not sealed');
  if (await read(() => ownedFacet.readOnly())) throw new Error('Contract is read-only');
  const owners = (await read(() => ownedFacet.getOwners())).map((owner) => owner.toLowerCase());
  if (!owners.includes(sender.toLowerCase())) throw new Error(`Sender ${sender} is not a contract owner`);
  // @ts-ignore web3 from truffle
  const pendingNonce = await read(() => web3.eth.getTransactionCount(sender, 'pending'));
  // @ts-ignore web3 from truffle
  const minedNonce = await read(() => web3.eth.getTransactionCount(sender, 'latest'));
  if (pendingNonce !== minedNonce) {
    throw new Error(`${pendingNonce - minedNonce} transactions from ${sender} are still pending; wait until they are mined, then re-run`);
  }

  console.log(`Clearing entity ${entityId} on ${plan.source.name} (${sourceAddress})${dryRun ? ' - DRY RUN' : ''}`);
  console.log(`Plan: ${planFile} (from ${plan.source.file})`);
  console.log(`Sender: ${sender}`);

  const { pendingBurns, pendingWithdrawals, doneBurns, doneWithdrawals, problems } = await compare(
    plan,
    entityId,
    ledgerFacet,
  );
  console.log(`\nTokens:   ${doneBurns} burned, ${pendingBurns.reduce((n, burn) => n + burn.tokens.length, 0)} to burn`);
  console.log(`Currency: ${doneWithdrawals} withdrawn, ${pendingWithdrawals.length} to withdraw`);
  if (problems.length > 0) {
    console.log('\nThe chain differs from the plan:');
    for (const problem of problems) console.log(`  - ${problem}`);
    throw new Error('Nothing sent. Make a fresh backup, re-run analyzeEntity.js, then re-run this script');
  }

  if (dryRun) {
    for (const burn of pendingBurns) {
      console.log(`  burn ${burn.account} type ${burn.tokTypeId}: stIds ${burn.tokens.map((t) => t.stId).join(', ')}`);
    }
    for (const withdrawal of pendingWithdrawals) {
      console.log(`  withdraw ${withdrawal.account}: ${withdrawal.amount} of currency ${withdrawal.ccyTypeId}`);
    }
    return;
  }

  for (let i = 0; i < pendingBurns.length; i++) {
    const burn = pendingBurns[i];
    const qty = burn.tokens.reduce((sum, token) => sum + BigInt(token.qty), 0n).toString();
    const stIds = burn.tokens.map((token) => token.stId);
    const tx = await send(
      `burn ${i + 1}/${pendingBurns.length}: ${burn.account} type ${burn.tokTypeId}, stIds ${stIds.join(',')}, qty ${qty}`,
      () => burnableFacet.burnTokens(burn.account, burn.tokTypeId, qty, stIds),
      log,
    );
    log(`  tx ${tx}`);
  }
  for (let i = 0; i < pendingWithdrawals.length; i++) {
    const withdrawal = pendingWithdrawals[i];
    const tx = await send(
      `withdraw ${i + 1}/${pendingWithdrawals.length}: ${withdrawal.account} currency ${withdrawal.ccyTypeId}, amount ${withdrawal.amount}`,
      () =>
        ccyFacet.fundOrWithdraw(
          WITHDRAW,
          withdrawal.ccyTypeId,
          withdrawal.amount,
          withdrawal.account,
          `Entity ${entityId} removal before migration`,
        ),
      log,
    );
    log(`  tx ${tx}`);
  }

  // final check against the live state
  const final = await compare(plan, entityId, ledgerFacet);
  const left = final.pendingBurns.length + final.pendingWithdrawals.length + final.problems.length;
  if (left > 0) {
    throw new Error(`Entity ${entityId} still holds tokens or currency after the run; re-run to see the details`);
  }
  log(`Entity ${entityId} cleared: ${final.doneBurns} tokens burned, ${final.doneWithdrawals} balances withdrawn`);
}

/** Reads the live state of every planned and every current entity account and compares it with the plan. */
async function compare(plan, entityId, ledgerFacet) {
  const problems = [];
  const plannedAccounts = [...plan.burns, ...plan.withdrawals].map((item) => item.account.toLowerCase());
  const liveAccounts = (await read(() => ledgerFacet.getEntityAddresses(entityId))).map((addr) => addr.toLowerCase());
  const accounts = [...new Set([...plannedAccounts, ...liveAccounts])];

  const ledgers = new Map();
  for (const account of accounts) {
    const entry = await read(() => ledgerFacet.getLedgerEntry(account));
    ledgers.set(account, {
      tokens: new Map((entry.exists ? entry.tokens : []).map((token) => [String(token.stId), token])),
      ccys: new Map((entry.exists ? entry.ccys : []).map((ccy) => [String(ccy.ccyTypeId), ccy])),
    });
  }

  // tokens: still on the ledger with the planned quantity = to burn; gone with zero quantity = burned
  const pendingBurns = [];
  const plannedStIds = new Set();
  let doneBurns = 0;
  for (const burn of plan.burns) {
    const ledger = ledgers.get(burn.account.toLowerCase());
    const pendingTokens = [];
    for (const token of burn.tokens) {
      plannedStIds.add(token.stId);
      const live = ledger.tokens.get(token.stId);
      if (live) {
        if (String(live.currentQty) === token.qty) pendingTokens.push(token);
        else problems.push(`Token ${token.stId} on ${burn.account}: quantity ${live.currentQty}, planned ${token.qty}`);
        continue;
      }
      const global = await read(() => ledgerFacet.getSecToken(token.stId));
      if (BigInt(global.currentQty) === 0n) doneBurns++;
      else problems.push(`Token ${token.stId} left ${burn.account} without being burned`);
    }
    for (let i = 0; i < pendingTokens.length; i += MAX_TOKENS_PER_BURN) {
      pendingBurns.push({ ...burn, tokens: pendingTokens.slice(i, i + MAX_TOKENS_PER_BURN) });
    }
  }

  // currency: planned balance = to withdraw; zero = withdrawn
  const pendingWithdrawals = [];
  const plannedCcys = new Set();
  let doneWithdrawals = 0;
  for (const withdrawal of plan.withdrawals) {
    plannedCcys.add(`${withdrawal.account.toLowerCase()}|${withdrawal.ccyTypeId}`);
    const live = ledgers.get(withdrawal.account.toLowerCase()).ccys.get(withdrawal.ccyTypeId);
    const balance = BigInt(live?.balance ?? 0);
    const reserved = BigInt(live?.reserved ?? 0);
    if (reserved !== 0n) problems.push(`${withdrawal.account} has ${reserved} of currency ${withdrawal.ccyTypeId} reserved`);
    else if (balance === 0n) doneWithdrawals++;
    else if (balance.toString() === withdrawal.amount) pendingWithdrawals.push(withdrawal);
    else problems.push(`${withdrawal.account} currency ${withdrawal.ccyTypeId}: balance ${balance}, planned ${withdrawal.amount}`);
  }

  // anything the entity holds that is not in the plan means the plan is out of date
  for (const [account, ledger] of ledgers) {
    for (const [stId, token] of ledger.tokens) {
      if (!plannedStIds.has(stId) && BigInt(token.currentQty) > 0n) problems.push(`Unplanned token ${stId} on ${account}`);
    }
    for (const [ccyTypeId, ccy] of ledger.ccys) {
      const held = BigInt(ccy.balance) !== 0n || BigInt(ccy.reserved) !== 0n;
      if (held && !plannedCcys.has(`${account}|${ccyTypeId}`)) {
        problems.push(`Unplanned balance of currency ${ccyTypeId} on ${account}`);
      }
    }
  }

  return { pendingBurns, pendingWithdrawals, doneBurns, doneWithdrawals, problems };
}

/** Retries a read a few times: reads are safe to repeat, transactions are not. */
async function read(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= READ_ATTEMPTS) throw error;
      console.log(`Read failed (attempt ${attempt}/${READ_ATTEMPTS}), retrying...`);
      await sleep(READ_RETRY_MS);
    }
  }
}

/** Sends one transaction and returns its hash. A failure stops the run: re-running picks up from the live state. */
async function send(description, fn, log) {
  log(description);
  try {
    const result = await fn();
    return result.tx;
  } catch (error) {
    log(`  FAILED: ${error?.message ?? error}`);
    throw new Error('Transaction failed or its result was lost. Wait a minute for it to be mined, then re-run');
  }
}
