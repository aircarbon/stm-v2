// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { soliditySha3, toChecksumAddress } = require('web3-utils');
// keep -s/-o as strings: an all-digit address would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'o'] });

process.on('unhandledRejection', console.error);

const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/i;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Rewrites a pair of backup files (WL-<s>.json from backupWL.js and <s>.json from backup.js) for a new mnemonic:
 * the address at whitelist position i is replaced everywhere by the address derived at index i from the mnemonic
 * currently in PROD_MNEMONIC.js / DEV_MNEMONIC.js (picked by INSTANCE_ID, same as the deployment and restore scripts).
 * wlHash and ledgerHash are recomputed, and the result is written to WL-<o>.json and <o>.json,
 * to be restored with restoreWL.js / restore_v2.js using -s=<o>.
 *
 * Usage: `INSTANCE_ID=PROD_83000_B3 node contract_upgrade/swapAddresses.js -s=SOURCE_ADDR -o=OUTPUT_ADDR`
 * (OUTPUT_ADDR is only a file name for the swapped backup, e.g. a non-existing contract address)
 */
async function main() {
  console.time('swapAddresses');
  if (!process.env.INSTANCE_ID) {
    throw new Error('INSTANCE_ID is not set (use the same INSTANCE_ID as for the new contract deployment)');
  }

  const sourceAddress = `0x${String(argv?.s ?? '').replace(/^0x/i, '')}`.toLowerCase();
  const outputAddress = `0x${String(argv?.o ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!ADDRESS_REGEX.test(sourceAddress)) {
    throw new Error(`Invalid source address: ${sourceAddress}`);
  }
  if (!ADDRESS_REGEX.test(outputAddress)) {
    throw new Error(`Invalid output address: ${outputAddress}`);
  }
  if (sourceAddress === outputAddress) {
    throw new Error('Output address must differ from the source address');
  }

  // const.js loads .env.<INSTANCE_ID> when required, so require it only after the check above
  const CONST = require('../const');
  const { getLedgerHashOffChain } = require('./utils');

  const dataDir = path.join(__dirname, 'data');
  const wlFile = path.join(dataDir, `WL-${sourceAddress}.json`);
  const backupFile = path.join(dataDir, `${sourceAddress}.json`);
  const outWlFile = path.join(dataDir, `WL-${outputAddress}.json`);
  const outBackupFile = path.join(dataDir, `${outputAddress}.json`);
  for (const file of [outWlFile, outBackupFile]) {
    if (fs.existsSync(file)) {
      throw new Error(`Output file already exists: ${file}`);
    }
  }

  const wlBackup = JSON.parse(fs.readFileSync(wlFile, 'utf8'));
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  // make sure the source backups are intact before rewriting them
  if (getWlHash(wlBackup.whitelistAddresses) !== wlBackup.wlHash) {
    throw new Error(`wlHash in ${wlFile} does not match its whitelist`);
  }
  if (getLedgerHashOffChain(backup.data, backup.data.transferedFullSecTokensEvents) !== backup.ledgerHash) {
    throw new Error(`ledgerHash in ${backupFile} does not match its data`);
  }

  // both backups list the whitelist in on-chain order; whitelist position i maps to derivation index i
  const wlAddresses = wlBackup.whitelistAddresses;
  const dataWlAddresses = backup.data.whitelistAddresses;
  for (let i = 0; i < Math.min(wlAddresses.length, dataWlAddresses.length); i++) {
    if (wlAddresses[i].toLowerCase() !== dataWlAddresses[i].toLowerCase()) {
      throw new Error(`Whitelist mismatch between the two backup files at position ${i}`);
    }
  }
  const oldAddresses = wlAddresses.length >= dataWlAddresses.length ? wlAddresses : dataWlAddresses;

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
  newWlBackup.info.contractAddress = outputAddress;
  newWlBackup.wlHash = getWlHash(newWlBackup.whitelistAddresses);

  const newBackup = swapAddresses(backup, '', addressMap, counts);
  newBackup.info.contractAddress = outputAddress;
  newBackup.ledgerHash = getLedgerHashOffChain(newBackup.data, newBackup.data.transferedFullSecTokensEvents);

  // catch old addresses embedded in other strings (e.g. batch metadata), which the swap above does not touch
  for (const [file, content] of [[outWlFile, newWlBackup], [outBackupFile, newBackup]]) {
    const leftover = (JSON.stringify(content).match(/0x[0-9a-f]{40}/gi) ?? []).find((match) =>
      oldAddressSet.has(match.toLowerCase()),
    );
    if (leftover) {
      throw new Error(`Old address ${leftover} is still present in the data for ${file}`);
    }
  }

  console.log('\nSwapped addresses by field:');
  console.table(counts);
  console.log('\nOwners:');
  console.table(
    backup.info.owners.map((owner, i) => ({ old: owner, new: newBackup.info.owners[i] })),
  );
  console.log(`\nwlHash:     ${wlBackup.wlHash} -> ${newWlBackup.wlHash}`);
  console.log(`ledgerHash: ${backup.ledgerHash} -> ${newBackup.ledgerHash}`);

  console.log(`\nWriting ${outWlFile}`);
  fs.writeFileSync(outWlFile, JSON.stringify(newWlBackup, null, 2));
  console.log(`Writing ${outBackupFile}`);
  fs.writeFileSync(outBackupFile, JSON.stringify(newBackup, null, 2));

  console.timeEnd('swapAddresses');
}

// same hash as backupWL.js / restoreWL.js
function getWlHash(addresses) {
  let wlHash = '';
  addresses.forEach((address) => {
    wlHash = soliditySha3(wlHash, address);
  });
  return wlHash;
}

// returns a copy of value with every address replaced through addressMap (zero address and contract address are kept)
function swapAddresses(value, jsonPath, addressMap, counts) {
  if (Array.isArray(value)) {
    return value.map((item) => swapAddresses(item, `${jsonPath}[]`, addressMap, counts));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, swapAddresses(item, `${jsonPath}.${key}`, addressMap, counts)]),
    );
  }
  if (typeof value !== 'string' || !ADDRESS_REGEX.test(value) || value.toLowerCase() === NULL_ADDRESS) {
    return value;
  }
  if (jsonPath === '.info.contractAddress') {
    return value;
  }

  const newAddress = addressMap.get(value.toLowerCase());
  if (!newAddress) {
    throw new Error(`Address ${value} at ${jsonPath} is not in the source whitelist`);
  }
  counts[jsonPath] = (counts[jsonPath] ?? 0) + 1;
  return newAddress;
}

// also used by dataAdjustedRemoval/adjustBackup.js
module.exports = { getWlHash, swapAddresses };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error?.message ?? error);
      process.exit(1);
    });
}
