// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { isDeepStrictEqual } = require('util');
// keep -s/--entity as strings: an all-digit value would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'entity'] });

const MAX_LISTED = 20;

/**
 * Verifies the clearing of an entity by comparing the backup taken before it (before-0x<s>.json) with the backup
 * taken after it (0x<s>.json). Read-only.
 *
 * Every token the entity held must be either still held unchanged or fully burned (moved off the ledger with
 * currentQty 0, all other fields unchanged), and every currency balance either unchanged or withdrawn to 0. The
 * expected after-state is rebuilt from the before-backup plus exactly those burns and withdrawals, with the totals a
 * burn updates on chain (ledger spot_sumQty/spot_sumQtyBurned, batch burnedQty, global secTokenBurnedQty), and must
 * equal the after-backup. Any other difference is reported as unexpected.
 *
 * Usage: `node contract_upgrade/dataAdjustedRemoval/verifyClear.js -s=SOURCE_ADDR --entity=ENTITY_ID`
 */
function main() {
  const sourceAddress = `0x${String(argv?.s ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(sourceAddress)) {
    throw new Error(`Invalid source address: ${sourceAddress}`);
  }
  const entityId = String(argv?.entity ?? '');
  if (!/^[1-9][0-9]*$/.test(entityId)) {
    throw new Error(`Invalid entity ID: ${entityId}`);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const beforeFile = findFile(dataDir, `before-${sourceAddress}.json`);
  const afterFile = findFile(dataDir, `${sourceAddress}.json`);
  const beforeBytes = fs.readFileSync(beforeFile);
  const before = JSON.parse(beforeBytes.toString());
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  const unit = before.info.unit;

  const entityOf = new Map(
    before.data.whitelistAddresses.map((addr, i) => [addr.toLowerCase(), String(before.data.accountEntities[i] ?? '0')]),
  );
  if (![...entityOf.values()].includes(entityId)) {
    throw new Error(`Entity ${entityId} has no accounts in ${beforeFile}`);
  }
  const isEntityAccount = (addr) => entityOf.get(addr.toLowerCase()) === entityId;
  const ccyName = new Map(before.data.ccyTypes.map((ccy) => [String(ccy.id), ccy]));

  // where each token is in the after-backup
  const afterLedgerIndex = new Map(after.data.ledgerOwners.map((owner, i) => [owner.toLowerCase(), i]));
  const afterTokenOwner = new Map();
  after.data.ledgerOwners.forEach((owner, i) => {
    for (const token of after.data.ledgers[i].tokens) afterTokenOwner.set(String(token.stId), owner.toLowerCase());
  });
  const afterGlobal = new Map(after.data.globalSecTokens.map((token) => [String(token.stId), token]));

  // classify everything the entity held before: still held, cleared, or changed in some other way
  const unexpected = [];
  const burned = []; // { ledgerIndex, token }
  const withdrawn = []; // { ledgerIndex, ccyIndex }
  const remaining = { tokens: 0, qty: 0n, balances: 0 };
  const cleared = { tokens: 0, qty: 0n };
  const withdrawnByCcy = new Map();
  const remainingByCcy = new Map();
  before.data.ledgerOwners.forEach((owner, i) => {
    if (!isEntityAccount(owner)) return;
    const afterIndex = afterLedgerIndex.get(owner.toLowerCase());
    if (afterIndex === undefined) {
      unexpected.push(`Ledger entry of ${owner} is gone`);
      return;
    }
    const afterLedger = after.data.ledgers[afterIndex];
    for (const token of before.data.ledgers[i].tokens) {
      const stId = String(token.stId);
      const qty = BigInt(token.currentQty);
      if (qty === 0n) continue;
      const stillOwned = afterLedger.tokens.find((t) => String(t.stId) === stId);
      if (stillOwned) {
        remaining.tokens++;
        remaining.qty += qty;
        continue; // any change to a still-held token shows up in the full comparison below
      }
      const global = afterGlobal.get(stId);
      if (!afterTokenOwner.has(stId) && global && isDeepStrictEqual(global, { ...token, currentQty: '0' })) {
        burned.push({ ledgerIndex: i, token });
        cleared.tokens++;
        cleared.qty += qty;
      } else {
        unexpected.push(`Token ${stId} left ${owner} without a full burn${afterTokenOwner.has(stId) ? ` (now on ${afterTokenOwner.get(stId)})` : ''}`);
      }
    }
    before.data.ledgers[i].ccys.forEach((ccy, c) => {
      const balance = BigInt(ccy.balance);
      if (balance === 0n && BigInt(ccy.reserved) === 0n) return;
      const afterCcy = afterLedger.ccys.find((x) => String(x.ccyTypeId) === String(ccy.ccyTypeId));
      const id = String(ccy.ccyTypeId);
      if (afterCcy && BigInt(afterCcy.balance) === 0n && BigInt(afterCcy.reserved) === 0n) {
        withdrawn.push({ ledgerIndex: i, ccyIndex: c });
        withdrawnByCcy.set(id, (withdrawnByCcy.get(id) ?? 0n) + balance);
      } else {
        remaining.balances++;
        remainingByCcy.set(id, (remainingByCcy.get(id) ?? 0n) + balance);
      }
    });
  });

  // rebuild the expected after-state: the before-backup plus exactly the burns and withdrawals found above
  const expected = structuredClone(before.data);
  const batchIndex = new Map(expected.batches.map((batch, i) => [String(batch.id), i]));
  for (const { ledgerIndex, token } of burned) {
    const ledger = expected.ledgers[ledgerIndex];
    const qty = BigInt(token.currentQty);
    ledger.tokens = ledger.tokens.filter((t) => String(t.stId) !== String(token.stId));
    ledger.spot_sumQty = (BigInt(ledger.spot_sumQty) - qty).toString();
    ledger.spot_sumQtyBurned = (BigInt(ledger.spot_sumQtyBurned) + qty).toString();
    const batch = expected.batches[batchIndex.get(String(token.batchId))];
    batch.burnedQty = (BigInt(batch.burnedQty) + qty).toString();
    expected.secTokenBurnedQty = (BigInt(expected.secTokenBurnedQty) + qty).toString();
    expected.globalSecTokens.push({ ...token, currentQty: '0' });
  }
  for (const { ledgerIndex, ccyIndex } of withdrawn) {
    expected.ledgers[ledgerIndex].ccys[ccyIndex].balance = '0';
  }
  const differences = diff(normalize(expected), normalize(after.data), 'data');
  if (!isDeepStrictEqual(before.info, after.info)) differences.unshift('info (contract identity, owners) changed');
  unexpected.push(...differences);

  // report
  const minted = [before.data.secTokenMintedQty, after.data.secTokenMintedQty].map(BigInt);
  const burnedTotal = [before.data.secTokenBurnedQty, after.data.secTokenBurnedQty].map(BigInt);
  const plan = readPlan(dataDir, sourceAddress, entityId);
  console.log(`Verify clearing of entity ${entityId} on ${before.info.name} (${before.info.contractAddress})`);
  console.log(`Before: ${path.basename(beforeFile)}`);
  console.log(`After:  ${path.basename(afterFile)}`);
  if (plan) {
    const sha = createHash('sha256').update(beforeBytes).digest('hex');
    console.log(`Plan made from the before-backup: ${plan.source.sha256 === sha ? 'yes' : 'NO (plan comes from another backup)'}`);
  }

  console.log('\nEntity holdings');
  console.log(`  tokens burned:     ${format(cleared.tokens)} (${format(cleared.qty)} ${unit})`);
  console.log(`  tokens still held: ${format(remaining.tokens)} (${format(remaining.qty)} ${unit})`);
  for (const [id, amount] of withdrawnByCcy) console.log(`  withdrawn:         ${formatCcy(amount, ccyName.get(id))}`);
  for (const [id, amount] of remainingByCcy) console.log(`  currency left:     ${formatCcy(amount, ccyName.get(id))}`);

  console.log('\nGlobal totals');
  console.log(`  minted: ${format(minted[0])} → ${format(minted[1])} ${unit}`);
  console.log(`  burned: ${format(burnedTotal[0])} → ${format(burnedTotal[1])} ${unit} (+${format(burnedTotal[1] - burnedTotal[0])}, entity burns +${format(cleared.qty)})`);

  console.log('\nUnexpected changes');
  if (unexpected.length === 0) console.log('  none');
  for (const line of unexpected.slice(0, MAX_LISTED)) console.log(`  - ${line}`);
  if (unexpected.length > MAX_LISTED) console.log(`  ... and ${unexpected.length - MAX_LISTED} more`);

  const result =
    unexpected.length > 0
      ? 'FAIL: the after-backup has changes other than burning and withdrawing the entity holdings'
      : remaining.tokens > 0 || remaining.balances > 0
        ? `NOT CLEARED: the entity still holds ${format(remaining.tokens)} tokens and ${remaining.balances} currency balances; nothing else changed`
        : `PASS: entity ${entityId} holds nothing, and nothing else changed`;
  console.log(`\n${result}`);
  if (!result.startsWith('PASS')) process.exitCode = 1;
}

/** Token lists are compared by stId: a burn reorders the remaining tokens of a ledger. */
function normalize(data) {
  const byStId = (a, b) => Number(a.stId) - Number(b.stId);
  return {
    ...data,
    globalSecTokens: [...data.globalSecTokens].sort(byStId),
    ledgers: data.ledgers.map((ledger) => ({ ...ledger, tokens: [...ledger.tokens].sort(byStId) })),
  };
}

function diff(expected, actual, at, out = []) {
  if (out.length > MAX_LISTED * 5) return out;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.push(`${at}: ${expected.length} items expected, ${actual.length} found`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff(expected[i], actual[i], `${at}[${i}]`, out);
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      diff(expected[key], actual[key], `${at}.${key}`, out);
    }
  } else if (String(expected) !== String(actual)) {
    out.push(`${at}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
  return out;
}

// the copied before-file may differ in letter case from the address
function findFile(dir, name) {
  const match = fs.readdirSync(dir).find((file) => file.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`${path.join(dir, name)} not found`);
  return path.join(dir, match);
}

function readPlan(dir, sourceAddress, entityId) {
  const file = path.join(dir, `clear-plan-${sourceAddress}-entity-${entityId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

function format(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCcy(amount, ccy) {
  const decimals = Number(ccy.decimals);
  const digits = (amount < 0n ? -amount : amount).toString().padStart(decimals + 1, '0');
  const fraction = decimals > 0 ? `.${digits.slice(-decimals)}` : '';
  return `${amount < 0n ? '-' : ''}${format(digits.slice(0, digits.length - decimals))}${fraction} ${ccy.name}`;
}

try {
  main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
