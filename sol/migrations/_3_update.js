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
const web3 = new Web3();

const  db  = require('../../orm/build');

const deployments = {
    LibMainStorage_addr: "0x00966284eAe04623bA4459aF9798f0b8C9fcB851",
    StructLib_addr: "0x8fc8810a56F9Bdb2fC44E25C7580055B69Cf22D9",
    ValidationLib_addr: "0x8Ce6Bd995D83495a8f8f4e6DaB855ca2856ef561",
    TransferLib_addr: "0xEC59282623A120D8b5c8e1BaCABA3e734bCb7B3C",
    TransferLibView_addr: "0xC64aD0c682450b924111c6FBf5Ad7Cb896C878d2",
    SpotFeeLib_addr: "0xdA43e5B40a8B42b2C30E44fd4caEEc7cd09413b3",
    LoadLib_addr: "0x5114bB766858e0f14cD94Bb93712A3312aE2Cc26",
    StFeesFacet_addr: "0xfba1fc72a8EBfA0Aaf3f43D29dA8cF558Ed76d14",
    Erc20Lib_addr: "0x59CebB662422226DD3F2dA0a0E3e1DCffD76A475",
    LedgerLib_addr: "0x9020Ca55873D29bb1DeCF4841E2D3059cE1604b8",
    StErc20Facet_addr: "0x854e492DA6c9E642170335bEC9113daab7f2E2C4",
    DataLoadableFacet_addr: "0xdB8dd60515F0211a1995D0CB1a7545C57B00FB1E",
    TokenLib_addr: "0xA0ab84b0426368eC505BB8ab220D46f245162bBF",
    StLedgerFacet_addr: "0xeEa7e1ef5f77A9CE43acA45D534046DB87175433",
    StTransferableFacet_addr: "0xFAcaa238DFb30046Ec6859CD7c36e76E1C061B23",
    CcyLib_addr: "0x2B7510842cbf973f14e9909a27e935FC95fE6a30",
    CcyCollateralizableFacet_addr: "0xd64736c80F6358AFe05edBC788C8F167a3A05ae2",
    StMintableFacet_addr: "0xCFB4EE03CE7864BdDe5595fE4C50918e7e957e1a",
    StBurnableFacet_addr: "0xD5F365396dD2a421eEfFf006B3d96D49be2B50b5"
}

const deployOrGetDeployed = async(deployer, addr, contract) => {
    if(addr) {
        return contract.at(addr);
    }
    return deployer.deploy(contract);
}

module.exports = async function (deployer) {
    console.log('3_update: ', deployer.network);

    // const stm = await DiamondCutFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    const stm = await DiamondCutFacet.at('0x9b197e9FbB891Ef0484439581aA8430983405F90');
    
    // const stmLoupe = await DiamondLoupeFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');
    // console.log(await stmLoupe.facets());

    console.log('\nDeploying new Facets and registering them...');

    // deploying new LibMainStorage
    const LibMainStorage_c = await deployOrGetDeployed(deployer, deployments.LibMainStorage_addr, LibMainStorage);
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
    deployer.link(StructLib_c, TransferLibView);
    deployer.link(StructLib_c, TransferLib);
    deployer.link(StructLib_c, CcyLib);
    deployer.link(StructLib_c, CcyCollateralizableFacet);
    deployer.link(StructLib_c, StMintableFacet);
    deployer.link(StructLib_c, StBurnableFacet);

    // deploying new CcyLib
    const CcyLib_c = await deployOrGetDeployed(deployer, deployments.CcyLib_addr, CcyLib);
    console.log(chalk.green.bold(`CcyLib_addr: "${CcyLib_c.address}",`));
    deployer.link(CcyLib_c, CcyCollateralizableFacet);

    // deploygin new ValidationLib
    const ValidationLib_c = await deployOrGetDeployed(deployer, deployments.ValidationLib_addr, ValidationLib);
    console.log(chalk.green.bold(`ValidationLib_addr: "${ValidationLib_c.address}",`));
    deployer.link(ValidationLib_c, StFeesFacet);
    deployer.link(ValidationLib_c, StErc20Facet);
    deployer.link(ValidationLib_c, DataLoadableFacet);
    deployer.link(ValidationLib_c, StLedgerFacet);
    deployer.link(ValidationLib_c, StTransferableFacet);
    deployer.link(ValidationLib_c, CcyCollateralizableFacet);
    deployer.link(ValidationLib_c, StMintableFacet);
    deployer.link(ValidationLib_c, StBurnableFacet);

    // deploying new CcyCollateralizableFacet
    const CcyCollateralizableFacet_c  = await deployOrGetDeployed(deployer, deployments.CcyCollateralizableFacet_addr, CcyCollateralizableFacet);
    console.log(chalk.green.bold(`CcyCollateralizableFacet_addr: "${CcyCollateralizableFacet_c.address}",`));

    // deploygin new TransferLib
    const TransferLib_c = await deployOrGetDeployed(deployer, deployments.TransferLib_addr, TransferLib);
    console.log(chalk.green.bold(`TransferLib_addr: "${TransferLib_c.address}",`));
    deployer.link(TransferLib_c, Erc20Lib);
    deployer.link(TransferLib_c, StErc20Facet);
    deployer.link(TransferLib_c, StTransferableFacet);

    // deploygin new TransferLibView
    const TransferLibView_c = await deployOrGetDeployed(deployer, deployments.TransferLibView_addr, TransferLibView);
    console.log(chalk.green.bold(`TransferLibView_addr: "${TransferLibView_c.address}",`));
    deployer.link(TransferLibView_c, StTransferableFacet);

    // deploygin new SpotFeeLib
    const SpotFeeLib_c = await deployOrGetDeployed(deployer, deployments.SpotFeeLib_addr, SpotFeeLib);
    console.log(chalk.green.bold(`SpotFeeLib_addr: "${SpotFeeLib_c.address}",`));
    deployer.link(SpotFeeLib_c, StFeesFacet);  
    deployer.link(SpotFeeLib_c, TokenLib);  
    deployer.link(SpotFeeLib_c, StMintableFacet);  
    
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
    deployer.link(LedgerLib_c, StMintableFacet);

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
    deployer.link(TokenLib_c, StMintableFacet);
    deployer.link(TokenLib_c, StBurnableFacet);

    // deploying new StLedgerFacet
    const StLedgerFacet_c = await deployOrGetDeployed(deployer, deployments.StLedgerFacet_addr, StLedgerFacet);
    console.log(chalk.green.bold(`StLedgerFacet_addr: "${StLedgerFacet_c.address}",`));

    // deploying new StTransferableFacet
    const StTransferableFacet_c = await deployOrGetDeployed(deployer, deployments.StTransferableFacet_addr, StTransferableFacet);
    console.log(chalk.green.bold(`StTransferableFacet_addr: "${StTransferableFacet_c.address}",`));

    // deploying new StMintableFacet
    const StMintableFacet_c = await deployOrGetDeployed(deployer, deployments.StMintableFacet_addr, StMintableFacet);
    console.log(chalk.green.bold(`StMintableFacet_addr: "${StMintableFacet_c.address}",`));

    // deploying new StBurnableFacet
    const StBurnableFacet_c = await deployOrGetDeployed(deployer, deployments.StBurnableFacet_addr, StBurnableFacet);
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
            facetAddress: StMintableFacet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StMintableFacet', ['mintSecTokenBatch'])
        },
        {
            facetAddress: StBurnableFacet_c.address,
            action: CONST.FacetCutAction.Replace,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StBurnableFacet', ['burnTokens'])
        },
        {
            facetAddress: StMintableFacet_c.address,
            action: CONST.FacetCutAction.Add,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StMintableFacet', ['mintSecTokenBatchCustomFee'])
        },
        {
            facetAddress: StBurnableFacet_c.address,
            action: CONST.FacetCutAction.Add,
            functionSelectors: CONST.getContractsSelectorsWithFuncName('StBurnableFacet', ['burnTokensCustomFee'])
        },
    ], CONST.nullAddr, "0x");

    console.log('Done.');

    process.exit();
};
