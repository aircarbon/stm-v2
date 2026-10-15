// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// Temporary helper: cancels the stuck pending transactions of signer 0 (address 0 of the mnemonic the network uses).
// Each stuck nonce gets a 0 POL transfer to itself at a higher gas price, which replaces the stuck transaction.
// Afterwards re-run the interrupted script (e.g. restore_v2.js): it reads the chain and resends what is missing.
// Without --send it only lists the stuck transactions. Stop the script that sent them first.
//
// Usage: `export INSTANCE_ID=UAT_80002_AC && npx truffle exec contract_upgrade/dataAdjustedRemoval/cancelPending.js --network=amoy_testnet --gwei=80 [--send]`
const argv = require('yargs-parser')(process.argv.slice(2));

module.exports = async (callback) => {
  try {
    // @ts-ignore web3 from truffle
    const { utils, eth, currentProvider } = web3;
    const [sender] = await eth.getAccounts();
    const gwei = String(argv.gwei ?? '80');
    const latest = await eth.getTransactionCount(sender, 'latest');
    const pending = await eth.getTransactionCount(sender, 'pending');
    const block = await eth.getBlock('latest');
    console.log(`Sender ${sender}: nonce latest ${latest}, pending ${pending}`);
    console.log(`Base fee ${Number(block.baseFeePerGas) / 1e9} gwei; Amoy needs a tip of at least 25 gwei on top`);

    // the node's view of the sender's stuck transactions (same nonce must be replaced at >= 10% higher price)
    const pool = await new Promise((resolve, reject) =>
      currentProvider.send(
        { jsonrpc: '2.0', id: Date.now(), method: 'txpool_contentFrom', params: [sender] },
        (error, response) => (error ? reject(error) : resolve(response.result)),
      ),
    );
    const stuck = Object.values({ ...pool?.pending, ...pool?.queued }).sort((a, b) => Number(a.nonce) - Number(b.nonce));
    stuck.forEach((tx) =>
      console.log(`  nonce ${Number(tx.nonce)}: ${Number(tx.gasPrice) / 1e9} gwei, ${tx.hash}`),
    );
    if (stuck.length === 0) {
      console.log('Nothing stuck');
      return callback();
    }
    const tooLow = stuck.filter((tx) => BigInt(utils.toWei(gwei, 'gwei')) * 10n < BigInt(tx.gasPrice) * 11n);
    if (tooLow.length > 0) throw new Error(`--gwei=${gwei} is less than 10% above a stuck transaction's price`);
    if (!argv.send) {
      console.log(`Dry run: add --send to replace these ${stuck.length} transactions with 0 POL transfers at ${gwei} gwei`);
      return callback();
    }

    for (const tx of stuck) {
      const receipt = await eth.sendTransaction({
        from: sender,
        to: sender,
        value: '0',
        gas: 21000,
        gasPrice: utils.toWei(gwei, 'gwei'),
        nonce: Number(tx.nonce),
      });
      console.log(`Cancelled nonce ${Number(tx.nonce)}: tx ${receipt.transactionHash}`);
    }
    console.log(`Nonce now ${await eth.getTransactionCount(sender, 'latest')}`);
    callback();
  } catch (error) {
    callback(error);
  }
};
