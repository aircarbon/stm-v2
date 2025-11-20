// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const { MNEMONIC } = require('./DEV_MNEMONIC.js');

// Derive the seed from mnemonic
const seed = bip39.mnemonicToSeedSync(MNEMONIC);

// Create HD wallet from seed
const hdwallet = hdkey.fromMasterSeed(seed);

console.log('\n=== First 3 Addresses and Private Keys ===\n');

// Derive the first 3 addresses using BIP44 path for Ethereum
// m/44'/60'/0'/0/x where x is the account index
for (let i = 0; i < 10; i++) {
  const path = `m/44'/60'/0'/0/${i}`;
  const wallet = hdwallet.derivePath(path).getWallet();
  const address = `0x${wallet.getAddress().toString('hex')}`;
  const privateKey = `0x${wallet.getPrivateKey().toString('hex')}`;

  console.log(`Account ${i}:`);
  console.log(`  Address:     ${address}`);
  console.log(`  Private Key: ${privateKey}`);
  console.log('');
}
