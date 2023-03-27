const LibMainStorage = artifacts.require('LibMainStorage');
const SpotFeeLib = artifacts.require('SpotFeeLib');
const StFeesFacet = artifacts.require('StFeesFacet');
const ValidationLib = artifacts.require('ValidationLib');
const TransferLib = artifacts.require('TransferLib');
const TransferLibView = artifacts.require('TransferLibView');
const DiamondCutFacet = artifacts.require('DiamondCutFacet');
const StructLib = artifacts.require('StructLib');
const Erc20Lib = artifacts.require('Erc20Lib');
const LedgerLib = artifacts.require('LedgerLib');
const StErc20Facet = artifacts.require('StErc20Facet');
const DataLoadableFacet = artifacts.require('DataLoadableFacet');
const LoadLib = artifacts.require('LoadLib');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const TokenLib = artifacts.require('TokenLib');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const CcyLib = artifacts.require('CcyLib');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StMintableFacet = artifacts.require('StMintableFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');
const DiamondLoupeFacet = artifacts.require('DiamondLoupeFacet');
const StMasterFacet = artifacts.require('StMasterFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const CONST = require('../const.js');
const chalk = require('chalk');
const publicIp = require('public-ip');
const os = require('os');
const Web3 = require('web3');

const  db  = require('../../orm/build');

const allContractsNames = [
    'LibMainStorage',
    'StructLib',
    'ValidationLib',
    'TransferLib',
    'TransferLibView',
    'SpotFeeLib',
    'LoadLib',
    'StFeesFacet',
    'Erc20Lib',
    'LedgerLib',
    'StErc20Facet',
    'DataLoadableFacet',
    'TokenLib',
    'StLedgerFacet',
    'StTransferableFacet',
    'CcyLib',
    'CcyCollateralizableFacet',
    'StMintableFacet',
    'StBurnableFacet',
    // 'DiamondCutFacet', // this smart contract is not supposed to be changed
    'DiamondLoupeFacet',
    'OwnedFacet',
    'StMasterFacet',
];

// here specify names of smart contracts (that are affected by changes) that will be deployed
const contractsToBeRedeployed = [
    // 'Erc20Lib',
    // 'StErc20Facet',
    // 'TransferLib',
    'StTransferableFacet',
];

// here specify function names and respective implementation contracts that should be updated
const upgradeParams = [
    // {
    //     action: CONST.FacetCutAction.Remove,
    //     contractName: 'StTransferableFacet',
    //     funcs: [
    //         'transferOrTradeCustomFee',
    //         'transferOrTradeBatchCustomFee',
    //     ],
    //     // If we want to remove functions, then we should provide selectors for those functions in addition to their names
    //     funcSelectors: [
    //         '0x62b50094',
    //         '0xc142bdcf',
    //     ]
    // },

    {
        action: CONST.FacetCutAction.Add,
        contractName: 'StTransferableFacet',
        funcs: [
            'recordBilateralTrade',
            'confirmBilateralTrade',
            'cancelBilateralTrade',
        ],
    },
    // {
    //     action: CONST.FacetCutAction.Replace,
    //     contractName: 'StTransferableFacet',
    //     funcs: [
    //         'transferOrTrade',
    //         'transferOrTradeBatch',
    //     ],
    // },
    // {
    //     action: CONST.FacetCutAction.Replace,
    //     contractName: 'StErc20Facet',
    //     funcs: [
    //         'transferFrom',
    //         'transfer',
    //     ],
    // },
];

const getLatestContrAddr = async(networkId, contrName, linkedToAddr) => {
    return db.GetFacetByName(networkId, contrName, linkedToAddr);
}

// Rules before upgrading:
// 1. All changes in smart contracts should be committed to github
// 2. You cannot skip upgrades (e.g. if you at first made some changes in smart contracts ("change_1"), then made other changes("change_2"), 
//    you need to upgrade smart contract with "change_1" at first, and only then upgrade it with "change_2". Cannot skip "change_1" or make 
//    "change_2" at first and "change_1" later). Because the script will pick up latest smart contracts from the database.
// 3. truffle version in package should be updated. For all other use cases we should use truffle v "^5.1.22", but for upgrade we need to use latest version

// SPECIFY PARAMS HERE
module.exports = async function (deployer) {
    if(process.env.UPGRADE !== 'true') {
        return;
    }

    console.log('3_update: ', deployer.network);

    if(contractsToBeRedeployed.length === 0 && upgradeParams.length === 0) {
        console.log('Nothing to upgrade.');
        return;
    }

    const version = process.env.CONTRACT_VERSION;
    const gitCommit = process.env.GIT_COMMIT;
    const scAddr = process.env.SC;

    if (!version) {
        console.log(chalk.red.bold.inverse(`process.env.CONTRACT_VERSION not provided.`));
        process.exit(1);
    }
    if (!gitCommit) {
        console.log(chalk.red.bold.inverse(`process.env.GIT_COMMIT not provided.`));
        process.exit(1);
    }
    if(!scAddr) {
        console.log(chalk.red.bold.inverse(`Bad process.env.SC, cannot upgrade.`));
        process.exit(1);
    }
    console.log(chalk.red('process.env.CONTRACT_VERSION'.padEnd(30, '.')), version);
    console.log(chalk.red('process.env.GIT_COMMIT'.padEnd(30, '.')), gitCommit);
    console.log(chalk.red('process.env.scAddr'.padEnd(30, '.')), scAddr);

    let ip = "unknown";
    publicIp.v4().then(p => ip = p).catch(e => { console.log("\tWARN: could not get IP - will write 'unknown'"); });
    const hostName = os.hostname();
    const stm = await DiamondCutFacet.at(scAddr);

    const deployedContrAddr = {};
    for(let contrName of allContractsNames) {
        const result = await getLatestContrAddr(deployer.network_id, contrName, scAddr);
        deployedContrAddr[contrName] = result?.recordset[0]?.addr;
        if(!deployedContrAddr[contrName] && !contractsToBeRedeployed.includes(contrName)) {
            console.log(chalk.red.bold.inverse(`Cannot find contract '${contrName}' linked to proxy '${scAddr}' for network '${deployer.network_id}' in DB.`));
            process.exit(1);
        }
    }

    const deployOrGetDeployed = async(contractName, contract) => {
        if(contractsToBeRedeployed.includes(contractName)) {
            console.log(`Deploygin '${contractName}' ...`);
            const contr = await deployer.deploy(contract);
    
            await db.SaveContractDeployment({
                contractName: contractName,
                networkId: deployer.network_id,
                addr: contr.address,
                linkedToAddr: scAddr,
                txHash: contr.transactionHash,
                version: version,
                gitCommit: gitCommit,
                deployerHostName: hostName,
                ip: ip,
            });
            
            deployedContrAddr[contractName] = contr.address;
            return contr;
        }
        return contract.at(deployedContrAddr[contractName]);
    }

    const stmLoupe = await deployOrGetDeployed('DiamondLoupeFacet', DiamondLoupeFacet);
    // console.log(await stmLoupe.facets());

    console.log('\nDeploying new Facets and registering them...');

    // deploying new LibMainStorage
    const LibMainStorage_c = await deployOrGetDeployed('LibMainStorage', LibMainStorage);
    deployer.link(LibMainStorage_c, StFeesFacet);
    deployer.link(LibMainStorage_c, ValidationLib);
    deployer.link(LibMainStorage_c, LibMainStorage);
    deployer.link(LibMainStorage_c, TransferLib);
    deployer.link(LibMainStorage_c, TransferLibView);
    deployer.link(LibMainStorage_c, Erc20Lib);
    deployer.link(LibMainStorage_c, StErc20Facet);
    deployer.link(LibMainStorage_c, StLedgerFacet);
    deployer.link(LibMainStorage_c, StTransferableFacet);
    deployer.link(LibMainStorage_c, DataLoadableFacet);
    deployer.link(LibMainStorage_c, CcyLib);
    deployer.link(LibMainStorage_c, CcyCollateralizableFacet);
    deployer.link(LibMainStorage_c, TokenLib);
    deployer.link(LibMainStorage_c, StMintableFacet);
    deployer.link(LibMainStorage_c, StBurnableFacet);
    deployer.link(LibMainStorage_c, OwnedFacet);
    deployer.link(LibMainStorage_c, StMasterFacet);

    // deploying new StructLib (because don't have address of an old one)
    const StructLib_c = await deployOrGetDeployed('StructLib', StructLib);
    deployer.link(StructLib_c, StFeesFacet);
    deployer.link(StructLib_c, SpotFeeLib);
    deployer.link(StructLib_c, Erc20Lib);
    deployer.link(StructLib_c, LedgerLib);
    deployer.link(StructLib_c, StErc20Facet);
    deployer.link(StructLib_c, LoadLib);
    deployer.link(StructLib_c, ValidationLib);
    deployer.link(StructLib_c, StLedgerFacet);
    deployer.link(StructLib_c, TokenLib);
    deployer.link(StructLib_c, StTransferableFacet);
    deployer.link(StructLib_c, TransferLibView);
    deployer.link(StructLib_c, TransferLib);
    deployer.link(StructLib_c, CcyLib);
    deployer.link(StructLib_c, CcyCollateralizableFacet);
    deployer.link(StructLib_c, StMintableFacet);
    deployer.link(StructLib_c, StBurnableFacet);
    deployer.link(StructLib_c, OwnedFacet);
    deployer.link(StructLib_c, StMasterFacet);

    // deploying new StMasterFacet
    await deployOrGetDeployed('StMasterFacet', StMasterFacet);

    // deploying new CcyLib
    const CcyLib_c = await deployOrGetDeployed('CcyLib', CcyLib);
    deployer.link(CcyLib_c, CcyCollateralizableFacet);

    // deploygin new ValidationLib
    const ValidationLib_c = await deployOrGetDeployed('ValidationLib', ValidationLib);
    deployer.link(ValidationLib_c, StFeesFacet);
    deployer.link(ValidationLib_c, StErc20Facet);
    deployer.link(ValidationLib_c, DataLoadableFacet);
    deployer.link(ValidationLib_c, StLedgerFacet);
    deployer.link(ValidationLib_c, StTransferableFacet);
    deployer.link(ValidationLib_c, CcyCollateralizableFacet);
    deployer.link(ValidationLib_c, StMintableFacet);
    deployer.link(ValidationLib_c, StBurnableFacet);
    deployer.link(ValidationLib_c, TokenLib);
    deployer.link(ValidationLib_c, OwnedFacet);

    // deploygin new OwnedFacet
    await deployOrGetDeployed('OwnedFacet', OwnedFacet);

    // deploying new CcyCollateralizableFacet
    await deployOrGetDeployed('CcyCollateralizableFacet', CcyCollateralizableFacet);

    // deploygin new TransferLib
    const TransferLib_c = await deployOrGetDeployed('TransferLib', TransferLib);
    deployer.link(TransferLib_c, Erc20Lib);
    deployer.link(TransferLib_c, StErc20Facet);
    deployer.link(TransferLib_c, StTransferableFacet);
    deployer.link(TransferLib_c, TokenLib);

    // deploygin new TransferLibView
    const TransferLibView_c = await deployOrGetDeployed('TransferLibView', TransferLibView);
    deployer.link(TransferLibView_c, StTransferableFacet);

    // deploygin new SpotFeeLib
    const SpotFeeLib_c = await deployOrGetDeployed('SpotFeeLib', SpotFeeLib);
    deployer.link(SpotFeeLib_c, StFeesFacet);  
    deployer.link(SpotFeeLib_c, TokenLib);  
    deployer.link(SpotFeeLib_c, StMintableFacet);  
    
    // deploygin new LoadLib
    const LoadLib_c = await deployOrGetDeployed('LoadLib', LoadLib);
    deployer.link(LoadLib_c, DataLoadableFacet);    

    // deploying new StFeesFacet
    await deployOrGetDeployed('StFeesFacet', StFeesFacet);

    // depoying new Erc20Lib
    const Erc20Lib_c = await deployOrGetDeployed('Erc20Lib', Erc20Lib);
    deployer.link(Erc20Lib_c, StErc20Facet);
    deployer.link(Erc20Lib_c, DataLoadableFacet);
    
    // depoying new LedgerLib
    const LedgerLib_c = await deployOrGetDeployed('LedgerLib', LedgerLib);
    deployer.link(LedgerLib_c, StErc20Facet);
    deployer.link(LedgerLib_c, StLedgerFacet);
    deployer.link(LedgerLib_c, StTransferableFacet);
    deployer.link(LedgerLib_c, StMintableFacet);
    deployer.link(LedgerLib_c, TokenLib);

    // deploying new StErc20Facets
    const StErc20Facet_c = await deployOrGetDeployed('StErc20Facet', StErc20Facet);
    deployer.link(StErc20Facet_c, DataLoadableFacet);

    // depoying new DataLoadableFacet
    await deployOrGetDeployed('DataLoadableFacet', DataLoadableFacet);

    // depoying new TokenLib
    const TokenLib_c = await deployOrGetDeployed('TokenLib', TokenLib);
    deployer.link(TokenLib_c, StLedgerFacet);
    deployer.link(TokenLib_c, StMintableFacet);
    deployer.link(TokenLib_c, StBurnableFacet);

    // deploying new StLedgerFacet
    await deployOrGetDeployed('StLedgerFacet', StLedgerFacet);

    // deploying new StTransferableFacet
    await deployOrGetDeployed('StTransferableFacet', StTransferableFacet);

    // deploying new StMintableFacet
    await deployOrGetDeployed('StMintableFacet', StMintableFacet);

    // deploying new StBurnableFacet
    await deployOrGetDeployed('StBurnableFacet', StBurnableFacet);

    // preparing params
    const allParams = {
        params: [],
        initAddr: CONST.nullAddr,
        calldata: "0x"
    };

    for(let param of upgradeParams) {
        allParams.params.push(
            {
                facetAddress: param.action === CONST.FacetCutAction.Remove ? CONST.nullAddr : deployedContrAddr[param.contractName],
                action: param.action,
                functionSelectors: param.action === CONST.FacetCutAction.Remove ? param.funcSelectors : CONST.getContractsSelectorsWithFuncName(param.contractName, param.funcs)
            }
        );
    }
    // registering the Facet
    console.log('Cutting diamond...');
    const tx = await stm.diamondCut(allParams.params, allParams.initAddr, allParams.calldata);

    // registering functions in the database
    for(let i = 0; i < allParams.params.length; i++) {
        const param = allParams.params[i];
        for(let j = 0; j < param.functionSelectors.length; j++) {
            await db.SaveContractFunction({
                networkId: deployer.network_id,
                action: param.action === CONST.FacetCutAction.Add ? 'ADD' : param.action === CONST.FacetCutAction.Replace ? 'REPLACE' : param.action === CONST.FacetCutAction.Remove ? 'REMOVE' : 'UNKNOWN',
                funcName: upgradeParams[i].funcs[j],
                funcSelector: param.functionSelectors[j],
                contrAddr: param.facetAddress,
                linkedToAddr: scAddr,
                txHash: tx.tx,
                initAddr: allParams.initAddr,
                calldata: allParams.calldata,
                deployerHostName: hostName,
                ip
            });
        }
    }

    console.log('Done.');

    const stmMaster = await StMasterFacet.at(scAddr);
    const currVer = await stmMaster.version();

    if(currVer !== version) {
        console.log(`Current version: '${currVer}'.`);
        console.log(`Updating to version '${version}' ...`);

        const stmErc20 = await StErc20Facet.at(scAddr);
        await stmErc20.setVersion(version);
    } else {
        console.log(`Version remains the same: '${currVer}'`);
    }

    // update version on DB
    await db.UpdateContractVersion({
        networkId: deployer.network_id,
        addr: scAddr,
        newVersion: version
    });

    console.log(`Starting updating ABI for contract ${scAddr}`);

    await db.UpdateABI({
        deployedAddress: scAddr,
        deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
    });

    console.log('✅ Done all, exiting script.');
    process.exit();
};
