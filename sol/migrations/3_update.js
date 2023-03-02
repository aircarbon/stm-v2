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

const CONST = require('../const.js');
const chalk = require('chalk');

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
    'DiamondCutFacet',
    'DiamondLoupeFacet',
    'OwnedFacet',
    'StMasterFacet',
];

// here specify names of smart contracts (that are affected by changes) that will be deployed
const contractsToBeRedeployed = [

];

// here specify function names and respective implementation contracts that should be updated
const upgradeParams = [

];

const getLatestContrAddr = async(networkId, contrName, linkedToAddr) => {
    return db.GetFacetByName(networkId, contrName, linkedToAddr);
}

// Rules before upgrading:
// 1. All changes in smart contracts should be committed to github
// 2. You cannot skip upgrades (e.g. if you at first made some changes in smart contracts ("change_1"), then made other changes("change_2"), 
//    you need to upgrade smart contract with "change_1" at first, and only then upgrade it with "change_2". Cannot skip "change_1" or make 
//    "change_2" at first and "change_1" later). Because the script will pick up latest smart contracts from the database.

// SPECIFY PARAMS HERE
module.exports = async function (deployer) {
    if(process.env.UPGRADE !== 'true') {
        return;
    }

    console.log('3_update: ', deployer.network);
    const version = process.env.VERSION;
    const gitCommit = process.env.GIT_COMMIT;
    const scAddr = process.env.SC;

    if (!version) {
        console.log(chalk.red.bold.inverse(`process.env.VERSION not provided.`));
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
    console.log(chalk.red('process.env.VERSION'.padEnd(30, '.')), version);
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
            const contr = deployer.deploy(contract);
    
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
    
            return contr;
        }
        return contract.at(deployedContrAddr[contractName]);
    }

    // const stmLoupe = await DiamondLoupeFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    // console.log(await stmLoupe.facets());

    console.log('\nDeploying new Facets and registering them...');

    // deploying new LibMainStorage
    const LibMainStorage_c = await deployOrGetDeployed('LibMainStorage', LibMainStorage);
    console.log(chalk.green.bold(`LibMainStorage_addr: "${LibMainStorage_c.address}",`));
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

    // deploying new StructLib (because don't have address of an old one)
    const StructLib_c = await deployOrGetDeployed('StructLib', StructLib);
    console.log(chalk.green.bold(`StructLib_addr: "${StructLib_c.address}",`));
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

    // deploying new CcyLib
    const CcyLib_c = await deployOrGetDeployed('CcyLib', CcyLib);
    console.log(chalk.green.bold(`CcyLib_addr: "${CcyLib_c.address}",`));
    deployer.link(CcyLib_c, CcyCollateralizableFacet);

    // deploygin new ValidationLib
    const ValidationLib_c = await deployOrGetDeployed('ValidationLib', ValidationLib);
    console.log(chalk.green.bold(`ValidationLib_addr: "${ValidationLib_c.address}",`));
    deployer.link(ValidationLib_c, StFeesFacet);
    deployer.link(ValidationLib_c, StErc20Facet);
    deployer.link(ValidationLib_c, DataLoadableFacet);
    deployer.link(ValidationLib_c, StLedgerFacet);
    deployer.link(ValidationLib_c, StTransferableFacet);
    deployer.link(ValidationLib_c, CcyCollateralizableFacet);
    deployer.link(ValidationLib_c, StMintableFacet);
    deployer.link(ValidationLib_c, StBurnableFacet);
    deployer.link(ValidationLib_c, TokenLib);

    // deploying new CcyCollateralizableFacet
    const CcyCollateralizableFacet_c  = await deployOrGetDeployed('CcyCollateralizableFacet', CcyCollateralizableFacet);
    console.log(chalk.green.bold(`CcyCollateralizableFacet_addr: "${CcyCollateralizableFacet_c.address}",`));

    // deploygin new TransferLib
    const TransferLib_c = await deployOrGetDeployed('TransferLib', TransferLib);
    console.log(chalk.green.bold(`TransferLib_addr: "${TransferLib_c.address}",`));
    deployer.link(TransferLib_c, Erc20Lib);
    deployer.link(TransferLib_c, StErc20Facet);
    deployer.link(TransferLib_c, StTransferableFacet);
    deployer.link(TransferLib_c, TransferLib);

    // deploygin new TransferLibView
    const TransferLibView_c = await deployOrGetDeployed('TransferLibView', TransferLibView);
    console.log(chalk.green.bold(`TransferLibView_addr: "${TransferLibView_c.address}",`));
    deployer.link(TransferLibView_c, StTransferableFacet);

    // deploygin new SpotFeeLib
    const SpotFeeLib_c = await deployOrGetDeployed('SpotFeeLib', SpotFeeLib);
    console.log(chalk.green.bold(`SpotFeeLib_addr: "${SpotFeeLib_c.address}",`));
    deployer.link(SpotFeeLib_c, StFeesFacet);  
    deployer.link(SpotFeeLib_c, TokenLib);  
    deployer.link(SpotFeeLib_c, StMintableFacet);  
    
    // deploygin new LoadLib
    const LoadLib_c = await deployOrGetDeployed('LoadLib', LoadLib);
    console.log(chalk.green.bold(`LoadLib_addr: "${LoadLib_c.address}",`));
    deployer.link(LoadLib_c, DataLoadableFacet);    

    // deploying new StFeesFacet
    const StFeesFacet_c = await deployOrGetDeployed('StFeesFacet', StFeesFacet);
    console.log(chalk.green.bold(`StFeesFacet_addr: "${StFeesFacet_c.address}",`));

    // depoying new Erc20Lib
    const Erc20Lib_c = await deployOrGetDeployed('Erc20Lib', Erc20Lib);
    console.log(chalk.green.bold(`Erc20Lib_addr: "${Erc20Lib_c.address}",`));
    deployer.link(Erc20Lib_c, StErc20Facet);
    deployer.link(Erc20Lib_c, DataLoadableFacet);
    
    // depoying new LedgerLib
    const LedgerLib_c = await deployOrGetDeployed('LedgerLib', LedgerLib);
    console.log(chalk.green.bold(`LedgerLib_addr: "${LedgerLib_c.address}",`));
    deployer.link(LedgerLib_c, StErc20Facet);
    deployer.link(LedgerLib_c, StLedgerFacet);
    deployer.link(LedgerLib_c, StTransferableFacet);
    deployer.link(LedgerLib_c, StMintableFacet);
    deployer.link(LedgerLib_c, TokenLib);

    // deploying new StErc20Facets
    const StErc20Facet_c = await deployOrGetDeployed('StErc20Facet', StErc20Facet);
    console.log(chalk.green.bold(`StErc20Facet_addr: "${StErc20Facet_c.address}",`));
    deployer.link(StErc20Facet_c, DataLoadableFacet);

    // depoying new DataLoadableFacet
    const DataLoadableFacet_c = await deployOrGetDeployed('DataLoadableFacet', DataLoadableFacet);
    console.log(chalk.green.bold(`DataLoadableFacet_addr: "${DataLoadableFacet_c.address}",`));

    // depoying new Erc20Lib
    const TokenLib_c = await deployOrGetDeployed('TokenLib', TokenLib);
    console.log(chalk.green.bold(`TokenLib_addr: "${TokenLib_c.address}",`));
    deployer.link(TokenLib_c, StLedgerFacet);
    deployer.link(TokenLib_c, StMintableFacet);
    deployer.link(TokenLib_c, StBurnableFacet);

    // deploying new StLedgerFacet
    const StLedgerFacet_c = await deployOrGetDeployed('StLedgerFacet', StLedgerFacet);
    console.log(chalk.green.bold(`StLedgerFacet_addr: "${StLedgerFacet_c.address}",`));

    // deploying new StTransferableFacet
    const StTransferableFacet_c = await deployOrGetDeployed('StTransferableFacet', StTransferableFacet);
    console.log(chalk.green.bold(`StTransferableFacet_addr: "${StTransferableFacet_c.address}",`));

    // deploying new StMintableFacet
    const StMintableFacet_c = await deployOrGetDeployed('StMintableFacet', StMintableFacet);
    console.log(chalk.green.bold(`StMintableFacet_addr: "${StMintableFacet_c.address}",`));

    // deploying new StBurnableFacet
    const StBurnableFacet_c = await deployOrGetDeployed('StBurnableFacet', StBurnableFacet);
    console.log(chalk.green.bold(`StBurnableFacet_addr: "${StBurnableFacet_c.address}",`));







    // registering the Facet
    console.log('Cutting 1...');
    await stm.diamondCut([
        // {
        //     facetAddress: CONST.nullAddr,
        //     action: CONST.FacetCutAction.Remove,
        //     functionSelectors: CONST.getContractsSelectorsWithFuncName('StTransferableFacet', ['transferOrTrade', 'transfer_feePreview', 'transfer_feePreview_ExchangeOnly'])
        // },

        {
            facetAddress: StTransferableFacet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName(
                'StTransferableFacet', 
                [
                    'getLedgerHashcode', 
                    'transfer_feePreview_ExchangeOnly', 
                    'transfer_feePreview', 
                    'transferOrTrade', 
                    'transferOrTradeCustomFee', 
                    'transferOrTradeBatch', 
                    'transferOrTradeBatchCustomFee'
                ]
            )
        },
        {
            facetAddress: StErc20Facet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StErc20Facet', ['transfer', 'transferFrom'])
        },
        {
            facetAddress: StFeesFacet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StFeesFacet', ['setFee_CcyType', 'setFee_CcyTypeBatch', 'setFee_TokType', 'setFee_TokTypeBatch'])
        },
    ], CONST.nullAddr, "0x");

    console.log('Done.');

    process.exit();
};
