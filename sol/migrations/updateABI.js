const CONST = require('../const.js');
const  db  = require('../../orm/build');

module.exports = async function (deployer) {
    const stmAddr = process.env.stmAddr || '0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D';
    console.log(`Starting updating ABI for contract ${stmAddr}`);

    await db.UpdateABI({
        deployedAddress: stmAddr,
        deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
    });

    console.log('Done.');
    process.exit();
};
