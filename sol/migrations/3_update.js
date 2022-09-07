const DiamondLoupeFacet = artifacts.require('DiamondLoupeFacet');
const DiamondCutFacet = artifacts.require('DiamondCutFacet');

const CONST = require('../const.js');

// Example of how an existing smart contract can be updated
module.exports = async function (deployer) {
    console.log('3_update: ', deployer.network);

    // deploying new contracts
    const currSTM = await DiamondCutFacet.at('0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D');

    await deployer.deploy(DiamondLoupeFacet);
    console.log(`New deployment: ${DiamondLoupeFacet.address}`);

    // registering it in our existing STM that is already deployed
    await currSTM.diamondCut(
        [
            {
                facetAddress: DiamondLoupeFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('DiamondLoupeFacet')
            }, 
        ],
        CONST.nullAddr, 
        "0x"
    );

    console.log('Success, done.');
    
};
