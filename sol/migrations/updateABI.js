const CONST = require('../const.js');
const  db  = require('../../orm/build');
const fs = require('fs');

module.exports = async function (deployer) {
    const stmAddr = process.env.STM_ADDRESS;
    if (!stmAddr) throw new Error('STM_ADDRESS is required');
    console.log(`Starting updating ABI for contract ${stmAddr}`);

    // await db.UpdateABI({
    //     deployedAddress: stmAddr,
    //     deployedAbi: JSON.stringify(CONST.generateContractTotalAbi()),
    // });

    fs.writeFile("abi-test.json", JSON.stringify(CONST.generateContractTotalAbi()), (err) => {
        if (err) {
          console.error('Error writing file:', err);

          console.log('Done.');
          process.exit();
        } else {
          console.log('File saved successfully');

          console.log('Done.');
          process.exit();
        }
      });

    
};
