const LibMainStorage = artifacts.require('LibMainStorage');
const SpotFeeLib = artifacts.require('SpotFeeLib');
const StFeesFacet = artifacts.require('StFeesFacet');
const ValidationLib = artifacts.require('ValidationLib');
const TransferLib = artifacts.require('TransferLib');
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
const DiamondLoupeFacet = artifacts.require('DiamondLoupeFacet');

const CONST = require('../const.js');
const chalk = require('chalk');

const Web3 = require('web3');
const web3 = new Web3();

const  db  = require('../../orm/build');

const deployments = {
    LibMainStorage_addr: "0x2de592F086692Ea2d662Ed9eFC5E27D83972C27c",
    StructLib_addr: "0xE0765b5A3062778A38d0963353CFCf3fd9307e4C",
    ValidationLib_addr: "0x8Ce6Bd995D83495a8f8f4e6DaB855ca2856ef561",
    TransferLib_addr: "0x2Bb920aB1cD98Cf0F3D54393237BD6b65D31465D",
    SpotFeeLib_addr: "0xdA43e5B40a8B42b2C30E44fd4caEEc7cd09413b3",
    LoadLib_addr: "0x5114bB766858e0f14cD94Bb93712A3312aE2Cc26",
    StFeesFacet_addr: "0x6e0F251224ae09853478039e45eD96a48C1a2E74",
    Erc20Lib_addr: "0x2d3d7C94B56a318aAEFB0D752B2F53289353c871",
    LedgerLib_addr: "0x9020Ca55873D29bb1DeCF4841E2D3059cE1604b8",
    StErc20Facet_addr: "0x49E9961D9057c3a8f2cF1B6240c5b6075E63eD9c",
    DataLoadableFacet_addr: "0xdB8dd60515F0211a1995D0CB1a7545C57B00FB1E",
    TokenLib_addr: "0x936F25BaB9362EB468f9aFFF285Def326b08B919",
    StLedgerFacet_addr: "0xeEa7e1ef5f77A9CE43acA45D534046DB87175433",
    StTransferableFacet_addr: "0x27279B4cBFd62e6498933ca23BB5be2347b82250",
}

const deployOrGetDeployed = async(deployer, addr, contract) => {
    if(addr) {
        return contract.at(addr);
    }
    return deployer.deploy(contract);
}

module.exports = async function (deployer) {
    console.log('3_update: ', deployer.network);

    const stm = await DiamondCutFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    const stmLoupe = await DiamondLoupeFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');

    // console.log(await stmLoupe.facets());

    console.log('\nDeploying new Facets and registering them...');

    // deploying new LibMainStorage
    const LibMainStorage_c = await deployOrGetDeployed(deployer, deployments.LibMainStorage_addr, LibMainStorage);
    console.log(chalk.green.bold(`LibMainStorage_addr: "${LibMainStorage_c.address}",`));
    deployer.link(LibMainStorage_c, StFeesFacet);
    deployer.link(LibMainStorage_c, ValidationLib);
    deployer.link(LibMainStorage_c, LibMainStorage);
    deployer.link(LibMainStorage_c, TransferLib);
    deployer.link(LibMainStorage_c, Erc20Lib);
    deployer.link(LibMainStorage_c, StErc20Facet);
    deployer.link(LibMainStorage_c, StLedgerFacet);
    deployer.link(LibMainStorage_c, StTransferableFacet);
    deployer.link(LibMainStorage_c, DataLoadableFacet);

    // deploying new StructLib (because don't have address of an old one)
    const StructLib_c = await deployOrGetDeployed(deployer, deployments.StructLib_addr, StructLib);
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
    deployer.link(StructLib_c, TransferLib);

    // deploygin new ValidationLib
    const ValidationLib_c = await deployOrGetDeployed(deployer, deployments.ValidationLib_addr, ValidationLib);
    console.log(chalk.green.bold(`ValidationLib_addr: "${ValidationLib_c.address}",`));
    deployer.link(ValidationLib_c, StFeesFacet);
    deployer.link(ValidationLib_c, StErc20Facet);
    deployer.link(ValidationLib_c, DataLoadableFacet);
    deployer.link(ValidationLib_c, StLedgerFacet);
    deployer.link(ValidationLib_c, StTransferableFacet);
    
    // deploygin new ValidationLib
    const TransferLib_c = await deployOrGetDeployed(deployer, deployments.TransferLib_addr, TransferLib);
    console.log(chalk.green.bold(`TransferLib_addr: "${TransferLib_c.address}",`));
    deployer.link(TransferLib_c, Erc20Lib);
    deployer.link(TransferLib_c, StErc20Facet);
    deployer.link(TransferLib_c, StTransferableFacet);

    // deploygin new SpotFeeLib
    const SpotFeeLib_c = await deployOrGetDeployed(deployer, deployments.SpotFeeLib_addr, SpotFeeLib);
    console.log(chalk.green.bold(`SpotFeeLib_addr: "${SpotFeeLib_c.address}",`));
    deployer.link(SpotFeeLib_c, StFeesFacet);  
    deployer.link(SpotFeeLib_c, TokenLib);  
    
    // deploygin new LoadLib
    const LoadLib_c = await deployOrGetDeployed(deployer, deployments.LoadLib_addr, LoadLib);
    console.log(chalk.green.bold(`LoadLib_addr: "${LoadLib_c.address}",`));
    deployer.link(LoadLib_c, DataLoadableFacet);    

    // deploying new StFeesFacet
    const StFeesFacet_c = await deployOrGetDeployed(deployer, deployments.StFeesFacet_addr, StFeesFacet);
    console.log(chalk.green.bold(`StFeesFacet_addr: "${StFeesFacet_c.address}",`));

    // depoying new Erc20Lib
    const Erc20Lib_c = await deployOrGetDeployed(deployer, deployments.Erc20Lib_addr, Erc20Lib);
    console.log(chalk.green.bold(`Erc20Lib_addr: "${Erc20Lib_c.address}",`));
    deployer.link(Erc20Lib_c, StErc20Facet);
    deployer.link(Erc20Lib_c, DataLoadableFacet);
    
    // depoying new LedgerLib
    const LedgerLib_c = await deployOrGetDeployed(deployer, deployments.LedgerLib_addr, LedgerLib);
    console.log(chalk.green.bold(`LedgerLib_addr: "${LedgerLib_c.address}",`));
    deployer.link(LedgerLib_c, StErc20Facet);
    deployer.link(LedgerLib_c, StLedgerFacet);
    deployer.link(LedgerLib_c, StTransferableFacet);

    // deploying new StErc20Facets
    const StErc20Facet_c = await deployOrGetDeployed(deployer, deployments.StErc20Facet_addr, StErc20Facet);
    console.log(chalk.green.bold(`StErc20Facet_addr: "${StErc20Facet_c.address}",`));
    deployer.link(StErc20Facet_c, DataLoadableFacet);

    // depoying new DataLoadableFacet
    const DataLoadableFacet_c = await deployOrGetDeployed(deployer, deployments.DataLoadableFacet_addr, DataLoadableFacet);
    console.log(chalk.green.bold(`DataLoadableFacet_addr: "${DataLoadableFacet_c.address}",`));

    // depoying new Erc20Lib
    const TokenLib_c = await deployOrGetDeployed(deployer, deployments.TokenLib_addr, TokenLib);
    console.log(chalk.green.bold(`TokenLib_addr: "${TokenLib_c.address}",`));
    deployer.link(TokenLib_c, StLedgerFacet);

    // deploying new StLedgerFacet
    const StLedgerFacet_c = await deployOrGetDeployed(deployer, deployments.StLedgerFacet_addr, StLedgerFacet);
    console.log(chalk.green.bold(`StLedgerFacet_addr: "${StLedgerFacet_c.address}",`));

    // deploying new StTransferableFacet
    const StTransferableFacet_c = await deployOrGetDeployed(deployer, deployments.StTransferableFacet_addr, StTransferableFacet);
    console.log(chalk.green.bold(`StTransferableFacet_addr: "${StTransferableFacet_c.address}",`));

    // registering the Facet
    console.log('Cutting 1...');
    await stm.diamondCut([
        {
            facetAddress: CONST.nullAddr,
            action: CONST.FacetCutAction.Remove,
            functionSelectors: CONST.getContractsSelectorsWithFuncName(
                'StErc20Facet', 
                ['createOrUpdateEntity', 'createOrUpdateEntityBatch', 'setEntityBatch', 'setEntity', 'getEntities']
            )
        },
        {
            facetAddress: StErc20Facet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StErc20Facet', ['getEntityFeeOwner'])
        },
        {
            facetAddress: StErc20Facet_c.address,
            action: CONST.FacetCutAction.Add,
            functionSelectors: CONST.getContractsSelectorsWithFuncName(
                'StErc20Facet', 
                [
                    'createEntity', 
                    'createEntityBatch', 
                    'updateEntity', 
                    'updateEntityBatch', 
                    'setAccountEntity', 
                    'setAccountEntityBatch', 
                    'getAllEntities', 
                    'getAllEntitiesWithFeeOwners',
                ]
            )
        },
        {
            facetAddress: DataLoadableFacet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('DataLoadableFacet', ['createLedgerEntryBatch', 'createLedgerEntry'])
        },

        {
            facetAddress: CONST.nullAddr,
            action: CONST.FacetCutAction.Remove,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StLedgerFacet',  ['getEntityBatch', 'getEntity'])
        },
        {
            facetAddress: StLedgerFacet_c.address,
            action: CONST.FacetCutAction.Add,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StLedgerFacet', ['getAccountEntity', 'getAccountEntityBatch'])
        },
    ], CONST.nullAddr, "0x");

    console.log('Done.');
};