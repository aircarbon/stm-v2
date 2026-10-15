// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { getWlHash, swapAddresses } = require('../swapAddresses');
// keep -s/-a/-t/--entity as strings: an all-digit value would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'a', 't', 'entity'] });

const MAX_LISTED = 20;

/**
 * Compares the old contract with the new one after a migration with entity removal. Read-only, offline: reads
 * WL-<s>.json and <s>.json (old contract after clearing, the input of adjustBackup.js), WL-<a>.json and <a>.json
 * (adjusted backup) and <t>.json (backup of the new contract that restore_v2.js writes at the end).
 *
 * 1. Restore: the new contract's data equals the adjusted backup, its whitelist matches the adjusted wlHash.
 * 2. Addresses: the new address at whitelist position i is mapped back to the old address at position i; the new
 *    contract must hold no old address and no address outside its whitelist.
 * 3. Against the old contract, built independently of adjustBackup.js: the entity is gone (record, fee owner, per-entity
 *    fees, ledger entries, which held nothing), its accounts are whitelisted with entity 0, and everything else is
 *    identical: other entities and their fees, account entities, ledger entries with their fees, tokens, batches,
 *    types and totals.
 *
 * Usage: `node contract_upgrade/dataAdjustedRemoval/compareMigration.js -s=SOURCE_ADDR -a=ADJUSTED_ADDR -t=NEW_ADDR --entity=ENTITY_ID`
 */
function main() {
  const sourceAddress = parseAddress('s', 'source');
  const adjustedAddress = parseAddress('a', 'adjusted');
  const newAddress = parseAddress('t', 'new contract');
  const entityId = String(argv?.entity ?? '');
  if (!/^[1-9][0-9]*$/.test(entityId)) throw new Error(`Invalid entity ID: ${entityId}`);

  const dataDir = path.join(__dirname, '..', 'data');
  const read = (name) => JSON.parse(fs.readFileSync(findFile(dataDir, name), 'utf8'));
  const sourceWl = read(`WL-${sourceAddress}.json`);
  const source = read(`${sourceAddress}.json`);
  const adjustedWl = read(`WL-${adjustedAddress}.json`);
  const adjusted = read(`${adjustedAddress}.json`);
  const target = read(`${newAddress}.json`);
  const unit = source.info.unit;

  // 1. the new contract holds exactly the adjusted backup
  const restoreDiffs = diff(normalize(adjusted.data), normalize(target.data), 'data');
  diff({ ...adjusted.info, contractAddress: '' }, { ...target.info, contractAddress: '' }, 'info', restoreDiffs);
  if (getWlHash(target.data.whitelistAddresses) !== adjustedWl.wlHash) {
    restoreDiffs.push(`whitelist does not match the wlHash in WL-${adjustedAddress}.json`);
  }
  if (target.ledgerHash !== adjusted.ledgerHash) {
    restoreDiffs.push(`ledgerHash ${target.ledgerHash}, adjusted backup has ${adjusted.ledgerHash}`);
  }

  // 2. map the new addresses back by whitelist position (same rule as adjustBackup.js)
  if (getWlHash(sourceWl.whitelistAddresses) !== sourceWl.wlHash) {
    throw new Error(`wlHash in WL-${sourceAddress}.json does not match its whitelist`);
  }
  const wlAddresses = sourceWl.whitelistAddresses;
  const dataWlAddresses = source.data.whitelistAddresses;
  for (let i = 0; i < Math.min(wlAddresses.length, dataWlAddresses.length); i++) {
    if (wlAddresses[i].toLowerCase() !== dataWlAddresses[i].toLowerCase()) {
      throw new Error(`Whitelist mismatch between the two source backup files at position ${i}`);
    }
  }
  const oldAddresses = wlAddresses.length >= dataWlAddresses.length ? wlAddresses : dataWlAddresses;
  const newAddresses = target.data.whitelistAddresses;
  if (newAddresses.length !== oldAddresses.length) {
    throw new Error(`New whitelist has ${newAddresses.length} addresses, the old one ${oldAddresses.length}`);
  }
  if (new Set(newAddresses.map((addr) => addr.toLowerCase())).size !== newAddresses.length) {
    throw new Error('New whitelist has duplicate addresses');
  }
  const oldAddressSet = new Set(oldAddresses.map((addr) => addr.toLowerCase()));
  const leftover = (JSON.stringify(target).match(/0x[0-9a-f]{40}/gi) ?? []).filter((match) =>
    oldAddressSet.has(match.toLowerCase()),
  );
  if (leftover.length > 0) throw new Error(`New contract still holds old address ${leftover[0]} (${leftover.length} times)`);
  const reverseMap = new Map(newAddresses.map((addr, i) => [addr.toLowerCase(), oldAddresses[i]]));
  const counts = {};
  let mapped;
  try {
    mapped = swapAddresses(target, '', reverseMap, counts);
  } catch (error) {
    throw new Error(`New contract holds an address outside its whitelist: ${error?.message ?? error}`);
  }

  // 3. old contract vs new contract (addresses mapped back)
  const old = source.data;
  const now = mapped.data;
  const differences = [];
  diff({ ...source.info, contractAddress: '' }, { ...mapped.info, contractAddress: '' }, 'info', differences);

  // entities with fee owners, by id
  const oldEntities = old.entitiesWithFeeOwners;
  const newEntities = now.entitiesWithFeeOwners;
  const entity = oldEntities.find((e) => String(e.id) === entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found in ${sourceAddress}.json`);
  if (newEntities.some((e) => String(e.id) === entityId)) differences.push(`entity ${entityId} still exists`);
  const newEntityById = new Map(newEntities.map((e) => [String(e.id), e]));
  for (const e of oldEntities) {
    if (String(e.id) === entityId) continue;
    const found = newEntityById.get(String(e.id));
    if (!found) differences.push(`entity ${e.id} is missing`);
    else diff(e, found, `entity ${e.id}`, differences);
  }
  const oldEntityIds = new Set(oldEntities.map((e) => String(e.id)));
  for (const e of newEntities) if (!oldEntityIds.has(String(e.id))) differences.push(`entity ${e.id} is new`);

  // per-entity fee lists: one entry per (type, entity), type-major, entities in entitiesWithFeeOwners order (see utils.js)
  for (const [key, types] of [
    ['ccyFees', old.ccyTypes],
    ['tokenFees', old.tokenTypes],
  ]) {
    if (old[key].length !== types.length * oldEntities.length || now[key].length !== types.length * newEntities.length) {
      differences.push(`${key}: ${now[key].length} entries for ${types.length} types x ${newEntities.length} entities (old: ${old[key].length})`);
      continue;
    }
    const oldIndex = new Map(oldEntities.map((e, i) => [String(e.id), i]));
    types.forEach((type, t) =>
      newEntities.forEach((e, j) => {
        const i = oldIndex.get(String(e.id));
        if (i === undefined) return; // reported above
        diff(old[key][t * oldEntities.length + i], now[key][t * newEntities.length + j], `${key} ${type.name}/entity ${e.id}`, differences);
      }),
    );
  }

  // account entities: the entity's accounts are now entity 0, all others unchanged (the whitelist maps by position)
  let reassigned = 0;
  old.accountEntities.forEach((id, i) => {
    const expected = String(id) === entityId ? '0' : String(id);
    if (String(id) === entityId) reassigned++;
    if (String(now.accountEntities[i]) !== expected) {
      differences.push(`account ${oldAddresses[i]}: entity ${now.accountEntities[i]}, expected ${expected}`);
    }
  });
  if (now.accountEntities.length !== old.accountEntities.length) {
    differences.push(`accountEntities: ${now.accountEntities.length} items, old ${old.accountEntities.length}`);
  }

  // ledger entries with their fees, by owner: the entity's are gone (and must have held nothing), all others identical
  const entityOf = new Map(oldAddresses.map((addr, i) => [addr.toLowerCase(), String(old.accountEntities[i] ?? '0')]));
  const newLedgerIndex = new Map(now.ledgerOwners.map((owner, i) => [owner.toLowerCase(), i]));
  const removed = { ledgers: 0, held: 0, minted: 0n, burned: 0n };
  let keptLedgers = 0;
  old.ledgerOwners.forEach((owner, i) => {
    const j = newLedgerIndex.get(owner.toLowerCase());
    const ledger = old.ledgers[i];
    if (entityOf.get(owner.toLowerCase()) === entityId) {
      if (j !== undefined) differences.push(`ledger entry of entity account ${owner} still exists`);
      const tokens = ledger.tokens.filter((token) => BigInt(token.currentQty) !== 0n).length;
      const ccys = ledger.ccys.filter((ccy) => BigInt(ccy.balance) !== 0n || BigInt(ccy.reserved) !== 0n).length;
      if (tokens > 0 || ccys > 0) differences.push(`entity account ${owner} held ${tokens} tokens and ${ccys} currency balances on the old contract`);
      removed.ledgers++;
      removed.minted += BigInt(ledger.spot_sumQtyMinted ?? 0);
      removed.burned += BigInt(ledger.spot_sumQtyBurned ?? 0);
      return;
    }
    if (j === undefined) {
      differences.push(`ledger entry of ${owner} is missing`);
      return;
    }
    keptLedgers++;
    diff(normalizeLedger(ledger), normalizeLedger(now.ledgers[j]), `ledger ${owner}`, differences);
    diff(old.ledgerOwnersFees[i], now.ledgerOwnersFees[j], `ledger fees ${owner}`, differences);
  });
  const oldLedgerOwners = new Set(old.ledgerOwners.map((owner) => owner.toLowerCase()));
  for (const owner of now.ledgerOwners) {
    if (!oldLedgerOwners.has(owner.toLowerCase())) differences.push(`ledger entry of ${owner} is new`);
  }
  for (const key of ['ledgers', 'ledgerOwnersFees']) {
    if (now[key].length !== now.ledgerOwners.length) differences.push(`${key}: ${now[key].length} items for ${now.ledgerOwners.length} ledger owners`);
  }

  // everything else: identical
  const handled = new Set(['entitiesWithFeeOwners', 'ccyFees', 'tokenFees', 'accountEntities', 'whitelistAddresses', 'ledgerOwners', 'ledgers', 'ledgerOwnersFees']);
  const rest = (data) => normalize(Object.fromEntries(Object.entries(data).filter(([key]) => !handled.has(key))));
  diff(rest(old), rest(now), 'data', differences);

  // report
  const mappedCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  console.log(`Compare migration of ${source.info.name}: ${source.info.contractAddress} -> ${target.info.contractAddress}, entity ${entityId} removed`);
  console.log(`Old:      ${sourceAddress}.json, WL-${sourceAddress}.json`);
  console.log(`Adjusted: ${adjustedAddress}.json, WL-${adjustedAddress}.json`);
  console.log(`New:      ${newAddress}.json (written by restore_v2.js)`);

  console.log('\nRestore (new contract vs adjusted backup)');
  console.log(`  ${restoreDiffs.length === 0 ? 'identical: data, info, whitelist hash, ledger hash' : `${restoreDiffs.length} differences`}`);

  console.log('\nAddresses');
  console.log(`  ${format(newAddresses.length)} whitelist addresses mapped back by position, ${format(mappedCount)} address fields`);
  console.log('  no old address on the new contract, none outside its whitelist');

  console.log(`\nEntity ${entityId}`);
  console.log(`  entity record and fee owner ${entity.addr}: gone`);
  console.log(`  ${old.ccyTypes.length} currency and ${old.tokenTypes.length} token type fee entries: gone`);
  console.log(`  ${format(reassigned)} accounts: whitelisted with entity 0`);
  console.log(`  ${format(removed.ledgers)} ledger entries: gone (they held nothing; their history of ${format(removed.minted)} ${unit} minted, ${format(removed.burned)} ${unit} burned is not kept)`);

  console.log('\nOther data (compared with the old contract)');
  console.log(`  ${format(newEntities.length)} entities with fee owners and fees`);
  console.log(`  ${format(old.accountEntities.length - reassigned)} account entities`);
  console.log(`  ${format(keptLedgers)} ledger entries with their fees`);
  console.log(`  ${format(now.globalSecTokens.length)} tokens, ${format(now.batches.length)} batches, ${now.ccyTypes.length} currency types, ${now.tokenTypes.length} token types`);
  console.log(`  totals: ${format(BigInt(now.secTokenMintedQty))} ${unit} minted, ${format(BigInt(now.secTokenBurnedQty))} ${unit} burned`);

  const all = [...restoreDiffs.map((line) => `restore: ${line}`), ...differences];
  console.log('\nDifferences');
  if (all.length === 0) console.log('  none');
  for (const line of all.slice(0, MAX_LISTED)) console.log(`  - ${line}`);
  if (all.length > MAX_LISTED) console.log(`  ... and ${all.length - MAX_LISTED} more`);

  const result =
    all.length > 0
      ? 'FAIL: the new contract differs from the old one in more than the removed entity'
      : `PASS: the new contract matches the old one without entity ${entityId}`;
  console.log(`\n${result}`);
  if (all.length > 0) process.exitCode = 1;
}

function parseAddress(flag, name) {
  const address = `0x${String(argv?.[flag] ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error(`Invalid ${name} address (-${flag}): ${address}`);
  return address;
}

/** Token lists are compared by stId: their order on chain is not part of the state. */
function normalize(data) {
  return {
    ...data,
    ...(data.globalSecTokens && { globalSecTokens: [...data.globalSecTokens].sort(byStId) }),
    ...(data.ledgers && { ledgers: data.ledgers.map(normalizeLedger) }),
  };
}

function normalizeLedger(ledger) {
  return { ...ledger, tokens: [...ledger.tokens].sort(byStId) };
}

function byStId(a, b) {
  return Number(a.stId) - Number(b.stId);
}

function diff(expected, actual, at, out = []) {
  if (out.length > MAX_LISTED * 5) return out;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.push(`${at}: ${actual.length} items, expected ${expected.length}`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff(expected[i], actual[i], `${at}[${i}]`, out);
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      diff(expected[key], actual[key], `${at}.${key}`, out);
    }
  } else if (String(expected) !== String(actual)) {
    // String(): the new backup has some numbers where the old one has strings (e.g. info.contractType)
    out.push(`${at}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
  return out;
}

// file names may differ in letter case from the address
function findFile(dir, name) {
  const match = fs.readdirSync(dir).find((file) => file.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`${path.join(dir, name)} not found`);
  return path.join(dir, match);
}

function format(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

try {
  main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
