// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { toChecksumAddress } = require('web3-utils');
const { getWlHash, swapAddresses } = require('../swapAddresses');
// keep -s/-o/--entity as strings: an all-digit value would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'o', 'entity'] });

const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/i;

/**
 * Adjusts the backups of a cleared source contract for the new contract:
 * 1. removes the entity: its record and fee owner, its slices of the per-entity fee lists, and its accounts' ledger
 *    entries; its accounts stay whitelisted with entity 0. Stops if the entity still holds tokens or currency.
 * 2. swaps every address to the mnemonic currently in PROD_MNEMONIC.js / DEV_MNEMONIC.js (picked by INSTANCE_ID, same
 *    as the deployment and restore scripts): whitelist position i -> derived address i.
 * 3. recalculates wlHash and ledgerHash.
 * Reads WL-<s>.json and <s>.json (never modified), writes WL-<o>.json and <o>.json for restoreWL.js / restore_v2.js -s=<o>.
 *
 * Usage: `INSTANCE_ID=<target instance> node contract_upgrade/dataAdjustedRemoval/adjustBackup.js -s=SOURCE_ADDR -o=OUTPUT_ADDR --entity=ENTITY_ID`
 * (OUTPUT_ADDR is only a file name for the adjusted backup, e.g. a non-existing contract address)
 */
async function main() {
  console.time('adjustBackup');
  if (!process.env.INSTANCE_ID) {
    throw new Error('INSTANCE_ID is not set (use the same INSTANCE_ID as for the new contract deployment)');
  }
  const sourceAddress = `0x${String(argv?.s ?? '').replace(/^0x/i, '')}`.toLowerCase();
  const outputAddress = `0x${String(argv?.o ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!ADDRESS_REGEX.test(sourceAddress)) throw new Error(`Invalid source address: ${sourceAddress}`);
  if (!ADDRESS_REGEX.test(outputAddress)) throw new Error(`Invalid output address: ${outputAddress}`);
  if (sourceAddress === outputAddress) throw new Error('Output address must differ from the source address');
  const entityId = String(argv?.entity ?? '');
  if (!/^[1-9][0-9]*$/.test(entityId)) throw new Error(`Invalid entity ID: ${entityId}`);

  // const.js loads .env.<INSTANCE_ID> when required, so require it only after the check above
  const CONST = require('../../const');
  const { getLedgerHashOffChain } = require('../utils');

  const dataDir = path.join(__dirname, '..', 'data');
  const wlFile = path.join(dataDir, `WL-${sourceAddress}.json`);
  const backupFile = path.join(dataDir, `${sourceAddress}.json`);
  const outWlFile = path.join(dataDir, `WL-${outputAddress}.json`);
  const outBackupFile = path.join(dataDir, `${outputAddress}.json`);
  for (const file of [outWlFile, outBackupFile]) {
    if (fs.existsSync(file)) throw new Error(`Output file already exists: ${file}`);
  }

  const wlBackup = JSON.parse(fs.readFileSync(wlFile, 'utf8'));
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  // make sure the source backups are intact and describe the same whitelist
  if (getWlHash(wlBackup.whitelistAddresses) !== wlBackup.wlHash) {
    throw new Error(`wlHash in ${wlFile} does not match its whitelist`);
  }
  if (getLedgerHashOffChain(backup.data, backup.data.transferedFullSecTokensEvents) !== backup.ledgerHash) {
    throw new Error(`ledgerHash in ${backupFile} does not match its data`);
  }
  const wlAddresses = wlBackup.whitelistAddresses;
  const dataWlAddresses = backup.data.whitelistAddresses;
  for (let i = 0; i < Math.min(wlAddresses.length, dataWlAddresses.length); i++) {
    if (wlAddresses[i].toLowerCase() !== dataWlAddresses[i].toLowerCase()) {
      throw new Error(`Whitelist mismatch between the two backup files at position ${i}`);
    }
  }
  const oldAddresses = wlAddresses.length >= dataWlAddresses.length ? wlAddresses : dataWlAddresses;

  // 1. remove the entity
  const { data: removed, summary } = removeEntity(backup.data, entityId);
  const adjustedBackup = { ...backup, data: removed };

  // 2. derive the new addresses and swap: whitelist position i maps to derivation index i
  const mnemonicSource =
    process.env.PROD_MNEMONIC !== undefined
      ? 'PROD_MNEMONIC env variable'
      : process.env.INSTANCE_ID.includes('PROD')
        ? 'PROD_MNEMONIC.js'
        : 'DEV_MNEMONIC.js';
  console.log(`Deriving ${oldAddresses.length} new addresses from ${mnemonicSource}...`);
  const newAddresses = [];
  for (let i = 0; i < oldAddresses.length; i++) {
    // same derivation as deploymentHelper.js (owners) and restoreWL.js (additional whitelist addresses)
    newAddresses.push(toChecksumAddress((await CONST.getAccountAndKey(i)).addr));
  }
  const oldAddressSet = new Set(oldAddresses.map((addr) => addr.toLowerCase()));
  const overlapping = newAddresses.filter((addr) => oldAddressSet.has(addr.toLowerCase()));
  if (overlapping.length > 0) {
    throw new Error(
      `${overlapping.length} derived addresses are already in the source whitelist - is the new mnemonic in ${mnemonicSource}?`,
    );
  }
  const addressMap = new Map(oldAddresses.map((addr, i) => [addr.toLowerCase(), newAddresses[i]]));
  const counts = {};
  const newWlBackup = swapAddresses(wlBackup, '', addressMap, counts);
  const newBackup = swapAddresses(adjustedBackup, '', addressMap, counts);

  // catch old addresses embedded in other strings (e.g. batch metadata), which the swap does not touch
  for (const [file, content] of [
    [outWlFile, newWlBackup],
    [outBackupFile, newBackup],
  ]) {
    const leftover = (JSON.stringify(content).match(/0x[0-9a-f]{40}/gi) ?? []).find((match) =>
      oldAddressSet.has(match.toLowerCase()),
    );
    if (leftover) throw new Error(`Old address ${leftover} is still present in the data for ${file}`);
  }

  // mapping the new addresses back must give exactly the source minus the removed entity
  const reverseMap = new Map(oldAddresses.map((addr, i) => [newAddresses[i].toLowerCase(), addr]));
  if (
    !isDeepStrictEqual(swapAddresses(newWlBackup, '', reverseMap, {}), wlBackup) ||
    !isDeepStrictEqual(swapAddresses(newBackup, '', reverseMap, {}), adjustedBackup)
  ) {
    throw new Error('Address swap self-check failed: mapping back does not give the source data');
  }

  // 3. recalculate the hashes the restore scripts compare against
  newWlBackup.info.contractAddress = outputAddress;
  newWlBackup.wlHash = getWlHash(newWlBackup.whitelistAddresses);
  newBackup.info.contractAddress = outputAddress;
  newBackup.ledgerHash = getLedgerHashOffChain(newBackup.data, newBackup.data.transferedFullSecTokensEvents);

  console.log(`\nRemoved entity ${entityId}:`);
  console.log(`  entity record and fee owner ${summary.feeOwner}`);
  console.log(`  ${summary.ccyFees} currency and ${summary.tokenFees} token type fee entries`);
  console.log(`  ${summary.accounts} accounts set to entity 0 (they stay whitelisted)`);
  console.log(`  ${summary.ledgers} empty ledger entries`);
  console.log('\nSwapped addresses by field:');
  console.table(counts);
  console.log(`\nwlHash:     ${wlBackup.wlHash} -> ${newWlBackup.wlHash}`);
  console.log(`ledgerHash: ${backup.ledgerHash} -> ${newBackup.ledgerHash}`);

  console.log(`\nWriting ${outWlFile}`);
  fs.writeFileSync(outWlFile, JSON.stringify(newWlBackup, null, 2));
  console.log(`Writing ${outBackupFile}`);
  fs.writeFileSync(outBackupFile, JSON.stringify(newBackup, null, 2));
  console.timeEnd('adjustBackup');
}

/** Returns a copy of the backup data without the entity. Fails if the entity still holds anything. */
function removeEntity(data, entityId) {
  const entities = data.entitiesWithFeeOwners;
  const entityIndex = entities.findIndex((entity) => String(entity.id) === entityId);
  if (entityIndex < 0) {
    throw new Error(`Entity ${entityId} not found. Entities: ${entities.map((entity) => entity.id).join(', ')}`);
  }

  // per-entity fee lists are ordered type-major, one entry per entity (see utils.js createBackupData)
  const entityCount = entities.length;
  if (data.ccyFees.length !== data.ccyTypes.length * entityCount) {
    throw new Error(`Unexpected ccyFees layout: ${data.ccyFees.length} entries for ${data.ccyTypes.length} currencies x ${entityCount} entities`);
  }
  if (data.tokenFees.length !== data.tokenTypes.length * entityCount) {
    throw new Error(`Unexpected tokenFees layout: ${data.tokenFees.length} entries for ${data.tokenTypes.length} token types x ${entityCount} entities`);
  }
  if (data.accountEntities.length !== data.whitelistAddresses.length) {
    throw new Error('accountEntities and whitelistAddresses differ in length');
  }
  if (data.ledgerOwnersFees.length !== data.ledgerOwners.length || data.ledgers.length !== data.ledgerOwners.length) {
    throw new Error('ledgerOwners, ledgers and ledgerOwnersFees differ in length');
  }

  const entityAccounts = new Set(
    data.whitelistAddresses
      .filter((_, i) => String(data.accountEntities[i]) === entityId)
      .map((addr) => addr.toLowerCase()),
  );
  const isEntityLedger = (_, i) => entityAccounts.has(data.ledgerOwners[i].toLowerCase());

  // the entity must have been cleared on chain first (clearEntity.js)
  const notCleared = [];
  data.ledgers.forEach((ledger, i) => {
    if (!isEntityLedger(ledger, i)) return;
    const tokens = ledger.tokens.filter((token) => BigInt(token.currentQty) !== 0n).length;
    const ccys = ledger.ccys.filter((ccy) => BigInt(ccy.balance) !== 0n || BigInt(ccy.reserved) !== 0n).length;
    if (tokens > 0 || ccys > 0) notCleared.push(`${data.ledgerOwners[i]}: ${tokens} tokens, ${ccys} currency balances`);
  });
  if (notCleared.length > 0) {
    throw new Error(`Entity ${entityId} still holds tokens or currency; run clearEntity.js first:\n  ${notCleared.join('\n  ')}`);
  }

  const keepFee = (_, i) => i % entityCount !== entityIndex;
  const removedLedgers = data.ledgers.filter(isEntityLedger).length;
  return {
    data: {
      ...data,
      entitiesWithFeeOwners: entities.filter((_, i) => i !== entityIndex),
      ccyFees: data.ccyFees.filter(keepFee),
      tokenFees: data.tokenFees.filter(keepFee),
      accountEntities: data.accountEntities.map((id) => (String(id) === entityId ? '0' : id)),
      ledgerOwners: data.ledgerOwners.filter((owner, i) => !isEntityLedger(owner, i)),
      ledgers: data.ledgers.filter((ledger, i) => !isEntityLedger(ledger, i)),
      ledgerOwnersFees: data.ledgerOwnersFees.filter((fees, i) => !isEntityLedger(fees, i)),
    },
    summary: {
      feeOwner: entities[entityIndex].addr,
      ccyFees: data.ccyTypes.length,
      tokenFees: data.tokenTypes.length,
      accounts: entityAccounts.size,
      ledgers: removedLedgers,
    },
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
