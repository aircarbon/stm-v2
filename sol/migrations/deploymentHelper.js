// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
const _ = require('lodash');
const chalk = require('chalk');
const BN = require('bn.js');
const os = require('os');
const publicIp = require('public-ip');

const CONST = require('../const.js');
const  db  = require('../../orm/build');
const { assert } = require('console');
const Web3 = require('web3');
const web3 = new Web3();

module.exports = {

    Deploy: async (p) => {
        try {
            var ip = "unknown";
            publicIp.v4().then(p => ip = p).catch(e => { console.log("\tWARN: could not get IP - will write 'unknown'"); });
            const hostName = os.hostname();

            const { deployer, artifacts, contractType, custodyType, nameOverride, symbolOverride, git_commit, version, isTest } = p;

            const deployImpl = async(contr, contractName, contractLinkedToProxy, args = []) => {
                try{
                    const deployedContr = await deployer.deploy(contr, ...args);
                    // saving contract to the deployment table in the DB
                    if(!isTest) {
                        await db.SaveContractDeployment({
                            contractName: contractName,
                            networkId: deployer.network_id,
                            addr: deployedContr.address,
                            linkedToAddr: contractLinkedToProxy,
                            txHash: deployedContr.transactionHash,
                            version: version,
                            gitCommit: git_commit,
                            deployerHostName: hostName,
                            ip: ip,
                        });
                    }
                } catch (err) {
                    console.log(`Failed to deploy contract '${contractName}', error:`);
                    console.log(err);
                    process.exit();
                }
            }

            const MNEMONIC = process.env.DEV_MNEMONIC || process.env.PROD_MNEMONIC || require('../DEV_MNEMONIC.js').MNEMONIC;
            const accountAndKeys = [];
            for (let i=0 ; i < CONST.RESERVED_ADDRESSES_COUNT ; i++) {
                accountAndKeys.push(await CONST.getAccountAndKey(i, MNEMONIC))
            }
            const owners = accountAndKeys.map(p => p.addr);

            //const contractType = process.env.CONTRACT_TYPE;
            if (contractType != 'CASHFLOW_BASE' && contractType != 'CASHFLOW_CONTROLLER' && contractType != 'COMMODITY') throw ('Unknown contractType');

            if (custodyType != 'SELF_CUSTODY' && custodyType != 'THIRD_PARTY_CUSTODY') throw ('Unknown custodyType');

            // libs
            const StructLib = artifacts.require('./StructLib.sol');
            const LibMainStorage = artifacts.require('./LibMainStorage.sol');
            const ValidationLib = artifacts.require('./ValidationLib.sol');
            const CcyLib = artifacts.require('./CcyLib.sol');
            const TokenLib = artifacts.require('./TokenLib.sol');
            const LedgerLib = artifacts.require('./LedgerLib.sol');
            const TransferLib = artifacts.require('./TransferLib.sol');
            const TransferLibView = artifacts.require('TransferLibView');
            const SpotFeeLib = artifacts.require('./SpotFeeLib.sol');
            const Erc20Lib = artifacts.require('./Erc20Lib.sol');
            const LoadLib = artifacts.require('./LoadLib.sol');

            // contracts
            const CcyCollateralizableFacet = artifacts.require('./CcyCollateralizableFacet.sol');
            const DataLoadableFacet = artifacts.require('./DataLoadableFacet.sol');
            const DiamondCutFacet = artifacts.require('./DiamondCutFacet.sol');
            const DiamondLoupeFacet = artifacts.require('./DiamondLoupeFacet.sol');
            const OwnedFacet = artifacts.require('./OwnedFacet.sol');
            const StBurnableFacet = artifacts.require('./StBurnableFacet.sol');
            const StErc20Facet = artifacts.require('./StErc20Facet.sol');
            const StFeesFacet = artifacts.require('./StFeesFacet.sol');
            const StLedgerFacet = artifacts.require('./StLedgerFacet.sol');
            const StMasterFacet = artifacts.require('./StMasterFacet.sol');
            const StMintableFacet = artifacts.require('./StMintableFacet.sol');
            const StTransferableFacet = artifacts.require('./StTransferableFacet.sol');
            const DiamondProxy = artifacts.require('./DiamondProxy.sol');

            // deploying DiamondCutFacet
            await deployImpl(DiamondCutFacet, 'DiamondCutFacet');
            
            // deploying DiamondProxy
            await deployImpl(DiamondProxy, 'DiamondProxy', 'this', [owners[0], DiamondCutFacet.address]);
            const diamondProxyAddr = DiamondProxy.address;
            const proxyRegistratable = await DiamondCutFacet.at(diamondProxyAddr);

            const saveFuncToDb = async (funcName, funcSelector, contrAddr, txHash, initAddr, calldata) => {
                try{
                    if(!isTest) {
                        await db.SaveContractFunction({
                            networkId: deployer.network_id,
                            action: "ADD",
                            funcName,
                            funcSelector,
                            contrAddr,
                            linkedToAddr: diamondProxyAddr,
                            txHash,
                            initAddr,
                            calldata,
                            deployerHostName: hostName,
                            ip
                        });
                    }
                } catch (err) {
                    console.log(`Failed to save function '${funcName}' to db, error:`);
                    console.log(err);
                    process.exit();
                }
            }

            // deploying StructLib
            await deployImpl(StructLib, 'StructLib', diamondProxyAddr);
            deployer.link(StructLib, LibMainStorage);
            deployer.link(StructLib, ValidationLib);
            deployer.link(StructLib, CcyLib);
            deployer.link(StructLib, TokenLib);
            deployer.link(StructLib, LedgerLib);
            deployer.link(StructLib, Erc20Lib);
            deployer.link(StructLib, TransferLib);
            deployer.link(StructLib, TransferLibView);
            deployer.link(StructLib, LoadLib);
            deployer.link(StructLib, SpotFeeLib);
            deployer.link(StructLib, CcyCollateralizableFacet);
            deployer.link(StructLib, DataLoadableFacet);
            deployer.link(StructLib, OwnedFacet);
            deployer.link(StructLib, StBurnableFacet);
            deployer.link(StructLib, StErc20Facet);
            deployer.link(StructLib, StFeesFacet);
            deployer.link(StructLib, StLedgerFacet);
            deployer.link(StructLib, StMasterFacet);
            deployer.link(StructLib, StMintableFacet);
            deployer.link(StructLib, StTransferableFacet);

            // deploying LibMainStorage
            await deployImpl(LibMainStorage, 'LibMainStorage', diamondProxyAddr);
            deployer.link(LibMainStorage, CcyCollateralizableFacet);
            deployer.link(LibMainStorage, DataLoadableFacet);
            deployer.link(LibMainStorage, OwnedFacet);
            deployer.link(LibMainStorage, StBurnableFacet);
            deployer.link(LibMainStorage, StErc20Facet);
            deployer.link(LibMainStorage, StFeesFacet);
            deployer.link(LibMainStorage, StLedgerFacet);
            deployer.link(LibMainStorage, StMasterFacet);
            deployer.link(LibMainStorage, StMintableFacet);
            deployer.link(LibMainStorage, StTransferableFacet);
            deployer.link(LibMainStorage, ValidationLib);
            deployer.link(LibMainStorage, Erc20Lib);
            deployer.link(LibMainStorage, TokenLib);
            deployer.link(LibMainStorage, CcyLib);

            // deploying ValidationLib
            await deployImpl(ValidationLib, 'ValidationLib', diamondProxyAddr);
            deployer.link(ValidationLib, CcyCollateralizableFacet);
            deployer.link(ValidationLib, DataLoadableFacet);
            deployer.link(ValidationLib, OwnedFacet);
            deployer.link(ValidationLib, StBurnableFacet);
            deployer.link(ValidationLib, StErc20Facet);
            deployer.link(ValidationLib, StFeesFacet);
            deployer.link(ValidationLib, StLedgerFacet);
            deployer.link(ValidationLib, StMintableFacet);
            deployer.link(ValidationLib, StTransferableFacet);
            deployer.link(ValidationLib, TokenLib);

            // deploying ValidationLib
            await deployImpl(CcyLib, 'CcyLib', diamondProxyAddr);
            deployer.link(CcyLib, CcyCollateralizableFacet);

            // deploying LedgerLib
            await deployImpl(LedgerLib, 'LedgerLib', diamondProxyAddr);
            deployer.link(LedgerLib, StErc20Facet);
            deployer.link(LedgerLib, StLedgerFacet);
            deployer.link(LedgerLib, StMintableFacet);
            deployer.link(LedgerLib, StTransferableFacet);
            deployer.link(LedgerLib, TokenLib);

            // deploying LedgerLib
            await deployImpl(LoadLib, 'LoadLib', diamondProxyAddr);
            deployer.link(LoadLib, DataLoadableFacet);

            // deploying SpotFeeLib
            await deployImpl(SpotFeeLib, 'SpotFeeLib', diamondProxyAddr);
            deployer.link(SpotFeeLib, StFeesFacet);
            deployer.link(SpotFeeLib, StMintableFacet);
            deployer.link(SpotFeeLib, TokenLib);

            // deploying TransferLib
            await deployImpl(TransferLib, 'TransferLib', diamondProxyAddr);
            deployer.link(TransferLib, StErc20Facet);
            deployer.link(TransferLib, StTransferableFacet);
            deployer.link(TransferLib, Erc20Lib);
            deployer.link(TransferLib, TokenLib);

            // deploying TransferLibView
            await deployImpl(TransferLibView, 'TransferLibView', diamondProxyAddr);
            deployer.link(TransferLibView, StTransferableFacet);

            // deploying Erc20Lib
            await deployImpl(Erc20Lib, 'Erc20Lib', diamondProxyAddr);
            deployer.link(Erc20Lib, StErc20Facet);
            deployer.link(Erc20Lib, StTransferableFacet);
            deployer.link(Erc20Lib, DataLoadableFacet);

            // deploying TokenLib
            await deployImpl(TokenLib, 'TokenLib', diamondProxyAddr);
            deployer.link(TokenLib, StBurnableFacet);
            deployer.link(TokenLib, StLedgerFacet);
            deployer.link(TokenLib, StMintableFacet);

            //deploying non-initializable facets
            const nonInitContracts = [
                { name: 'DiamondLoupeFacet', contr: DiamondLoupeFacet },
                { name: 'CcyCollateralizableFacet', contr: CcyCollateralizableFacet },
                { name: 'DataLoadableFacet', contr: DataLoadableFacet },
                { name: 'StBurnableFacet', contr: StBurnableFacet },
                { name: 'StFeesFacet', contr: StFeesFacet },
                { name: 'StLedgerFacet', contr: StLedgerFacet },
                { name: 'StMintableFacet', contr: StMintableFacet },
                { name: 'StTransferableFacet', contr: StTransferableFacet }
            ];

            for(let contract of nonInitContracts) {
                await deployImpl(contract.contr, contract.name, diamondProxyAddr);
            }

            // registering the faucets
            const diamondCutParams = [];

            for(let contract of nonInitContracts) {
                diamondCutParams.push({
                    facetAddress: contract.contr.address,
                    action: CONST.FacetCutAction.Add,
                    functionSelectors: CONST.getContractsSelectors(contract.name)
                });
            }

            let tx = await proxyRegistratable.diamondCut(diamondCutParams, CONST.nullAddr, "0x");

            // recording functions in the database
            for(let contract of nonInitContracts) {
                for(let funcSelector of CONST.getContractsSelectorsWithName(contract.name)) {
                    await saveFuncToDb(funcSelector.name, funcSelector.selector, contract.contr.address, tx.tx);
                }
            }

            // derive primary owner/deployer (&[0]), and a further n more keypairs ("backup owners");
            // (bkp-owners are passed to contract ctor, and have identical permissions to the primary owner)
            if (contractType == 'CASHFLOW_BASE') { // add controller address to base owners list
                const controllerName = process.env.CONTRACT_PREFIX + (CONST.contractProps['CASHFLOW_CONTROLLER'].contractName);
                const baseVer = process.env.CONTRACT_VER || CONST.contractProps[process.env.CONTRACT_TYPE].contractVer;
                controllerContract = (await db.GetDeployment(process.env.WEB3_NETWORK_ID, controllerName, baseVer)).recordset[0];
                if (!controllerContract) {
                    console.log(chalk.bold.red(`Failed to lookup controller contract: networkId=${process.env.WEB3_NETWORK_ID}, contractName=${controllerName}, contractVer=${baseVer} from ${process.env.sql_server}`));
                    process.exit(1);
                }
                owners.push(controllerContract.addr);
            }

            //deploying OwnedFacet
            await deployImpl(OwnedFacet, 'OwnedFacet', diamondProxyAddr);
            
            let abi = CONST.getAbi('OwnedFacet');
            let initFuncAbi = abi.find((func) => func.name === 'init');
            const ownedInitCalldata = web3.eth.abi.encodeFunctionCall(
                initFuncAbi, 
                [
                    owners, 
                    custodyType == 'SELF_CUSTODY' ? CONST.custodyType.SELF_CUSTODY : CONST.custodyType.THIRD_PARTY_CUSTODY
                ]
            );

            tx = await proxyRegistratable.diamondCut([
                {
                    facetAddress: OwnedFacet.address,
                    action: CONST.FacetCutAction.Add,
                    functionSelectors: CONST.getContractsSelectors('OwnedFacet', ['init'])
                }
            ], OwnedFacet.address, ownedInitCalldata);

            // saving function to db
            for(let funcSelector of CONST.getContractsSelectorsWithName('OwnedFacet', ['init'])) {
                await saveFuncToDb(funcSelector.name, funcSelector.selector, OwnedFacet.address, tx.tx, OwnedFacet.address, ownedInitCalldata);
            }

            //deploying StErc20Facet
            await deployImpl(StErc20Facet, 'StErc20Facet', diamondProxyAddr);

            abi = CONST.getAbi('StErc20Facet');
            initFuncAbi = abi.find((func) => func.name === 'init');
            const sterc20InitCalldata = web3.eth.abi.encodeFunctionCall(
                initFuncAbi, 
                [
                    symbolOverride || CONST.contractProps[contractType].contractSymbol,
                    CONST.contractProps[contractType].contractDecimals,
                ]
            );

            tx = await proxyRegistratable.diamondCut([
                {
                    facetAddress: StErc20Facet.address,
                    action: CONST.FacetCutAction.Add,
                    functionSelectors: CONST.getContractsSelectors('StErc20Facet', ['init'])
                }
            ], StErc20Facet.address, sterc20InitCalldata);

            // saving function to db
            for(let funcSelector of CONST.getContractsSelectorsWithName('StErc20Facet', ['init'])) {
                await saveFuncToDb(funcSelector.name, funcSelector.selector, StErc20Facet.address, tx.tx, StErc20Facet.address, sterc20InitCalldata);
            }

            //deploying StMasterFacet
            await deployImpl(StMasterFacet, 'StMasterFacet', diamondProxyAddr);
            const contractName = `${process.env.CONTRACT_PREFIX}${nameOverride || CONST.contractProps[contractType].contractName}`;

            abi = CONST.getAbi('StMasterFacet');
            initFuncAbi = abi.find((func) => func.name === 'init');
            const masterInitCalldata = web3.eth.abi.encodeFunctionCall(
                initFuncAbi, 
                [
                    contractType == 'CASHFLOW_BASE' ? CONST.contractType.CASHFLOW_BASE 
                        : contractType == 'CASHFLOW_CONTROLLER' ? CONST.contractType.CASHFLOW_CONTROLLER : CONST.contractType.COMMODITY,
                    contractName,
                    CONST.contractProps[contractType].contractVer,
                    CONST.contractProps[contractType].contractUnit
                ]
            );

            tx = await proxyRegistratable.diamondCut([
                {
                    facetAddress: StMasterFacet.address,
                    action: CONST.FacetCutAction.Add,
                    functionSelectors: CONST.getContractsSelectors('StMasterFacet', ['init'])
                }
            ], StMasterFacet.address, masterInitCalldata);

            // saving function to db
            for(let funcSelector of CONST.getContractsSelectorsWithName('StMasterFacet', ['init'])) {
                await saveFuncToDb(funcSelector.name, funcSelector.selector, StMasterFacet.address, tx.tx, StMasterFacet.address, masterInitCalldata);
            }

            const stm = proxyRegistratable;

            // get ABI-encoded ctor params (for etherscan contract verification)
            // ## https://github.com/ethereumjs/ethereumjs-abi/issues/69
            //const ejs_abi = require('ethereumjs-abi');
            //var encodedArgs = ejs_abi.encode(stm.abi, "balanceOf(uint256 address)", [ "0x0000000000000000000000000000000000000000" ])
            //console.log('encodedArgs', encodedArgs.toString('hex'));
            // TODO: try https://github.com/Zoltu/ethereum-abi-encoder ...

            if (!deployer.network.includes("-fork")) {
                // save to DB
                console.log(`>>> SAVING DEPLOYMENT: ${contractName} ${CONST.contractProps[contractType].contractVer} to ${process.env.sql_server}`);
                await db.SaveDeployment({
                    contractName: contractName,
                    contractVer: CONST.contractProps[contractType].contractVer,
                    networkId: deployer.network_id,
                    deployedAddress: stm.address,
                    deployerHostName: os.hostname(),
                    deployerIpv4: ip,
                    deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
                    contractType,
                    txHash: DiamondProxy.transactionHash,
                    symbol: symbolOverride || ''
                });

                // log & validate deployment
                logEnv("DEPLOYMENT COMPLETE", owners, contractType, contractName);
                const proxyOwned = await OwnedFacet.at(diamondProxyAddr);

                const contractOwners = await proxyOwned.getOwners();
                if (contractType != 'CASHFLOW_BASE' && contractOwners.length != CONST.RESERVED_ADDRESSES_COUNT) {
                    console.log(chalk.red.bold.inverse(`Deployment failed: unexpected owners data`), contractOwners);
                    process.exit(1);
                } else if (contractType == 'CASHFLOW_BASE' && contractOwners.length != CONST.RESERVED_ADDRESSES_COUNT + 1) {
                    console.log(chalk.red.bold.inverse(`Deployment failed: unexpected owners data`), contractOwners);
                    process.exit(1);
                }
            }

            console.log(`\n✅Summary:\n`);
            console.log(`StructLib: '${StructLib.address}',`);
            console.log(`LibMainStorage: '${LibMainStorage.address}',`);
            console.log(`ValidationLib: '${ValidationLib.address}',`);
            console.log(`CcyLib: '${CcyLib.address}',`);
            console.log(`TokenLib: '${TokenLib.address}',`);
            console.log(`LedgerLib: '${LedgerLib.address}',`);
            console.log(`TransferLib: '${TransferLib.address}',`);
            console.log(`TransferLibView: '${TransferLibView.address}',`);
            console.log(`SpotFeeLib: '${SpotFeeLib.address}',`);
            console.log(`Erc20Lib: '${Erc20Lib.address}',`);
            console.log(`LoadLib: '${LoadLib.address}',`);

            console.log(`CcyCollateralizableFacet: '${CcyCollateralizableFacet.address}',`);
            console.log(`DataLoadableFacet: '${DataLoadableFacet.address}',`);
            console.log(`DiamondCutFacet: '${DiamondCutFacet.address}',`);
            console.log(`DiamondLoupeFacet: '${DiamondLoupeFacet.address}',`);
            console.log(`OwnedFacet: '${OwnedFacet.address}',`);
            console.log(`StBurnableFacet: '${StBurnableFacet.address}',`);
            console.log(`StErc20Facet: '${StErc20Facet.address}',`);
            console.log(`StFeesFacet: '${StFeesFacet.address}',`);
            console.log(`StLedgerFacet: '${StLedgerFacet.address}',`);
            console.log(`StMasterFacet: '${StMasterFacet.address}',`);
            console.log(`StMintableFacet: '${StMintableFacet.address}',`);
            console.log(`StTransferableFacet: '${StTransferableFacet.address}',`);
            console.log('\n');

            console.log(`Proxy entry point (STM): '${stm.address}',`);

            return stm.address;
        } catch(err) { 
            assert
            console.error(err);
        }
    }
};

function logEnv(phase, owners, contractType, contractName) {
    console.log(chalk.black.bgWhite(phase));

    console.log(chalk.red('\t                contractName: '), contractName);
    console.log(chalk.red('\t                contractType: '), contractType);
    console.log(chalk.red('\t process.env.CONTRACT_PREFIX: '), process.env.CONTRACT_PREFIX);
    console.log(chalk.red('\t      process.env.NETWORK_ID: '), process.env.NETWORK_ID);
    console.log(chalk.red('\t                      owners: '), owners);

}
