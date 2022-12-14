// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

const BN = require('bn.js');
const CONST = require('./const.js');
const chalk = require('chalk');

module.exports = {

    //
    // Initializes the latest deployed contract with default values (currencies, spot token-types, and global commodity exchange fee)
    // (web3 version)
    //
    setDefaults: async (p) => {
        const nameOverride = p ? p.nameOverride : undefined;
        console.log(chalk.inverse('devSetupContract >> setDefaults...'));
        console.group();
        const O = await CONST.getAccountAndKey(0);

        console.log(chalk.gray(`custody type : ${await CONST.web3_call('custodyType', [], nameOverride)}`));

        if ((await CONST.web3_call('getContractType', [], nameOverride)) == CONST.contractType.COMMODITY) {
            console.log(chalk.italic('devSetupContract >> commodity contract...'));

            // add spot types
            const spotTypes = (await CONST.web3_call('getSecTokenTypes', [], nameOverride)).tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT);
            //console.log('spotTypes', spotTypes.map(p => { return { id: p.id, name: p.name } }));
            await addSecTokenIfNotPresent(spotTypes, 'CET', O, nameOverride); // AirCarbon CORSIA Eligible Token
            await addSecTokenIfNotPresent(spotTypes, 'ANT', O, nameOverride); // AirCarbon Nature Token
            await addSecTokenIfNotPresent(spotTypes, 'GPT', O, nameOverride); // AirCarbon Premium Token

            // add ccy types
            const ccyTypes = (await CONST.web3_call('getCcyTypes', [], nameOverride)).ccyTypes;
            //console.log('ccyTypes', ccyTypes.map(p => { return { id: p.id, name: p.name } }));
            await addCcyIfNotPresent(ccyTypes, 'USD', 'cents', 2, O, nameOverride);
            await addCcyIfNotPresent(ccyTypes, 'ETH', 'Wei', 18, O, nameOverride);
            await addCcyIfNotPresent(ccyTypes, 'BTC', 'Satoshi', 8, O, nameOverride);

            // creating entity
            const LOCAL_ENTITY_ID = 4;
            if(!await CONST.web3_call('entityExists', [LOCAL_ENTITY_ID], nameOverride)) {
                await CONST.web3_tx('createEntity', [ {id: LOCAL_ENTITY_ID, addr: CONST.testAddr99} ], O.addr, O.privKey, nameOverride);
            }

            const usdFee = (await CONST.web3_call('getFee', [CONST.getFeeType.CCY, LOCAL_ENTITY_ID, CONST.ccyType.USD, CONST.nullAddr], nameOverride, undefined/*addrOverride*/, O.addr));
            if (usdFee.ccy_perMillion.toString() != '300') {
                try {
                    await CONST.web3_tx('setFee_CcyType', [ LOCAL_ENTITY_ID, CONST.ccyType.USD, CONST.nullAddr, {...CONST.nullFees, ccy_perMillion: 300, ccy_mirrorFee: true, fee_min: 300 } ], O.addr, O.privKey);
                } catch (error) {
                    console.log(chalk.red(`setFee_CcyType >> ${error}`));
                }
            } else console.log(chalk.gray(`exchange fee already set for USD; nop.`));

            // create owner ledger entry
            const ownerLedger = (await CONST.web3_call('getLedgerEntry', [O.addr], nameOverride));
            if (!ownerLedger.exists) {
                try {
                    await CONST.web3_tx('whitelistMany', [[O.addr]], O.addr, O.privKey);
                    await CONST.web3_tx('setAccountEntity', [ { id: LOCAL_ENTITY_ID, addr: O.addr }], O.addr, O.privKey);
                    await CONST.web3_tx('fundOrWithdraw', [ CONST.fundWithdrawType.FUND, CONST.ccyType.USD, 0, O.addr, 'DEV_INIT' ], O.addr, O.privKey);
                } catch (error) {
                    console.log(chalk.red(`fundOrWithdraw >> ${error}`));
                }
            } else console.log(chalk.gray(`owner ledger already set; nop.`));
        }
        else if (await CONST.web3_call('getContractType', [], nameOverride) == CONST.contractType.CASHFLOW_BASE) {
            console.log(chalk.italic('devSetupContract >> base cashflow contract...'));

            // base cashflow - unitype
            const spotTypes = (await CONST.web3_call('getSecTokenTypes', [], nameOverride)).tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT);
            await addSecTokenIfNotPresent(spotTypes, 'UNI_TOKEN', O, nameOverride);
            // if (spotTypes.length == 0) {
            //     await CONST.web3_tx('addSecTokenType', [ 'UNI_TOKEN',  CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr ], O.addr, O.privKey, nameOverride);
            // }

            // base cashflow - does not track collateral, i.e. no ccy types at all
            ;

            // create owner ledger entry
            const ownerLedger = (await CONST.web3_call('getLedgerEntry', [O.addr], nameOverride));
            if (!ownerLedger.exists) {
                await CONST.web3_tx('setFee_TokType', [ LOCAL_ENTITY_ID, O.addr, CONST.nullFees ], O.addr, O.privKey, nameOverride);
            }
        }
        else if (await CONST.web3_call('getContractType', [], nameOverride) == CONST.contractType.CASHFLOW_CONTROLLER) {
            console.log(chalk.italic('devSetupContract >> cashflow controller contract...'));

            // cashflow controller - aggregates/exposes linked base cashflows as token-types - no direct token-types

            // cashflow controller - holds ledger collateral, so ccy types only here
            const ccyTypes = (await CONST.web3_call('getCcyTypes', [], nameOverride)).ccyTypes;
            await addCcyIfNotPresent(ccyTypes, 'USD', 'cents', 2, O, nameOverride);
            await addCcyIfNotPresent(ccyTypes, 'ETH', 'Wei', 18, O, nameOverride);
            // await addCcyIfNotPresent(ccyTypes, 'HKD', 'cents', 2, O, nameOverride);
            await addCcyIfNotPresent(ccyTypes, 'BTC', 'Satoshi', 8, O, nameOverride);

            // create owner ledger entry
            const ownerLedger = (await CONST.web3_call('getLedgerEntry', [O.addr], nameOverride));
            if (!ownerLedger.exists) {
                await CONST.web3_tx('setFee_CcyType', [ LOCAL_ENTITY_ID, CONST.ccyType.USD, O.addr, CONST.nullFees ], O.addr, O.privKey, nameOverride);
            }
        }

        console.groupEnd();
        console.log(chalk.inverse('devSetupContract >> DONE'));
    },
};

async function addSecTokenIfNotPresent(spotTypes, name, O, nameOverride) {
    if (!spotTypes.some(p => p.name == name)) {
        try {
            await CONST.web3_tx(
                'addSecTokenTypeBatch',
                [
                    [
                        {
                            name: name,
                            settlementType: CONST.settlementType.SPOT,
                            ft: CONST.nullFutureArgs,
                            cashflowBaseAddr: CONST.nullAddr
                        }
                    ]
                ],
                O.addr,
                O.privKey, nameOverride);
        } catch (error) {
            console.log(chalk.red(`addSecTokenIfNotPresent >> ${error}`));
        }
    }
    else console.log(chalk.gray(`${name} already present; nop.`));
}
async function addCcyIfNotPresent(ccyTypes, name, unit, decimals, O, nameOverride) {
    if (!ccyTypes.some(p => p.name == name)) {
        try {
            await CONST.web3_tx('addCcyType', [ name, unit, decimals ], O.addr, O.privKey, nameOverride);
        } catch (error) {
            console.log(chalk.red(`addCcyIfNotPresent >> ${error}`));
        }
    } else console.log(chalk.gray(`${name} already present; nop.`));
}
