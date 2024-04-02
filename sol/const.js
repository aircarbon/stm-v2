// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

const chalk = require('chalk');
const _ = require('lodash');

// env setup
const envFile = require('path').resolve(__dirname, "./.env." + (process.env.INSTANCE_ID !== undefined ? (process.env.INSTANCE_ID) : ''));
if (!require('fs').existsSync(envFile)) {
    console.log(chalk.red.bold.inverse(`envFile ${envFile} is invalid.`));
    process.exit(1);
}
require('dotenv').config( { path: envFile });
console.log(chalk.red('envFile'.padEnd(30, '.')), envFile);
console.log(chalk.red('process.env.INSTANCE_ID'.padEnd(30, '.')), process.env.INSTANCE_ID);

const Big = require('big.js');
const Web3 = require('web3');
const web3 = new Web3();
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const EthereumJsTx = require('ethereumjs-tx');
const EthereumJsCommon = require('ethereumjs-common').default;
const sha3_512 = require('js-sha3').sha3_512;
const fs = require('fs');
//let r = new EthereumJsCommon('ropsten');
//console.log(r.hardforks());

const truffleAssert = require('truffle-assertions');
const db = require('../orm/build');

//const GAS_USD = 550; // ETH{||BNB}-USD fiat rate
const GAS_USD = 30; // ETH{||BNB}-USD fiat rate

// misc
const WEB3_NONCE_REPLACE = undefined; // set to replace/drop a slow mainnet TX
const WEB3_GWEI_GAS_BID =
    process.env.INSTANCE_ID.includes('_56')  ? '20' // BSC mainnet
  : process.env.INSTANCE_ID.includes('_97')  ? '20' // BSC testnet
  : process.env.INSTANCE_ID === 'PROD_52101' ? '1'  // AC privnet
  : process.env.INSTANCE_ID === 'PROD_1'     ? '80' // ETH mainnet
                                             : '5';
const WEB3_GAS_LIMIT = process.env.INSTANCE_ID.includes('_80001') || process.env.INSTANCE_ID.includes('_137') ? 8000000 : 5000000 // BSC mainnet;

// CFT helpers
const nullCashflowArgs = {
    cashflowType: 0,
    //wei_maxIssuance: 0,
    //wei_currentPrice: 0,
    bond_bps: 0,
    term_Days: 0,
    bond_int_EveryDays: 0,
};
const cashflowType = Object.freeze({
    BOND: 0,
    EQUITY: 1,
});

// assumed: 15 secs per block, unless BSC (3 secs)
const blocksFromSecs = (secs) => Math.ceil(secs / (process.env.NETWORK_ID == 97 || process.env.NETWORK_ID == 56 ? 3 : 15));
const blocksFromMins = (mins) => Math.ceil(blocksFromSecs(mins * 60));
const blocksFromHours = (hours) => Math.ceil(blocksFromMins(hours * 60));
const blocksFromDays = (days) => Math.ceil(blocksFromHours(days * 24));
const blocksFromMonths = (months) => Math.ceil(blocksFromDays(months * 30.42));

//
// MAIN: deployer definitions -- contract ctor() params
//
const contractVer = process.env.CONTRACT_VERSION || "2.4";
const contractProps = {
    COMMODITY: {
        contractVer: contractVer,
        contractDecimals: 0,
        contractName: `ACX`,
        contractUnit: "KG", //"Ton(s)",
        contractSymbol: "ACC",
        cashflowArgs: nullCashflowArgs,
    },
    CASHFLOW_BASE: {
        contractVer: contractVer,
        contractDecimals: 0,
        contractName: `SDax_BaseBond`, // overriden by config; see 2_deploy_contracts.js
        contractUnit: "Token(s)",      // "
        contractSymbol: "SD1A",        // "
        cashflowArgs: {                // "
              cashflowType: cashflowType.BOND,
                 term_Days: 365,       // ==> term_Blks
        bond_int_EveryDays: 30,        // ==> bond_int_EveryBlks
                  bond_bps: 1000,
        }
    },
    CASHFLOW_CONTROLLER: {
        contractVer: contractVer,
        contractDecimals: 0,
        contractName: `SDax_CFT-C`,
        contractUnit: "N/A",
        contractSymbol: "SDCFTC",
        cashflowArgs: nullCashflowArgs
    },
};

var consoleOutput = true;

module.exports = {
    contractProps: contractProps,
    RESERVED_ADDRESSES_COUNT: 10,

    logTestAccountUsage: false,

    nullAddr: "0x0000000000000000000000000000000000000000",
    testAddr1: "0x0000000000000000000000000000000000000001",
    testAddr2: "0x0000000000000000000000000000000000000002",
    testAddr3: "0x0000000000000000000000000000000000000003",
    testAddr4: "0x0000000000000000000000000000000000000004",
    testAddr5: "0x0000000000000000000000000000000000000005",
    testAddr6: "0x0000000000000000000000000000000000000006",
    testAddr7: "0x0000000000000000000000000000000000000007",
    testAddr8: "0x0000000000000000000000000000000000000008",
    testAddr9: "0x0000000000000000000000000000000000000009",
    testAddr10: "0x000000000000000000000000000000000000000A",
    testAddr11: "0x000000000000000000000000000000000000000B",
    testAddr12: "0x000000000000000000000000000000000000000C",
    testAddr13: "0x000000000000000000000000000000000000000D",
    testAddr13: "0x000000000000000000000000000000000000000E",
    testAddr14: "0x000000000000000000000000000000000000000F",
    testAddr99: "0x0000000000000000000000000000000000000099",

    testId1: 1,
    testId2: 2,
    testId3: 3,
    testId4: 4,
    testId5: 5,
    testId6: 6,
    testId7: 7,
    testId8: 8,
    testId9: 9,
    testId10: 10,

    FacetCutAction: {
        Add: 0,
        Replace: 1,
        Remove: 2
    },

    blocksFromSecs: (secs) => blocksFromSecs(secs),
    blocksFromMins: (mins) => blocksFromMins(mins),
    blocksFromHours: (hours) => blocksFromHours(hours),
    blocksFromDays: (days) => blocksFromDays(days),
    blocksFromMonths: (months) => blocksFromMonths(months),

    getAbi: (contractName) => getAbi(contractName),

    getContractsSelectors: (contractName, except = []) => {
        const abi = getAbi(contractName);
        try{
            const selectors = [];
    
            for (const func of abi) {
                if(func.type !== 'function') {
                    continue;
                }
                const selector = web3.eth.abi.encodeFunctionSignature(func);
                if(!except.includes(func.name)) {
                    selectors.push(selector);
                }
            }
    
            return selectors;
        } catch (err) {
            console.log(`Failed to get selectors from the contract '${contractName}', error:`);
            console.log(err);
            process.exit();
        } 
    },

    getContractsSelectorsWithName: (contractName, except = []) => {
        const abi = getAbi(contractName);
        try{
            const selectors = [];
    
            for (const func of abi) {
                if(func.type !== 'function') {
                    continue;
                }
                const selector = web3.eth.abi.encodeFunctionSignature(func);
                if(!except.includes(func.name)) {
                    selectors.push({selector, name: func.name});
                }
            }
    
            return selectors;
        } catch (err) {
            console.log(`Failed to get selectors from the contract '${contractName}', error:`);
            console.log(err);
            process.exit();
        } 
    },

    getContractsSelectorsWithFuncName: (contractName, funcs = []) => {
        const abi = getAbi(contractName);
        try{
            const selectors = [];
    
            for (const func of abi) {
                if(func.type !== 'function') {
                    continue;
                }
                const selector = web3.eth.abi.encodeFunctionSignature(func);
                if(funcs.includes(func.name)) {
                    selectors.push(selector);
                }
            }
    
            return selectors;
        } catch (err) {
            console.log(`Failed to get selectors from the contract '${contractName}', error:`);
            console.log(err);
            process.exit();
        } 
    },

    expectRevertFromCall: async(func, params, err) => {
        try {
            await func(...params);
        } catch (ex) { 
            assert(ex.toString().includes(err), `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    },

    expectRevert: async(func, params, err) => {
        try {
            await func(...params);
        } catch (ex) { 
            assert(ex.reason == err, `unexpected: ${ex.reason}`);
            return; 
        }
        assert.fail('expected contract exception');
    },

    getEvent: (tx, eventName) => {
        const event = tx?.logs?.filter((obj) => obj.event === eventName)[0];
        return event.args;
    },

    getEvents: (tx, eventName) => {
        const events = tx?.logs?.filter((obj) => obj.event === eventName).map((obj) => obj.args);
        return events;
    },

    // If the address is not whitelisted, it will be whitelisted.
    // If an address does not have entity, it will be assigned the one passed.
    whitelistAndSetEntities: async(addresses = [], entityIds = [], OWNER, OWNER_privKey) => {
        if(addresses.length !== entityIds.length) {
            throw Error("whitelistAndSetEntities: arrays' lengths don't match");
        }

        // whitelisting
        let allWLAddresses = await web3_call('getWhitelist', []);
        allWLAddresses = allWLAddresses.map(addr => addr.toString().toLowerCase());
        
        let shouldBeWL = [];

        for(let addr of addresses) {
            if(!allWLAddresses.includes(addr)) {
                shouldBeWL.push(addr);
            }
        }

        await web3_tx('whitelistMany', [shouldBeWL], OWNER, OWNER_privKey);

        // setting entities
        const entitiesOfTheAddresses = await web3_call('getEntityBatch', [addresses]);

        const addr = addresses.filter((_, indx) => entitiesOfTheAddresses[indx] === 0);
        const entIds = entityIds.filter((_, indx) => entitiesOfTheAddresses[indx] === 0);

        await web3_tx('setEntityBatch', [addr, entIds], OWNER, OWNER_privKey);
    },

    // https://docs.chain.link/docs/using-chainlink-reference-contracts
    chainlinkAggregators: {
        "1": { // ETH mainnet
            btcUsd: '0xF5fff180082d6017036B771bA883025c654BC935',
            ethUsd: '0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "3": { // ropsten
            btcUsd: '0x882906a758207FeA9F21e0bb7d2f24E561bd0981',
            ethUsd: '0x8468b2bDCE073A157E560AA4D9CcF6dB1DB98507',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "4": { // rinkeby
            btcUsd: '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD',
            ethUsd: '0x0bF4e7bf3e1f6D6Dc29AA516A33134985cC3A5aA',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "42101": { // AC sidechain testnet
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "52101": { // AC sidechain prodnet
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "56": { // BSC mainnet - https://docs.binance.org/smart-chain/developer/link.html
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
        },
        "97": { // BSC testnet...? https://docs.chain.link/docs/reference-data-contracts-binance-smart-chain#price-feeds
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526', //https://docs.chain.link/docs/binance-smart-chain-addresses/
        },
        "888": { // dev - DM
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "666": { // dev - Antons
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "889": { // dev - Dung
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "890": { // dev - Vince
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "891": { // dev - Ankur
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "80001": { // Matic Mumbai Testnet
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x58bbdbfb6fca3129b91f0dbe372098123b38b5e9',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
        "1402": { // zkEVM Testnet
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000',
            bnbUsd: '0x0000000000000000000000000000000000000000',
        },
    },

    getTestContextWeb3: (useWs) => getTestContextWeb3(useWs),
    getAccountAndKey: async (accountNdx, mnemonic, coinTypeSlip44) => getAccountAndKey(accountNdx, mnemonic, coinTypeSlip44),

    web3_sendEthTestAddr: (sendFromNdx, sendToAddr, ethValue) => web3_sendEthTestAddr(sendFromNdx, sendToAddr, ethValue),

    web3_call: (methodName, methodArgs, nameOverride, addrOverride, fromAddr) =>
        web3_call(methodName, methodArgs, nameOverride, addrOverride, fromAddr),

    generateContractTotalAbi: () => {
        let files = fs.readdirSync('./build/contracts/');
        files = files.filter((fileName) => fileName.includes('Facet.json'));
        
        let result = []

        if(files.length == 0) {
            throw new Error("No ABI files found in the build/contracts folder!");
        }

        for(let fileName of files) {
            try {
            let data = fs.readFileSync(`./build/contracts/${fileName}`, 'utf8');
            data = JSON.parse(data);
            result.push(...data.abi);
            } catch (err) {
            console.error(err);
            }
        }

        result = result.map((func) => {
            return {
                ...func,
                signature: web3.eth.abi.encodeFunctionSignature(func)
            }
        });

        return result;
        // fs.writeFile('./build/contracts/ContractTotal.json', JSON.stringify(result), (err) => { if (err) throw err;});
    },

    web3_tx: (methodName, methodArgs, fromAddr, fromPrivKey, nameOverride, addrOverride, value) =>
        web3_tx(methodName, methodArgs, fromAddr, fromPrivKey, nameOverride, addrOverride, value),

    consoleOutput: (enabled) => { consoleOutput = enabled; },

    getLedgerHashcode: (sc, mod, n) => {
        if (mod === undefined && n === undefined) {
            // use a static (test/arbitrary) segmentation, and locally hash the segment hashes
            const hashes = [];
            return new Promise(async(resolve) => {
                const MOD = 10;
                for (let n=0 ; n < MOD ; n++) {
                    hashes.push(await sc.getLedgerHashcode(MOD, n));
                }
                //hashCode = s => s.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0); // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
                //console.log('getLedgerHashcode - hashes', hashes);
                //console.log('getLedgerHashcode - h[0].hashCode()', hashCode(hashes[0]));
                const ret = hashes.sort().join(',');
                //console.log('getLedgerHashcode - ret', ret);
                resolve(ret);
            });
        }
        else {
            return sc.getLedgerHashcode(mod, n);
        }
    },

    nullFees: {
         ccy_mirrorFee: false,
        ccy_perMillion: 0,
             fee_fixed: 0,
          fee_percBips: 0,
               fee_min: 0,
               fee_max: 0,
    },

    nullFutureArgs: {
        expiryTimestamp: 0,
        underlyerTypeId: 0,
               refCcyId: 0,
         initMarginBips: 0,
          varMarginBips: 0,
           contractSize: 0,
         feePerContract: 0,
    },

    contractType: Object.freeze({
                  COMMODITY: 0,
              CASHFLOW_BASE: 1,
        CASHFLOW_CONTROLLER: 2
    }),

    custodyType: Object.freeze({
               SELF_CUSTODY: 0,
        THIRD_PARTY_CUSTODY: 1
    }),

    cashflowType: cashflowType,

    settlementType: Object.freeze({
        UNDEFINED: 0,
             SPOT: 1,
           FUTURE: 2,
    }),

    getFeeType: Object.freeze({
        CCY: 0,
        TOK: 1,
    }),

    // transfer types (event data)
    transferType: Object.freeze({
          UNDEFINED: 0,

               USER: 1,
       EXCHANGE_FEE: 2,
           ORIG_FEE: 3,

          //TAKEPAY: 4,
        TAKEPAY_FEE: 4,
        SETTLE_TAKE: 5,
         SETTLE_PAY: 6,

           MINT_FEE: 7,
           BURN_FEE: 8,
       WITHDRAW_FEE: 9,
        DEPOSIT_FEE: 10,
           DATA_FEE: 11,
         OTHER_FEE1: 12, // ONBOARDING FEE
         OTHER_FEE2: 13, // FIAT/TOKEN WITHDRAW
         OTHER_FEE3: 14, // RETIREMENT
         OTHER_FEE4: 15, // REBATE
         OTHER_FEE5: 16, // PHYSICAL_DELIVERY

   RELATED_TRANSFER: 17,
         ADJUSTMENT: 18,

              ERC20: 19,
       CFT_ISSUANCE: 20,

        BLOCK_TRADE: 21, // BLOCK TRADE

    }),

    // token types (contract data)
    tokenType: Object.freeze({
          TOK_T1: 1, // Corsia (commodity) || UniToken (cashflow base)
          TOK_T2: 2, // Nature (commodity)
          TOK_T3: 3, // Premium (commodity)
    }),

    // ccy types (contract data)
    ccyType: Object.freeze({
        USD: 1,
        ETH: 2,
        BTC: 3,
        // SGD: 4,
        // EUR: 5,
        // HKD: 6,
        // GBP: 7
    }),

    fundWithdrawType: Object.freeze({
        FUND: 0,
        WITHDRAW: 1
    }),

    // eeu qty constants - tons
    // KT_CARBON: 1000,                      // 1000 qty (tons) = 1 kiloton
    // MT_CARBON: 1000 * 1000,               // 1^6 qty (tons) = 1 megaton
    // GT_CARBON: 1000 * 1000 * 1000,        // 1^9 qty (tons) = 1 gigaton

    // eeu qty constants - kg
    T1_CARBON: 1000,                         //  1^3 kg =            1 ton
    KT_CARBON: 1000 * 1000,                  //  1^6 kg = 1^3 tons = 1 kiloton
    MT_CARBON: 1000 * 1000 * 1000,           //  1^9 kg = 1^6 tons = 1 megaton
    GT_CARBON: 1000 * 1000 * 1000 * 1000,    // 1^12 kg = 1^9 tons = 1 gigaton

    // ccy constants
         oneCcy_cents: Big(1 * 100).toFixed(),
     hundredCcy_cents: Big(100 * 100).toFixed(),
    thousandCcy_cents: Big(1000 * 100).toFixed(),
     millionCcy_cents: Big(1000 * 1000 * 100).toFixed(),
     billionCcy_cents: Big(1000).times(1000).times(1000).times(100).toFixed(),
    thousandthEth_wei: Big(web3.utils.toWei("1", "ether") / 1000).toFixed(),                  // "1000000000000000",
     hundredthEth_wei: Big(web3.utils.toWei("1", "ether") / 100).toFixed(),                   // "10000000000000000",
         tenthEth_wei: Big(web3.utils.toWei("1", "ether") / 10).toFixed(),                    // "100000000000000000",
           oneEth_wei: Big(web3.utils.toWei("1", "ether")).toFixed(),                         // "1000000000000000000",
      thousandEth_wei: Big(web3.utils.toWei("1", "ether") * 1000).toFixed(),                  // "1000000000000000000000",
       millionEth_wei: Big(web3.utils.toWei("1", "ether")).times(1000).times(1000).toFixed(), // "1000000000000000000000000",
     hundredthBtc_sat: Big(1000000).toFixed(),
         tenthBtc_sat: Big(10000000).toFixed(),
           oneBtc_sat: Big(100000000).toFixed(),
      thousandBtc_sat: Big(100000000).times(1000).toFixed(),
       millionBtc_sat: Big(100000000).times(1000000).toFixed(),

    // gas approx values - for cost estimations
    //gasPriceEth: _gasPriceEth,
    //     ethUsd: _ethUsd,

    logGas: async (truffleWeb3, truffleTx, desc) => { // actual gas price, not estimated
        //console.log('truffleTx', truffleTx);

        const web3Tx = await truffleWeb3.eth.getTransaction(truffleTx.receipt.transactionHash);
        //console.log('web3Tx', web3Tx);

        const actualGasPriceEth = web3.utils.fromWei(web3Tx.gasPrice);
        //console.log('actualGasPriceEth', actualGasPriceEth);

        const weiCost = web3Tx.gasPrice * truffleTx.receipt.gasUsed;
        const usdCost = actualGasPriceEth * truffleTx.receipt.gasUsed * GAS_USD;

        console.log(`>>> gasUsed - [${process.env.INSTANCE_ID}] ${chalk.inverse(desc)}: \
${truffleTx.receipt.gasUsed} gas * ${web3.utils.fromWei(web3Tx.gasPrice, 'gwei')}\
gwei = Ξ${(actualGasPriceEth * truffleTx.receipt.gasUsed).toFixed(4)} ~= \
${chalk.inverse(`$${(usdCost).toFixed(4)}`)} (@ $${GAS_USD} ETH[||BNB]/USD)`);

        return { usdCost, weiCost };
    }
};

function getTestContextWeb3(useWs) {
    const options = { keepAlive: true, withCredentials: false, timeout: 90000 };
    
    const context =

        // dev - DM
          process.env.WEB3_NETWORK_ID == 888 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev - Antons
        : process.env.WEB3_NETWORK_ID == 666 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }

        : process.env.WEB3_NETWORK_ID == 889 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev - Vince
        : process.env.WEB3_NETWORK_ID == 890 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev - Ankur
        : process.env.WEB3_NETWORK_ID == 891 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }

        // Ropsten - AC Geth
        : process.env.WEB3_NETWORK_ID == 3 ?     { web3: new Web3('https://ac-dev0.net:9545'), ethereumTxChain: { chain: 'ropsten', hardfork: 'petersburg' } }
      //: process.env.WEB3_NETWORK_ID == 3 ?     { web3: new Web3('https://ropsten.infura.io/v3/05a8b81beb9a41008f74864b5b1ed544'), ethereumTxChain: { chain: 'ropsten', hardfork: 'petersburg' } }

        // Rinkeby - Infura (AirCarbon-AwsDev)
        : process.env.WEB3_NETWORK_ID == 4 ?     { web3: new Web3('https://rinkeby.infura.io/v3/05a8b81beb9a41008f74864b5b1ed544'), ethereumTxChain: { chain: 'rinkeby', hardfork: 'petersburg' } }

        // Sidechain Testnet - AC Geth
        : process.env.WEB3_NETWORK_ID == 42101 ? { web3: new Web3(useWs ? 'wss://ac-dev1.net:9546' : 'https://ac-dev1.net:9545'),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'test_ac',
                networkId: 42101,
                chainId: 42101,
            },
            'petersburg'
        ) } }

        // Sidechain Prodnet - AC Geth
        : process.env.WEB3_NETWORK_ID == 52101 ? { web3: new Web3(useWs ? 'wss://ac-prod0.aircarbon.co:9546' : 'https://ac-prod0.aircarbon.co:9545'),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'prodnet_ac',
                networkId: 52101,
                chainId: 52101,
            },
            'petersburg'
        ) } }

        // BSC Mainnet - Binance Smart Chain
        : process.env.WEB3_NETWORK_ID == 56 ? { web3: new Web3(useWs ? 'wss://bsc-prod1.sdax.co:9546' : 'https://bsc-prod.sdax.co:9545'),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'bsc_mainnet_ac',
                networkId: 56,
                chainId: 56,
            },
            'petersburg'
        ) } }

        // BSC Testnet - Binance Smart Chain
        : process.env.WEB3_NETWORK_ID == 97 ? { web3: new Web3(useWs ? 'wss://ac-prod1.aircarbon.co:8546' : 'https://ac-prod1.aircarbon.co:8545'),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'bsc_testnet_bn',
                networkId: 97,
                chainId: 97,
            },
            'petersburg'
        ) } }

        // Matic Mainnet
        : process.env.WEB3_NETWORK_ID == 137 ? { web3: new Web3(
                useWs ?
                '' :
                ''

            ),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'matic_mainnet',
                networkId: 137,
                chainId: 137,
            },
            'petersburg'
        ) } }

        // Matic (Amoy) Testnet
        : process.env.WEB3_NETWORK_ID == 80002 ? { web3: new Web3(
            useWs ?
            '' :
            '',
            options
        ),
        ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
        'ropsten', // forCustomChain() requires a "known" name!?
        {
            name: 'amoy_testnet',
            networkId: 80002,
            chainId: 80002,
        },
        'petersburg'
    ) } }

        // Matic (Mumbai) Testnet
        : process.env.WEB3_NETWORK_ID == 80001 ? { web3: new Web3(
                useWs ?
                '' :
                '',
                options
            ),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'matic_testnet',
                networkId: 80001,
                chainId: 80001,
            },
            'petersburg'
        ) } }

        // IDX UAT Dev Private Chain
        : process.env.WEB3_NETWORK_ID == 800135 ? {
            web3: new Web3(
                useWs ?
                    '' :
                    '',
                options
            ),
            ethereumTxChain: {
                common: EthereumJsCommon.forCustomChain(
                    'ropsten', // forCustomChain() requires a "known" name!?
                    {
                        name: 'idx_private_dev',
                        networkId: 800135,
                        chainId: 800135,
                    },
                    'petersburg'
                )
            }
        }

        // IDX Demo Private Chain
        : process.env.WEB3_NETWORK_ID == 30407734 ? {
            web3: new Web3(
                useWs ?
                    '' :
                    ''
            ),
            ethereumTxChain: {
                common: EthereumJsCommon.forCustomChain(
                    'ropsten', // forCustomChain() requires a "known" name!?
                    {
                        name: 'idx_private_demo',
                        networkId: 30407734,
                        chainId: 30407734,
                    },
                    // 'petersburg'
                )
            }
        }

        // IDX PROD Private Chain
        : process.env.WEB3_NETWORK_ID == 30407734 ? {
            web3: new Web3(
                useWs ?
                    '' :
                    '',
                options
            ),
            ethereumTxChain: {
                common: EthereumJsCommon.forCustomChain(
                    'ropsten', // forCustomChain() requires a "known" name!?
                    {
                        name: 'idx_private_prod',
                        networkId: 30407734,
                        chainId: 30407734,
                    },
                    'petersburg'
                )
            } 
        }

        // JPM Chain
        : process.env.WEB3_NETWORK_ID == 25 ? {
            web3: new Web3(
                useWs ?
                    '-' :
                    'http://localhost:4000',
                options
            ),
            ethereumTxChain: {
                common: EthereumJsCommon.forCustomChain(
                    'ropsten', // forCustomChain() requires a "known" name!?
                    {
                        name: 'jpm_testnet',
                        networkId: 25,
                        chainId: 25,
                    },
                    'petersburg'
                )
            } 
        }

        // zkEVM Testnet
        : process.env.WEB3_NETWORK_ID == 1402 ? { web3: new Web3(
            useWs ?
            'wss://public.zkevm-test.net:2083' :
            'https://public.zkevm-test.net:2083',
            options
        ),
        ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
        'ropsten', // forCustomChain() requires a "known" name!?
        {
            name: 'zkevm_testnet',
            networkId: 1402,
            chainId: 1402,
        },
    ) } }
        
        // Fantom Testnet
        : process.env.WEB3_NETWORK_ID == 4002 ? { web3: new Web3(
                useWs ?
                '' :
                'https://rpc.testnet.fantom.network',
                options
            ),
            ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'fantom_testnet',
                networkId: 4002,
                chainId: 4002,
            },
            'petersburg'
        ) } }

        // ETH Mainnet - Infura (AirCarbon-AwsDev)
      //: process.env.WEB3_NETWORK_ID == 1 ? { web3: new Web3('https://ac-dev0.net:10545'), ethereumTxChain: {} }
        : process.env.WEB3_NETWORK_ID == 1 ? { web3: new Web3('https://mainnet.infura.io/v3/25a36609b48744bdaa0639e7c2b008d9'), ethereumTxChain: {} }

        : undefined;
    if (!context) throw('WEB3_NETWORK_ID is not set!');
    return context;
}

async function getAccountAndKey(accountNdx, mnemonic, coinTypeSlip44) {
    const MNEMONIC =
        process.env.PROD_MNEMONIC !== undefined
            ? process.env.PROD_MNEMONIC
            : process.env.INSTANCE_ID.includes('PROD')
                ? (require('./PROD_MNEMONIC.js').MNEMONIC)
                : mnemonic || require('./DEV_MNEMONIC.js').MNEMONIC;

    const seed = await bip39.mnemonicToSeed(MNEMONIC);
    const hdk = hdkey.fromMasterSeed(seed);
    const addr_node = hdk.derivePath(`m/44'/${coinTypeSlip44 || '60'}'/0'/0/${accountNdx}`);
    const addr = addr_node.getWallet().getAddressString();
    const privKeyBytes = addr_node.getWallet().getPrivateKey();
    const privKeyHex = privKeyBytes.toString('hex');
    return { addr, privKey: privKeyHex, };
}

async function web3_call(methodName, methodArgs, nameOverride, addrOverride, fromAddr) {
    const { web3, ethereumTxChain } = getTestContextWeb3();
    var contractDb;
    if (addrOverride == undefined) {
        const contractName = process.env.CONTRACT_PREFIX + (nameOverride || contractProps[process.env.CONTRACT_TYPE].contractName);
        const contractVer = process.env.CONTRACT_VER || contractProps[process.env.CONTRACT_TYPE].contractVer;
        contractDb = (await db.GetDeployment(process.env.WEB3_NETWORK_ID, contractName, contractVer)).recordset[0];
        if (!contractDb) throw(Error(`Failed to lookup contract deployment for (nameOverride=[${nameOverride}]): networkId=${process.env.WEB3_NETWORK_ID}, contractName=${contractName}, contractVer=${contractVer} from ${process.env.sql_server}`));
    }
    else {
        contractDb = (await db.GetDeploymentByAddress(process.env.WEB3_NETWORK_ID, addrOverride)).recordset[0];
        if (!contractDb) throw(Error(`Failed to lookup contract deployment for (addrOverride=[${addrOverride}]): networkId=${process.env.WEB3_NETWORK_ID} from ${process.env.sql_server}`));
    }
    if (consoleOutput) console.log(chalk.dim(` > CALL: [${chalk.greenBright(contractDb.contract_enum)} ${contractDb.contract_ver} @${contractDb.addr}] ${chalk.reset.blue.bgWhite(methodName + '(' + methodArgs.map(p => JSON.stringify(p)).join() + ')')}` + chalk.dim(` [networkId: ${process.env.WEB3_NETWORK_ID} - ${web3.currentProvider.host}] - ${process.env.sql_server}`)));
    var contract = new web3.eth.Contract(JSON.parse(contractDb.abi), contractDb.addr);
    if ((await contract.methods['version']().call()) != contractDb.contract_ver) throw('Deployed contract missing or version mismatch'); // test contract exists - will silently return null on calls if it's not deployed, wtf
    if (fromAddr) {
        return await contract.methods[methodName](...methodArgs).call({from: fromAddr});
    }
    else {
        return await contract.methods[methodName](...methodArgs).call();
    }
}

const getAbi = (contractName) => {
    try {
        const contract = JSON.parse(fs.readFileSync(`./build/contracts/${contractName}.json`, 'utf8'));
        return contract.abi;
    } catch (err) {
        console.log(`Failed to get ABI for the contract '${contractName}', error:`);
        console.log(err);
        process.exit();
    }
}

async function web3_tx(methodName, methodArgs, fromAddr, fromPrivKey, nameOverride, addrOverride, value = 0) {
    const { web3, ethereumTxChain } = getTestContextWeb3();
    var contractDb;
    if (addrOverride == undefined) {
        const contractName = process.env.CONTRACT_PREFIX + (nameOverride || contractProps[process.env.CONTRACT_TYPE].contractName);
        const contractVer = process.env.CONTRACT_VER || contractProps[process.env.CONTRACT_TYPE].contractVer;
        contractDb = (await db.GetDeployment(process.env.WEB3_NETWORK_ID, contractName, contractVer)).recordset[0];
        if (!contractDb) throw(Error(`Failed to lookup contract deployment for (nameOverride=[${nameOverride}]): networkId=${process.env.WEB3_NETWORK_ID}, contractName=${contractName}, contractVer=${contractVer} from ${process.env.sql_server}`));
    }
    else {
        contractDb = (await db.GetDeploymentByAddress(process.env.WEB3_NETWORK_ID, addrOverride)).recordset[0];
        if (!contractDb) throw(Error(`Failed to lookup contract deployment for (addrOverride=[${addrOverride}]): networkId=${process.env.WEB3_NETWORK_ID} from ${process.env.sql_server}`));
    }
    var contract = new web3.eth.Contract(JSON.parse(contractDb.abi), contractDb.addr);
    if ((await contract.methods['version']().call()) != contractDb.contract_ver) throw('Deployed contract missing or version mismatch'); // test contract exists - will silently return null on calls if it's not deployed, wtf

    // Error: Subscriptions are not supported with the HttpProvider.
    // WS: https://github.com/ethereum/web3.js/issues/2661
    // contract.events.allEvents({
    //     // filter
    // }, function (err, ev) {
    //     console.log('callback', ev);
    // },
    // ).on('data', (ev) => {
    //     console.log('data', ev);
    // })
    // .on('changed', (ev) => {
    //     console.log('changed', ev);
    // })
    // .on('error', (ev) => {
    //     console.log('error', ev);
    //}
    //);

    //web3.eth.transactionConfirmationBlocks = 1;
    //web3.transactionConfirmationBlocks = 1;
    //console.dir(web3);

    // tx data
    const msStart = Date.now();
    const nonce = WEB3_NONCE_REPLACE || await web3.eth.getTransactionCount(fromAddr, "pending");
    if (consoleOutput) console.log(
            chalk.dim(` >   TX: [${chalk.greenBright(contractDb.contract_enum)} nonce=${nonce} ${contractDb.contract_ver} @${contractDb.addr}] ${chalk.reset.red.bgWhiteBright(methodName + '(' + methodArgs.map(p => JSON.stringify(p)).join() + ')')}\n` +
            chalk.dim(`     ... (from: ${fromAddr} / gwei: ${WEB3_GWEI_GAS_BID} / networkId: ${process.env.WEB3_NETWORK_ID} / node: ${web3.currentProvider.host} / db: ${process.env.sql_server})`))
    );

    var paramsData = contract.methods
        [methodName](...methodArgs)
        .encodeABI();
    const txData = {
      chainId: web3.utils.toHex(process.env.WEB3_NETWORK_ID),
        nonce: nonce,
     gasPrice: web3.utils.toHex(web3.utils.toWei(WEB3_GWEI_GAS_BID, 'gwei')),
     gasLimit: WEB3_GAS_LIMIT,
         from: fromAddr,
           to: contractDb.addr,
         data: paramsData,
        value: value
     }

    // estimate gas
    //const gasEstimate = await web3.eth.estimateGas(txData);
    //if (consoleOutput) console.log(chalk.dim.yellow('   -> gasEstimate=', gasEstimate));

    // send signed tx
    const EthereumTx = EthereumJsTx.Transaction
    var tx = new EthereumTx(txData, ethereumTxChain);
    tx.sign(Buffer.from(fromPrivKey, 'hex'));
    const raw = '0x' + tx.serialize().toString('hex');
    const txPromise = new Promise((resolve, reject) =>  {
        var txHash;
        web3.eth.sendSignedTransaction(raw)
        // .on("receipt", receipt => {
        //     if (consoleOutput) console.log(`   => receipt`, receipt);
        // })
        .once("transactionHash", hash => {
            txHash = hash;
            if (consoleOutput) console.log(chalk.dim.yellow(`   => ${txHash} ...`));
        })
        .once("confirmation", async (confirms, receipt) => {
            const msStop = Date.now();
            const msElapsed = msStop - msStart;

            //const receipt = await web3.eth.getTransactionReceipt(txHash);
            const evs = await contract.getPastEvents("allEvents", { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
            //console.log('receipt', receipt);
            //console.log('evs', evs);
            if (consoleOutput) console.log(chalk.dim.yellow(`   => ${txHash} - ${confirms} confirm(s), secs=${(msElapsed/1000).toFixed(1)} receipt.gasUsed=${receipt.gasUsed} receipt.blockNumber=${receipt.blockNumber} evs=${evs.map(p => `B# ${p.blockNumber}: ${p.event}`).join(',')}`));//, JSON.stringify(receipt)));
            // receipt.logs
            // receipt.blockNumber
            // receipt.blockHash
            // receipt.transactionHash
            //console.log('evs', evs.map(p => `B# ${p.blockNumber}: ${p.event}(${JSON.stringify(p.returnValues)})`).join('\n'));
            resolve({ txHash, receipt, evs });
        })
        .once("error", error => {
            //console.error(`   => error`, error);
            if (!_.isEmpty(error.error) || error.error === undefined) {
                console.log(chalk.red(`   => ## error`, JSON.stringify(error)));
                //console.dir(error);
                reject(error);
            }
        });
    });
    return txPromise;
}

async function web3_sendEthTestAddr(sendFromNdx, sendToAddr, ethValue) {
    const { addr: fromAddr, privKey: fromPrivKey } = await getAccountAndKey(sendFromNdx);
    //const { addr: toAddr,   privKey: toPrivKey }   = await getAccountAndKey(sendToNdx);

    // send signed tx
    const { web3, ethereumTxChain } = getTestContextWeb3();
    if (consoleOutput) console.log(` > TX web3_sendEthTestAddr: Ξ${chalk.red.bgWhite(ethValue.toString())} @ ${chalk.red.bgWhite(fromAddr)} => ${chalk.red.bgWhite(sendToAddr)} [networkId: ${process.env.WEB3_NETWORK_ID} - ${web3.currentProvider.host}]`);
    const nonce = await web3.eth.getTransactionCount(fromAddr, "pending");
    const EthereumTx = EthereumJsTx.Transaction
    var tx = new EthereumTx({
         chainId: web3.utils.toHex(process.env.WEB3_NETWORK_ID),
           nonce: nonce,
        gasPrice: web3.utils.toHex(web3.utils.toWei(WEB3_GWEI_GAS_BID, 'gwei')),
        gasLimit: WEB3_GAS_LIMIT,
              to: sendToAddr,
            from: fromAddr,
           value: web3.utils.toHex(web3.utils.toWei(ethValue)),
        },
        ethereumTxChain,
    );
    //console.dir(fromPrivKey);
    tx.sign(Buffer.from(fromPrivKey, 'hex'));
    const raw = '0x' + tx.serialize().toString('hex');
    const txPromise = new Promise((resolve, reject) =>  {
        var txHash;
        web3.eth.sendSignedTransaction(raw)
        // .on("receipt", receipt => {
        //     //console.log(`   => receipt`, receipt);
        // })
        .once("transactionHash", hash => {
            txHash = hash;
            //console.log(`   => ${txHash} ...`);
        })
        .once("confirmation", async confirms => {
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            if (consoleOutput) console.log(chalk.yellow(`   => ${txHash} - ${confirms} confirm(s), receipt.gasUsed=`, receipt.gasUsed));
            resolve(txHash);
        })
        .once("error", error => {
            if (!_.isEmpty(error.error) || error.error === undefined) {
                console.log(chalk.red(`   => ## error`, JSON.stringify(error)));
                //console.dir(error);
                reject(error);
            }
        });
    });
    return txPromise;
}
