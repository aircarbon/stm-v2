const CONST = require('../const.js');
const  db  = require('../../orm/build');

module.exports = async function (deployer) {
    const stmAddr = process.env.stmAddr || '0xbfF80759BfCf6eF0cbc5fb740f132AEEeCeC0e5D';
    // const stmAddr = process.env.stmAddr || '0x9b197e9FbB891Ef0484439581aA8430983405F90';
    // const stmAddr = process.env.stmAddr || '0xDF1d7cCCcEF0E7B1F70D46CC503F2bBdc6e16f8a';
    console.log(`Starting updating ABI for contract ${stmAddr}`);

    await db.UpdateABI({
        deployedAddress: stmAddr,
        deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
    });

    console.log('Done.');
    process.exit();
};
