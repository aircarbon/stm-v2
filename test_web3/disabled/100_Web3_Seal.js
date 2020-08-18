const assert = require('assert');
//const acmJson = require('../build/contracts/StMaster.json');
//const abi = acmJson['abi'];
const EthereumJsTx = require('ethereumjs-tx');
const BN = require('bn.js');
const { db } = require('../../utils-server/dist');

const CONST = require('../const.js');
process.env.WEB3_NETWORK_ID = Number(process.env.NETWORK_ID || 888);

const OWNER_NDX = 0;
var OWNER, OWNER_privKey;

describe(`Contract Web3 Interface`, async () => {

    //
    //           Local: ("export INSTANCE_ID=local && mocha test_web3 --timeout 10000000 --exit")
    //         AWS Dev: ("export INSTANCE_ID=DEV && export CONTRACT_TYPE=COMMODITY && mocha test_web3 --timeout 10000000 --exit")
    //         AWS UAT: ("export INSTANCE_ID=UAT && export CONTRACT_TYPE=COMMODITY && mocha test_web3 --timeout 10000000 --exit")
    //

    it(`web3 direct - seal`, async () => {
        var x;
        x = await CONST.getAccountAndKey(OWNER_NDX);
        OWNER = x.addr; OWNER_privKey = x.privKey;
        const sealTx = await CONST.web3_tx('sealContract', [], OWNER, OWNER_privKey);
    });
});

