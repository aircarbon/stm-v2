// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Temporary helper: sends 50 POL to each new signer from address 0 of the mnemonic the network uses
// (DEV_MNEMONIC.js for amoy_testnet). Only addresses holding less than 50 POL are funded, so a re-run does not
// pay twice. Without --send it only prints balances.
//
// Usage: `export INSTANCE_ID=UAT_80002_AC && npx truffle exec contract_upgrade/dataAdjustedRemoval/fundSigners.js --network=amoy_testnet [--send]`
const argv = require('yargs-parser')(process.argv.slice(2));

const AMOUNT = '50'; // POL, not wei
// web3 defaults the tip to 2.5 gwei, below Amoy's 25 gwei minimum; same price as GWEI_MATIC in truffle-config.js
const GAS_PRICE_GWEI = '100';
const SIGNERS = [
  '0xB961f50D1a898f99128bE8fABb9E2533Be14088c',
  '0xC8760B47b125D3C301A994DcEB7E2133bB49856b',
  '0x5600daAd0A4c185aCCd897e4D379B9Af1A7e5e1e',
  '0x545fD446C82040486532EeACC0fd4406eF4c9B49',
  '0x7077C2e13cA309E789E76ABbC857d0c9B3ed5529',
  '0x26f9248Acdec999b68CA7F1eacC0b84bb80ef3d7',
  '0xb0511c8f10940fb64ADaF7973Bf9a605Cc955D69',
  '0xF17D3CdA78457f55C40d464D00F81417bAC7d8f1',
  '0x8240A3fe89Cb07c66E07E4AdFD76B621F3Fc981B',
  '0x739e940a18f1DCBd1Bd97CF68958dAe950FB81AF',
];

module.exports = async (callback) => {
  try {
    // @ts-ignore web3 from truffle
    const { utils, eth } = web3;
    const amount = BigInt(utils.toWei(AMOUNT, 'ether'));
    const pol = (wei) => `${utils.fromWei(wei.toString(), 'ether')} POL`;
    const [sender] = await eth.getAccounts();
    const senderBalance = BigInt(await eth.getBalance(sender));

    const toFund = [];
    for (const address of SIGNERS) {
      const balance = BigInt(await eth.getBalance(address));
      console.log(`${address}: ${pol(balance)}`);
      if (balance < amount) toFund.push(address);
    }
    console.log(`\nSender ${sender}: ${pol(senderBalance)}`);
    console.log(`${toFund.length} of ${SIGNERS.length} addresses hold less than ${AMOUNT} POL and get ${AMOUNT} POL each`);
    if (senderBalance < amount * BigInt(toFund.length)) throw new Error('Sender balance is too low');
    if (!argv.send) {
      console.log('Dry run: add --send to send');
      return callback();
    }

    for (const address of toFund) {
      const receipt = await eth.sendTransaction({
        from: sender,
        to: address,
        value: amount.toString(),
        gas: 21000,
        gasPrice: utils.toWei(GAS_PRICE_GWEI, 'gwei'),
      });
      console.log(`Sent ${AMOUNT} POL to ${address}: tx ${receipt.transactionHash}`);
    }
    callback();
  } catch (error) {
    callback(error);
  }
};
