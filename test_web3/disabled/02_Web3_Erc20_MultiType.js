const assert = require('assert');
//const acmJson = require('../build/contracts/StMaster.json');
//const abi = acmJson['abi'];
const EthereumJsTx = require('ethereumjs-tx');
const BN = require('bn.js');
const { db } = require('../../common/dist');
require('dotenv').config();

const CONST = require('../const.js');

const OWNER_NDX = 0;
const WHITE_NDX = 1;
const GRAY_1_NDX = 800;
const GRAY_2_NDX = 801;
var OWNER, OWNER_privKey;
var WHITE, WHITE_privKey;
var GRAY_1, GRAY_1_privKey;
var GRAY_2, GRAY_2_privKey;

const SCOOP_TESTNETS_1 = "0x8443b1edf203f96d1a5ec98301cfebc4d3cf2b20";
const SCOOP_TESTNETS_2 = "0xe4f1925fba6cbf65c81dc8d25163c899f14cd6c1";

const SCOOP_DOM10_1 = "0xd183d12ced4accb265b0eda55b3526c7cb102485";
const SCOOP_DOM10_2 = "0x23fa93bcabb452a9964d5b49777f2462bb632587";

describe(`Contract Web3 Interface`, async () => {

    //
    // can run these to test web3 more quickly, e.g.
    //         Dev: ("export WEB3_NETWORK_ID=888 && export CONTRACT_TYPE=COMMODITY && mocha test_web3 --timeout 120000 --exit")
    //  Ropsten AC: ("export WEB3_NETWORK_ID=3 && export CONTRACT_TYPE=COMMODITY && mocha test_web3 --timeout 120000 --exit")
    //

    before(async function () {
        const contractType = await CONST.web3_call('getContractType', []);
        console.log('contractType: ', contractType);
        if (contractType == CONST.contractType.CASHFLOW) this.skip(); // cashflow: only supports single type

        var x;
        x = await CONST.getAccountAndKey(OWNER_NDX);
        OWNER = x.addr; OWNER_privKey = x.privKey;

        x = await CONST.getAccountAndKey(WHITE_NDX);
        WHITE = x.addr; WHITE_privKey = x.privKey;

        x = await CONST.getAccountAndKey(GRAY_1_NDX);
        GRAY_1 = x.addr; GRAY_1_privKey = x.privKey;

        x = await CONST.getAccountAndKey(GRAY_2_NDX);
        GRAY_2 = x.addr; GRAY_2_privKey = x.privKey;

        // setup - whitelist A, mint two types for A, transferOrTrade all A -> GRAY_1
        try {
            const whitelistTx = await CONST.web3_tx('whitelist', [ WHITE ], OWNER, OWNER_privKey);
        } catch(ex) {
            // swallow - ropsten doesn't include the revert msg
            //if (ex.toString().includes("Already whitelisted")) console.log('(already whitelisted - nop)');
            //else throw(ex);
        }
        const sealTx = await CONST.web3_tx('sealContract', [], OWNER, OWNER_privKey);

        // setup - mint for A
        //for (var i=0 ; i < 10 ; i++) {
            const mintTx_type1 = await CONST.web3_tx('mintSecTokenBatch', [
                CONST.tokenType.VCS,       100000, 1,      WHITE, CONST.nullFees, [], [],
            ], OWNER, OWNER_privKey);

            const mintTx_type2 = await CONST.web3_tx('mintSecTokenBatch', [
                CONST.tokenType.UNFCCC,    100000, 1,      WHITE, CONST.nullFees, [], [],
            ], OWNER, OWNER_privKey);

            // setup - transferOrTrade type 1: A -> GRAY_1
            const transferTradeTx_1 = await CONST.web3_tx('transferOrTrade', [ {
                    ledger_A: WHITE,                               ledger_B: GRAY_1,
                       qty_A: 100000,                         tokenTypeId_A: CONST.tokenType.VCS,
                       qty_B: 0,                              tokenTypeId_B: 0,
                ccy_amount_A: 0,                                ccyTypeId_A: 0,
                ccy_amount_B: 0,                                ccyTypeId_B: 0,
                   applyFees: false,
                feeAddrOwner: CONST.nullAddr
            }], OWNER, OWNER_privKey);

            // setup - transferOrTrade type 2: A -> GRAY_1
            const transferTradeTx_2 = await CONST.web3_tx('transferOrTrade', [ {
                    ledger_A: WHITE,                               ledger_B: GRAY_1,
                       qty_A: 100000,                         tokenTypeId_A: CONST.tokenType.UNFCCC,
                       qty_B: 0,                              tokenTypeId_B: 0,
                ccy_amount_A: 0,                                ccyTypeId_A: 0,
                ccy_amount_B: 0,                                ccyTypeId_B: 0,
                   applyFees: false,
                feeAddrOwner: CONST.nullAddr
            }], OWNER, OWNER_privKey);
        //}

        // setup - fund GRAY_1 eth
        const fundTx = await CONST.web3_sendEthTestAddr(0, GRAY_1_NDX, "0.1");
    });

    it(`web3 direct - erc20 - should be able to send multiple token types from graylist addr to external wallet (erc20 => erc20)`, async () => {
        const erc20 = await CONST.web3_tx('transfer', [ SCOOP_DOM10_1, "200000" ], GRAY_1, GRAY_1_privKey);
    });
});

  