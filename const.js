const chalk = require('chalk');
const _ = require('lodash');

const envFile = require('path').resolve(__dirname, "./.env." + (process.env.INSTANCE_ID !== undefined ? (process.env.INSTANCE_ID) : ''));
if (!require('fs').existsSync(envFile)) {
    console.log(chalk.red.bold.inverse(`envFile ${envFile} is invalid.`)); 
    process.exit(1);        
}
require('dotenv').config( { path: envFile });
console.log(chalk.red('envFile'), envFile);
const Big = require('big.js');
const Web3 = require('web3');
const web3 = new Web3();
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const EthereumJsTx = require('ethereumjs-tx');
const EthereumJsCommon = require('ethereumjs-common').default;
//let r = new EthereumJsCommon('ropsten');
//console.log(r.hardforks());

const truffleAssert = require('truffle-assertions');
const { db } = require('../common/dist');


const ETH_USD = 190;

// misc
const WEB3_GWEI_GAS_BID = '15';
const WEB3_GAS_LIMIT = 5000000;

// CFT helpers
const nullCashflowArgs = { cashflowType: 0,
    //wei_maxIssuance: 0,
    //wei_currentPrice: 0,
    term_Blks: 0, bond_bps: 0, bond_int_EveryBlks: 0 };
const cashflowType = Object.freeze({
    BOND: 0,
    EQUITY: 1,
});
const blocksFromSecs = (secs) => Math.ceil(secs / 15); // 15 secs per block avg assumed
const blocksFromMins = (mins) => Math.ceil(blocksFromSecs(mins * 60));
const blocksFromHours = (hours) => Math.ceil(blocksFromMins(hours * 60));
const blocksFromDays = (days) => Math.ceil(blocksFromHours(days * 24));
const blocksFromMonths = (months) => Math.ceil(blocksFromDays(months * 30.42));

//
// MAIN: deployer definitions -- contract ctor() params
//
const contractVer = "0.97i";
const contractProps = {
    COMMODITY: {
        contractVer: contractVer,
        contractName: `AirCarbon`,
        contractUnit: "KG", //"Ton(s)",
        contractSymbol: "ACC",
        contractDecimals: 0,
        cashflowArgs: nullCashflowArgs,
    },
    CASHFLOW: {
        contractVer: contractVer,
        contractName: `SingDax_CFT-1A`,
        contractUnit: "Token(s)",
        contractSymbol: "SD1A",
        contractDecimals: 0,
        cashflowArgs: {
              cashflowType: cashflowType.BOND,
                 term_Blks: blocksFromDays(1),
                  bond_bps: 1000, // 10%
        bond_int_EveryBlks: blocksFromHours(1)
        }
    },
    CASHFLOW_CONTROLLER: {
        contractVer: contractVer,
        contractName: `SingDax_CFT-C`,
        contractUnit: "N/A",
        contractSymbol: "SDCFTC",
        contractDecimals: 0,
        cashflowArgs: nullCashflowArgs
    },
};

var consoleOutput = true;

module.exports = {
    contractProps: contractProps,

    logTestAccountUsage: false,

    nullAddr: "0x0000000000000000000000000000000000000000",

    // https://docs.chain.link/docs/using-chainlink-reference-contracts
    chainlinkAggregators: {
        "1": { // mainnet
            btcUsd: '0xF5fff180082d6017036B771bA883025c654BC935',
            ethUsd: '0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9'
        },
        "3": { // ropsten
            btcUsd: '0x882906a758207FeA9F21e0bb7d2f24E561bd0981',
            ethUsd: '0x8468b2bDCE073A157E560AA4D9CcF6dB1DB98507'
        },
        "4": { // rinkeby
            btcUsd: '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD',
            ethUsd: '0x0bF4e7bf3e1f6D6Dc29AA516A33134985cC3A5aA'
        },
        "42101": { // AC private testnet
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000'
        },
        "888": { // dev
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000'
        },
        "889": { // dev
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000'
        },
        "890": { // dev
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000'
        },
        "891": { // dev
            btcUsd: '0x0000000000000000000000000000000000000000',
            ethUsd: '0x0000000000000000000000000000000000000000'
        },
    },

    getTestContextWeb3: () => getTestContextWeb3(),
    getAccountAndKey: async (accountNdx, mnemonic) => getAccountAndKey(accountNdx, mnemonic),

    web3_sendEthTestAddr: (sendFromNdx, sendToAddr, ethValue) => web3_sendEthTestAddr(sendFromNdx, sendToAddr, ethValue),
    web3_call: (methodName, methodArgs) => web3_call(methodName, methodArgs),
    web3_tx: (methodName, methodArgs, fromAddr, fromPrivKey, returnBeforeConfirmed) => web3_tx(methodName, methodArgs, fromAddr, fromPrivKey, returnBeforeConfirmed),

    consoleOutput: (enabled) => { consoleOutput = enabled; },

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
        CASHFLOW: 1,
        CASHFLOW_CONTROLLER: 2,
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
        USER: 0,
EXCHANGE_FEE: 1,
    ORIG_FEE: 2,
     TAKEPAY: 3,
 TAKEPAY_FEE: 4
    }),

    // token types (contract data)
    tokenType: Object.freeze({
          CORSIA: 1,
          NATURE: 2,
         PREMIUM: 3,
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
        const usdCost = actualGasPriceEth * truffleTx.receipt.gasUsed * ETH_USD;

        console.log(`>>> gasUsed - ${desc}: ${truffleTx.receipt.gasUsed} @${actualGasPriceEth} ETH/gas = Ξ${(actualGasPriceEth * truffleTx.receipt.gasUsed).toFixed(4)} ~= $${(usdCost).toFixed(4)}`);
        return { usdCost, weiCost };
    }
};

function getTestContextWeb3() {
    const context =

        // dev - DM
          process.env.WEB3_NETWORK_ID == 888 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev -Dung
        : process.env.WEB3_NETWORK_ID == 889 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev -Vince
        : process.env.WEB3_NETWORK_ID == 890 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }
        // dev -Lakshmi
        : process.env.WEB3_NETWORK_ID == 891 ?   { web3: new Web3('http://127.0.0.1:8545'),    ethereumTxChain: {} }

        // Ropsten - AC Geth
        : process.env.WEB3_NETWORK_ID == 3 ?     { web3: new Web3('https://ac-dev0.net:9545'), ethereumTxChain: { chain: 'ropsten', hardfork: 'petersburg' } }
      //: process.env.WEB3_NETWORK_ID == 3 ?     { web3: new Web3('https://ropsten.infura.io/v3/05a8b81beb9a41008f74864b5b1ed544'), ethereumTxChain: { chain: 'ropsten', hardfork: 'petersburg' } }

        // Rinkeby - Infura (AirCarbon-AwsDev)
        : process.env.WEB3_NETWORK_ID == 4 ?     { web3: new Web3('https://rinkeby.infura.io/v3/05a8b81beb9a41008f74864b5b1ed544'), ethereumTxChain: { chain: 'rinkeby', hardfork: 'petersburg' } }

        // Private Testnet - AC Geth
        : process.env.WEB3_NETWORK_ID == 42101 ? { web3: new Web3('https://ac-dev1.net:9545'), ethereumTxChain: { common: EthereumJsCommon.forCustomChain(
            'ropsten', // forCustomChain() requires a "known" name!?
            {
                name: 'test_ac',
                networkId: 42101,
                chainId: 42101,
            },
            'muirGlacier'
        ) } }

        : undefined;
    if (!context) throw('WEB3_NETWORK_ID is not set!');
    return context;
}

async function getAccountAndKey(accountNdx, mnemonic) {
    const MNEMONIC = mnemonic || require('./DEV_MNEMONIC.js').MNEMONIC;
    //console.log('MNEMONIC: ', MNEMONIC);
    const seed = await bip39.mnemonicToSeed(MNEMONIC);
    const hdk = hdkey.fromMasterSeed(seed);
    const addr_node = hdk.derivePath(`m/44'/60'/0'/0/${accountNdx}`);
    const addr = addr_node.getWallet().getAddressString();
    const privKeyBytes = addr_node.getWallet().getPrivateKey();
    //console.dir(privKeyBytes);
    const privKeyHex = privKeyBytes.toString('hex');
    //console.log('privKeyHex', privKeyHex);
    return { addr, privKey: privKeyHex };
}

async function web3_call(methodName, methodArgs) {
    const { web3, ethereumTxChain } = getTestContextWeb3();
    const contractName = process.env.CONTRACT_PREFIX + contractProps[process.env.CONTRACT_TYPE].contractName;
    const contractDb = (await db.GetDeployment(process.env.WEB3_NETWORK_ID, contractName, contractProps[process.env.CONTRACT_TYPE].contractVer)).recordset[0];
    if (!contractDb) throw(Error(`Failed to lookup contract deployment for networkId=${process.env.WEB3_NETWORK_ID}, contractName=${contractName}, contractVer=${contractProps[process.env.CONTRACT_TYPE].contractVer} from ${process.env.sql_server}`));
    if (consoleOutput) console.log(chalk.dim(` > CALL: [${contractDb.contract_enum} ${contractDb.contract_ver} @${contractDb.addr}] ${chalk.reset.blue.bgWhite(methodName + '(' + methodArgs.map(p => JSON.stringify(p)).join() + ')')}` + chalk.dim(` [networkId: ${process.env.WEB3_NETWORK_ID} - ${web3.currentProvider.host}]`)));
    var contract = new web3.eth.Contract(JSON.parse(contractDb.abi), contractDb.addr);
    if ((await contract.methods['version']().call()) != contractDb.contract_ver) throw('Deployed contract missing or version mismatch'); // test contract exists - will silently return null on calls if it's not deployed, wtf
    const callRet = await contract.methods[methodName](...methodArgs).call();
    return callRet;
}

async function web3_tx(methodName, methodArgs, fromAddr, fromPrivKey, returnBeforeConfirmed) {
    const { web3, ethereumTxChain } = getTestContextWeb3();
    const contractName = process.env.CONTRACT_PREFIX + contractProps[process.env.CONTRACT_TYPE].contractName;
    const contractDb = (await db.GetDeployment(process.env.WEB3_NETWORK_ID, process.env.CONTRACT_PREFIX + contractProps[process.env.CONTRACT_TYPE].contractName, contractProps[process.env.CONTRACT_TYPE].contractVer)).recordset[0];
    if (!contractDb) throw(Error(`Failed to lookup contract deployment for networkId=${process.env.WEB3_NETWORK_ID}, contractName=${contractName}, contractVer=${contractProps[process.env.CONTRACT_TYPE].contractVer} from ${process.env.sql_server}`));
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
    const nonce = await web3.eth.getTransactionCount(fromAddr, "pending");
    if (consoleOutput) console.log(chalk.dim(` >   TX: nonce=${nonce} [${contractDb.contract_enum} ${contractDb.contract_ver} @${contractDb.addr}] ${chalk.reset.red.bgWhiteBright(methodName + '(' + methodArgs.map(p => JSON.stringify(p)).join() + ')')}` + chalk.dim(` [networkId: ${process.env.WEB3_NETWORK_ID} - ${web3.currentProvider.host}]`)));
    var paramsData = contract.methods
        [methodName](...methodArgs)
        .encodeABI();
    const txData = {
        nonce: nonce,
     gasPrice: web3.utils.toHex(web3.utils.toWei(WEB3_GWEI_GAS_BID, 'gwei')),
     gasLimit: WEB3_GAS_LIMIT,
         from: fromAddr,
           to: contractDb.addr,
         data: paramsData,
        value: 0
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
            //const receipt = await web3.eth.getTransactionReceipt(txHash);
            const evs = await contract.getPastEvents("allEvents", { fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
            //console.log('receipt', receipt);
            //console.log('evs', evs);
            if (consoleOutput) console.log(chalk.dim.yellow(`   => ${txHash} - ${confirms} confirm(s), receipt.gasUsed=${receipt.gasUsed} receipt.blockNumber=${receipt.blockNumber} evs=${evs.map(p => `B# ${p.blockNumber}: ${p.event}`).join(',')}`));//, JSON.stringify(receipt)));
            // receipt.logs
            // receipt.blockNumber
            // receipt.blockHash
            // receipt.transactionHash
            //console.log('evs', evs.map(p => `B# ${p.blockNumber}: ${p.event}(${JSON.stringify(p.returnValues)})`).join('\n'));
            resolve({ txHash, receipt, evs });
        })
        .once("error", error => {
            if (!_.isEmpty(error.error)) {
                console.log(chalk.gray(`   => ## error`, JSON.stringify(error)));
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
            if (!_.isEmpty(error.error)) {
                console.log(chalk.gray(`   => ## error`, JSON.stringify(error)));
                //console.dir(error);
                reject(error);
            }
        });
    });
    return txPromise;
}