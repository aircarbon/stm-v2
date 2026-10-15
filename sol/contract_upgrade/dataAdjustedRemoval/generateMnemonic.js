// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const { toChecksumAddress } = require('web3-utils');

const SIGNER_COUNT = 10; // CONST.RESERVED_ADDRESSES_COUNT: the contract owners

/**
 * Optional helper: generates a random 12-word mnemonic and prints it with its first 10 addresses (the signers of the
 * new contract, which need gas). The mnemonic is a secret: run this in your own terminal and don't share the output.
 *
 * Usage: `node contract_upgrade/dataAdjustedRemoval/generateMnemonic.js`
 */
function deriveAddresses(mnemonic, count) {
  const root = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic));
  const addresses = [];
  for (let i = 0; i < count; i++) {
    // same path as const.js getAccountAndKey
    addresses.push(toChecksumAddress(root.derivePath(`m/44'/60'/0'/0/${i}`).getWallet().getAddressString()));
  }
  return addresses;
}

module.exports = { deriveAddresses };

if (require.main === module) {
  const mnemonic = bip39.generateMnemonic();
  console.log('New mnemonic (secret - store it safely, then put it into PROD_MNEMONIC.js or DEV_MNEMONIC.js):\n');
  console.log(`    MNEMONIC: '${mnemonic}',\n`);
  console.log(`Signers (addresses 0-${SIGNER_COUNT - 1}, top them up with gas):`);
  deriveAddresses(mnemonic, SIGNER_COUNT).forEach((address, i) => console.log(`  ${i}: ${address}`));
}
