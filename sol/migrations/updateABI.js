const CONST = require('../const.js');
const  db  = require('../../orm/build');

module.exports = async function (deployer) {
    console.log(`Starting updating ABI for contract ${process.env.stmAddr}`);

    await db.UpdateABI({
        deployedAddress: process.env.stmAddr,
        deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
    });

    console.log('Done.');
};
