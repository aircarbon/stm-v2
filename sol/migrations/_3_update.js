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
    LibMainStorage_addr: "0x108240A41a777A2338b76aA14D84Ae0DaB065778",
    StructLib_addr: "0x43c9E54Cda6de70672C791c73e4202202294C867",
    ValidationLib_addr: "0x7931215a8CeBeB644B1EFefC46A7acDAAdED1036",
    TransferLib_addr: "0x78158e63D50b3cB6A49F1b5dc2c33b05883cc323",
    TransferLibView_addr: "0x1cE1b9A5c3Df8894ACe22c696f375222c58B1a86",
    SpotFeeLib_addr: "0x49ef2260846FDb95cDf94E989e57C473b81A07Ab",
    LoadLib_addr: "0xC6aCbad4bD1F45da88B1a33d03521304083CFd70",
    StFeesFacet_addr: "0x9E3c7d167D3B9cDd0a93677C6b5cB03b4f8ab4D4",
    Erc20Lib_addr: "0xC1eEB44312e21114Af1c4af57Ecbdb2F194A414e",
    LedgerLib_addr: "0x9c111764502F612591615eD5E54936dFb0d3D01B",
    StErc20Facet_addr: "0xA4023124b9634537ba12C0978f7236c679830e13",
    DataLoadableFacet_addr: "0x11D13B6451a426295Af06Fa253CE94815919D808",
    TokenLib_addr: "0xe32177846078CD2F1DBE11E07Cf7C335CA01E30c",
    StLedgerFacet_addr: "0xce89c6dd73204C9Db0181c7a4e50cC77022a9989",
    StTransferableFacet_addr: "0x52164324bd557aA56e618e94de989984a5bE67b9",
    CcyLib_addr: "0xdEdD38980747395d74Bb6Dfdab2e50d3cc0Ba085",
    CcyCollateralizableFacet_addr: "0xCD6577EaB39CE9c8CdB5C6Eed5626882f9C801E3",
    StMintableFacet_addr: "0x37591D8d5dbd7b29B08795B7C6CEb90667aA0422",
    StBurnableFacet_addr: "0x3Af5aDC186C73a554947D532f19544611CcD5300",
    DiamondCutFacet_addr: "0x013B843F9962540320Bc0ac006d465443b13D8e6",
    DiamondLoupeFacet_addr: "0xa7Ec35a73573A8a545eA593226509A0BE08780e6",
    OwnedFacet_addr: "0x262D794bfD726ceAD135f8d980E6Ab5Dc083425C",
    StMasterFacet_addr: "0x800baf3b79F1B3661fFb0fD940Ce81169973adC7",
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
    // const stm = await DiamondCutFacet.at('0x9b197e9FbB891Ef0484439581aA8430983405F90');
    // const stm = await DiamondCutFacet.at('0x4Dba44Bbd8A7D940C2453B6686fB435C469e64E4');
    const stm = await DiamondCutFacet.at('0x48Ef17AaB4a38EcA1dDB8333Ae995b8703bDb187');
    
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
    deployer.link(ValidationLib_c, TokenLib);

    // deploying new CcyCollateralizableFacet
    const CcyCollateralizableFacet_c  = await deployOrGetDeployed(deployer, deployments.CcyCollateralizableFacet_addr, CcyCollateralizableFacet);
    console.log(chalk.green.bold(`CcyCollateralizableFacet_addr: "${CcyCollateralizableFacet_c.address}",`));

    // deploygin new TransferLib
    const TransferLib_c = await deployOrGetDeployed(deployer, deployments.TransferLib_addr, TransferLib);
    console.log(chalk.green.bold(`TransferLib_addr: "${TransferLib_c.address}",`));
    deployer.link(TransferLib_c, Erc20Lib);
    deployer.link(TransferLib_c, StErc20Facet);
    deployer.link(TransferLib_c, StTransferableFacet);
    deployer.link(TransferLib_c, TransferLib);

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
    deployer.link(LedgerLib_c, TokenLib);

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
