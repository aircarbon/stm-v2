const _ = require('lodash');
const chalk = require('chalk');
const BN = require('bn.js');
const os = require('os');
const publicIp = require('public-ip');

const CONST = require('../const.js');
const { db } = require('../../common/dist');

module.exports = {

    Deploy: async (p) => {
        const { deployer, artifacts, contractType } = p; 
        var stmAddr;
        //const contractType = process.env.CONTRACT_TYPE;
        if (contractType != "CASHFLOW" && contractType != "CASHFLOW_CONTROLLER" && contractType != "COMMODITY") throw ('Unknown contractType');

        const StructLib = artifacts.require('../Interfaces/StructLib.sol');
        const CcyLib = artifacts.require('./CcyLib.sol');
        const TokenLib = artifacts.require('./TokenLib.sol');
        const LedgerLib = artifacts.require('./LedgerLib.sol');
        const TransferLib = artifacts.require('./TransferLib.sol');
        const SpotFeeLib = artifacts.require('./SpotFeeLib.sol');
        const Erc20Lib = artifacts.require('./Erc20Lib.sol');
        const LoadLib = artifacts.require('./LoadLib.sol');
        const PayableLib = artifacts.require('./PayableLib.sol');
        const FuturesLib = artifacts.require('./FuturesLib.sol');
        const StMaster = artifacts.require('./StMaster.sol');

        // deploy
        StMaster.synchronization_timeout = 42; // secs
        await deployer.deploy(StructLib).then(async structLib => { 
            deployer.link(StructLib, CcyLib);
            deployer.link(StructLib, TokenLib);
            deployer.link(StructLib, LedgerLib);
            deployer.link(StructLib, TransferLib);
            deployer.link(StructLib, SpotFeeLib);
            deployer.link(StructLib, FuturesLib);

            deployer.link(StructLib, StMaster);

        await deployer.deploy(LedgerLib).then(async ledgerLib => { 
            deployer.link(LedgerLib, StMaster);

        await deployer.deploy(CcyLib).then(async ccyLib => {
            deployer.link(CcyLib, StMaster);

        await deployer.deploy(TokenLib).then(async tokenLib => { 
            deployer.link(TokenLib, StMaster);

        await deployer.deploy(TransferLib).then(async transferLib => { 
            deployer.link(TransferLib, Erc20Lib);
            deployer.link(TransferLib, PayableLib);

            deployer.link(TransferLib, StMaster);
        
        await deployer.deploy(SpotFeeLib).then(async feeLib => { 
            deployer.link(SpotFeeLib, StMaster);

        await deployer.deploy(Erc20Lib).then(async feeLib => { 
            deployer.link(Erc20Lib, StMaster);

        await deployer.deploy(LoadLib).then(async loadLib => { 
            deployer.link(LoadLib, StMaster);

        await deployer.deploy(PayableLib).then(async payableLib => { 
            deployer.link(PayableLib, StMaster);

        await deployer.deploy(FuturesLib).then(async futuresLib => { 
            deployer.link(FuturesLib, StMaster);
            //console.log('cashflowArgs', CONST.contractProps[type].cashflowArgs);
            
            //return 
            const contractName = `${process.env.CONTRACT_PREFIX}${CONST.contractProps[contractType].contractName}`;
            stmAddr = await deployer.deploy(StMaster,
                contractType == "CASHFLOW"            ? CONST.contractType.CASHFLOW :
                contractType == "CASHFLOW_CONTROLLER" ? CONST.contractType.CASHFLOW_CONTROLLER :
                                                        CONST.contractType.COMMODITY,
                CONST.contractProps[contractType].cashflowArgs,
                contractName,
                CONST.contractProps[contractType].contractVer,
                CONST.contractProps[contractType].contractUnit,
                CONST.contractProps[contractType].contractSymbol,
                CONST.contractProps[contractType].contractDecimals,
                //CONST.chainlinkAggregators[process.env.NETWORK_ID].btcUsd,    // 24k
                CONST.chainlinkAggregators[process.env.NETWORK_ID].ethUsd
            ).then(async stm => {
                //console.dir(stm);
                //console.dir(stm.abi);
                //console.dir(deployer);

                // get ABI-encoded ctor params (for etherscan contract verification)
                // ## https://github.com/ethereumjs/ethereumjs-abi/issues/69
                //const ejs_abi = require('ethereumjs-abi');
                //var encodedArgs = ejs_abi.encode(stm.abi, "balanceOf(uint256 address)", [ "0x0000000000000000000000000000000000000000" ])
                //console.log('encodedArgs', encodedArgs.toString('hex'));
                // TODO: try https://github.com/Zoltu/ethereum-abi-encoder ...

                const MNEMONIC = require('../DEV_MNEMONIC.js').MNEMONIC;
                const accountAndKey = await CONST.getAccountAndKey(0, MNEMONIC);
                const OWNER = accountAndKey.addr;
                const OWNER_privKey = accountAndKey.privKey;
                // TODO: derive - an encryption key & salt [from contract name?] -> derivation code should be in a private repo (AWS lambda?)
                // TODO: encrypt - privKey & display encrypted [for manual population of AWS secret, L1]
                logEnv("DEPLOYMENT COMPLETE", OWNER, OWNER_privKey, contractType);

                // save to DB
                if (!deployer.network.includes("-fork")) {
                    var ip = "unknown";
                    publicIp.v4().then(p => ip = p).catch(e => { console.log("\tWARN: could not get IP - will write 'unknown'"); });

                    console.log(`>>> SAVING DEPLOYMENT: ${contractName} ${CONST.contractProps[contractType].contractVer} to ${process.env.sql_server}`);
                    await db.SaveDeployment({
                        contractName: contractName,
                         contractVer: CONST.contractProps[contractType].contractVer,
                           networkId: deployer.network_id,
                     deployedAddress: stm.address,
                    deployerHostName: os.hostname(),
                        deployerIpv4: ip,
                         deployedAbi: JSON.stringify(stm.abi),
                        contractType,
                    });
                }
                // if (ok) {
                //     ok(stm.address);
                // }
                return stm.address;
            }).catch(err => { console.error('failed deployment: StMaster', err); });
        }).catch(err => { console.error('failed deployment: FuturesLib', err); });
        }).catch(err => { console.error('failed deployment: PayableLib', err); });
        }).catch(err => { console.error('failed deployment: DataLib', err); });
        }).catch(err => { console.error('failed deployment: Erc20Lib', err); });
        }).catch(err => { console.error('failed deployment: SpotFeeLib', err); });
        }).catch(err => { console.error('failed deployment: TransferLib', err); });
        }).catch(err => { console.error('failed deployment: TokenLib', err); });
        }).catch(err => { console.error('failed deployment: CcyLib', err); }); 
        }).catch(err => { console.error('failed deployment: LedgerLib', err); });
        }).catch(err => { console.error('failed deployment: StructLib', err); });
        return stmAddr;
    }
};

function logEnv(phase, owner, ownerPrivKey, contractType) {
    console.log(chalk.black.bgWhite(phase));
    console.log(chalk.red('\t                contractType: '), contractType);
    console.log(chalk.red('\t process.env.CONTRACT_PREFIX: '), process.env.CONTRACT_PREFIX);
    console.log(chalk.red('\t      process.env.NETWORK_ID: '), process.env.NETWORK_ID);
    console.log(chalk.red('\t                       owner: '), owner);
    console.log(chalk.red('\t                ownerPrivKey: '), ownerPrivKey);
}
