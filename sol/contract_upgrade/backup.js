// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const argv = require('yargs-parser')(process.argv.slice(2));
// @ts-ignore artifacts from truffle
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const DataLoadableFacet = artifacts.require('DataLoadableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');
const StErc20Facet = artifacts.require('StErc20Facet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StMasterFacet = artifacts.require('StMasterFacet');
const StMintableFacet = artifacts.require('StMintableFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');

const { getLedgerHashOffChain, createBackupData } = require('./utils');
const CONST = require('../const');

process.on('unhandledRejection', console.error);

/**
 * Usage: `INSTANCE_ID=local truffle exec contract_upgrade/backup.js -s=ADDR -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
  const contractAddress = `0x${argv?.s}`.toLowerCase();
  console.time('backup');

  // return error if not a valid address
  if (!contractAddress.match(/^0x[0-9a-f]{40}$/i)) {
    return callback(new Error(`Invalid address: ${contractAddress}`));
  }

  const contract_CcyCollateralizableFacet = await CcyCollateralizableFacet.at(contractAddress);
  const contract_DataLoadableFacet = await DataLoadableFacet.at(contractAddress);
  const contract_OwnedFacet = await OwnedFacet.at(contractAddress);
  const contract_StBurnableFacet = await StBurnableFacet.at(contractAddress);
  const contract_StErc20Facet = await StErc20Facet.at(contractAddress);
  const contract_StFeesFacet = await StFeesFacet.at(contractAddress);
  const contract_StLedgerFacet = await StLedgerFacet.at(contractAddress);
  const contract_StMasterFacet = await StMasterFacet.at(contractAddress);
  const contract_StMintableFacet = await StMintableFacet.at(contractAddress);
  const contract_StTransferableFacet = await StTransferableFacet.at(contractAddress);

  // TODO: support different contract types
  // skip if contract type is not commodity
  const contractType = await contract_StMasterFacet.getContractType();
  if (Number(contractType) !== Number(CONST.contractType.COMMODITY)) {
    callback(`Invalid contract type: ${contractType}`);
    return;
  }

  // get contract info
  const backup = await createBackupData([
      contract_CcyCollateralizableFacet,
      contract_DataLoadableFacet,
      contract_OwnedFacet,
      contract_StBurnableFacet,
      contract_StErc20Facet,
      contract_StFeesFacet,
      contract_StLedgerFacet,
      contract_StMasterFacet,
      contract_StMintableFacet,
      contract_StTransferableFacet,
    ], 
    contractAddress, 
    contractType
  );

  const onChainLedgerHash = argv?.h === 'onchain';
  const ledgerHash = onChainLedgerHash
    ? await CONST.getLedgerHashcode(contract_StTransferableFacet)
    : getLedgerHashOffChain(backup.data, backup.data.transferedFullSecTokensEvents);

  // create data directory if not exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // write backup to json file
  const backupFile = path.join(dataDir, `${contractAddress}.json`);
  console.log(`Writing backup to ${backupFile}`);
  fs.writeFileSync(backupFile, JSON.stringify({ ledgerHash, ...backup }, null, 2));

  console.timeEnd('backup');
  callback();
};
