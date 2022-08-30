// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { toBN } = require('web3-utils');
const chalk = require('chalk');
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

const series = require('async/series');

const { getLedgerHashOffChain, createBackupData, createBackupData2 } = require('./utils');
const CONST = require('../const');
const { helpers } = require('../../orm/build');

process.on('unhandledRejection', console.error);

// how many items to process in one batch
// const WHITELIST_COUNT = 5000;
// const WHITELIST_CHUNK_SIZE = 100;
const BATCH_CHUNK_SIZE = 2;

// create a sleep function to be used in the async series
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Usage: `INSTANCE_ID=local truffle exec upgrade_contract/restore.js -s=ADDR -t=NEW_ADDR  -h=[offchain|onchain] [--network <name>] [--compile]`,
 * @link https://github.com/trufflesuite/truffle/issues/889#issuecomment-522581580
 */
module.exports = async (callback) => {
  console.time('restore');
  const contractAddress = `0x${argv?.s}`.toLowerCase();
  const newContractAddress = `0x${argv?.t}`.toLowerCase();

  // return error if not a valid address
  if (!contractAddress.match(/^0x[0-9a-f]{40}$/i)) {
    return callback(new Error(`Invalid backup address: ${contractAddress}`));
  }
  if (!newContractAddress.match(/^0x[0-9a-f]{40}$/i)) {
    return callback(new Error(`Invalid target address: ${newContractAddress}`));
  }

  // read data from json file
  const dataDir = path.join(__dirname, 'data');
  const backupFile = path.join(dataDir, `${contractAddress}.json`);
  const { data, info, ledgerHash: previousHash } = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  // deploy new contract with info
  const newContract_CcyCollateralizableFacet = await CcyCollateralizableFacet.at(newContractAddress);
  const newContract_DataLoadableFacet = await DataLoadableFacet.at(newContractAddress);
  const newContract_OwnedFacet = await OwnedFacet.at(newContractAddress);
  const newContract_StBurnableFacet = await StBurnableFacet.at(newContractAddress);
  const newContract_StErc20Facet = await StErc20Facet.at(newContractAddress);
  const newContract_StFeesFacet = await StFeesFacet.at(newContractAddress);
  const newContract_StLedgerFacet = await StLedgerFacet.at(newContractAddress);
  const newContract_StMasterFacet = await StMasterFacet.at(newContractAddress);
  const newContract_StMintableFacet = await StMintableFacet.at(newContractAddress);
  const newContract_StTransferableFacet = await StTransferableFacet.at(newContractAddress);
  // show debug info in table format
  console.log(chalk.yellow(`${info.name} (${info.version})`));

  // get contract info
  const name = await newContract_StMasterFacet.name();
  const version = await newContract_StMasterFacet.version();
  console.log(`New contract address: ${newContractAddress}`);
  console.log(`Name: ${name}`);
  console.log(`Version: ${version}`);

  // NOTE: moved this logic to separate file, to restore WL first before closing market to initiate migration.
  // whitelisting addresses to new contract
  // const whitelistAddressesOnTarget = await newContract.getWhitelist();
  // console.log('# of WL Addresses on Target', whitelistAddressesOnTarget.length);
  // const additionalWLAddresses = [];
  // for (let i = data.whitelistAddresses.length; i < WHITELIST_COUNT; i++) {
  //   // note - we include account[0] owner account in the whitelist
  //   const x = await CONST.getAccountAndKey(i);
  //   if (!data.whitelistAddresses.map((p) => p.toLowerCase()).includes(x.addr.toLowerCase())) {
  //     additionalWLAddresses.push(x.addr);
  //   } else {
  //     console.log(`skipping ${x.addr} (already in WL)...`);
  //   }
  // }
  
  // const addressesToWhiteList = [...data.whitelistAddresses, ...additionalWLAddresses];
  // const whitelistPromises = addressesToWhiteList
  //   .reduce((result, addr) => {
  //     if (whitelistAddressesOnTarget.map((p) => p.toLowerCase()).includes(addr.toLowerCase())) {
  //       return result;
  //     }

  //     const lastItem = result?.[result.length - 1] ?? [];
  //     if (lastItem && lastItem.length === WHITELIST_CHUNK_SIZE) {
  //       return [...result, [addr]];
  //     } else {
  //       return [...result.slice(0, -1), [...lastItem, addr]];
  //     }
  //   }, [])
  //   .map(
  //     (addresses) =>
  //       function addWhitelist(cb) {
  //         console.log(`Adding whitelist addresses`, addresses);
  //         if (addresses.length === 0) {
  //           return cb(null, []);
  //         }

  //         newContract
  //           .whitelistMany(addresses)
  //           .then((result) => cb(null, result))
  //           .catch((error) => cb(error));
  //       },
  //   );

  // await series(whitelistPromises);

  // add ccy data to new contract
  const ccyTypes = await newContract_CcyCollateralizableFacet.getCcyTypes();
  const { ccyTypes: currencyTypes } = helpers.decodeWeb3Object(ccyTypes);
  const currencyNames = currencyTypes.map((type) => type.name);
  const ccyTypesPromises = data.ccyTypes.map(
    (ccyType) =>
      function addCcyType(cb) {
        if (currencyNames.includes(ccyType.name)) {
          return cb(null, ccyType);
        }
        console.log(`Adding ccyType`, ccyType);
        newContract_CcyCollateralizableFacet
          .addCcyType(ccyType.name, ccyType.unit, ccyType.decimals)
          .then((ccy) => cb(null, ccy))
          .catch((error) => cb(error));
      },
  );

  await series(ccyTypesPromises);
  await sleep(1000);

  // add token types to new contract
  const tokTypes = await newContract_StLedgerFacet.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);
  const tokenNames = tokenTypes.map((type) => type.name);
  const tokenTypesPromises = data.tokenTypes.map(
    (tokenType) =>
      function addTokenType(cb) {
        if (tokenNames.includes(tokenType.name)) {
          return cb(null, tokenType);
        }

        console.log(`Adding tokenType`, tokenType);
        newContract_StLedgerFacet
          .addSecTokenType(tokenType.name, tokenType.settlementType, tokenType.ft, tokenType.cashflowBaseAddr)
          .then((token) => cb(null, token))
          .catch((error) => cb(error));
      },
  );

  await series(tokenTypesPromises);
  await sleep(1000);

  const hasSealed = await newContract_StMasterFacet.getContractSeal();
  console.log('Contract seal', hasSealed);

  if (!hasSealed) {
    // load batches data to new contract
    const maxBatchId = await newContract_StLedgerFacet.getSecTokenBatch_MaxId();
    console.log(`Max batch id: ${maxBatchId}`);

    const batchesPromises = data.batches
      .filter((batch) => Number(batch.id) > Number(maxBatchId))
      .reduce((result, batch) => {
        const lastItem = result?.[result.length - 1] ?? [];
        if (lastItem && lastItem.length === BATCH_CHUNK_SIZE) {
          return [...result, [batch]];
        } else {
          return [...result.slice(0, -1), [...lastItem, batch]];
        }
      }, [])
      .map(
        (batches, index, allBatches) =>
          function loadSecTokenBatch(cb) {
            console.log(`Adding batches`, batches);
            console.log(`Processing batches: ${index + 1}/${allBatches.length}`);
            const batchCount = batches[1]?.id || batches[0]?.id;
            newContract_DataLoadableFacet
              .loadSecTokenBatch(batches, batchCount)
              .then((result) => cb(null, result))
              .catch((error) => cb(error));
          },
      );

    await series(batchesPromises);
    await sleep(1000);

    // get ledgers
    const ledgerOwners = await newContract_StLedgerFacet.getLedgerOwners();
    const ledgers = (await Promise.all(ledgerOwners.map((owner) => newContract.getLedgerEntry(owner))))
      .map((ledger) => helpers.decodeWeb3Object(ledger))
      .map((ledger) => {
        return {
          ...ledger,
          ccys: ledger.ccys.map((ccy) => ({
            ccyTypeId: ccy.ccyTypeId,
            name: ccy.name,
            unit: ccy.unit,
            balance: ccy.balance,
            reserved: ccy.reserved,
          })),
        };
      });

    // load ledgers data to new contract
    const whitelistedAddresses = await newContract_StErc20Facet.getWhitelist();

    const ledgersPromises = data.ledgers.map(
      (ledger, index, allLedgers) =>
        function createLedgerEntry(cb) {
          const owner = data.ledgerOwners[index];
          // skip if owner already inserted
          if (ledgerOwners.includes(owner)) {
            cb(null, []);
          } else {
            console.log(`Creating ledger entry #${index} - currency`, owner, ledger.ccys);
            console.log(`Processing ledger - currency: ${index + 1}/${allLedgers.length}`);

            if(!whitelistedAddresses.includes(owner)) {
              newContract_StErc20Facet
              .whitelistMany([owner])
              .then(() => {
                newContract_DataLoadableFacet
                .createLedgerEntryBatch([[owner, ledger.ccys, ledger.spot_sumQtyMinted, ledger.spot_sumQtyBurned, 1]])
                .then((result) => cb(null, result))
                .catch((error) => cb(error));
              });
            } else {
              newContract_DataLoadableFacet
              .createLedgerEntryBatch([[owner, ledger.ccys, ledger.spot_sumQtyMinted, ledger.spot_sumQtyBurned, 1]])
              .then((result) => cb(null, result))
              .catch((error) => cb(error));
            }
          }
        },
    );
    await series(ledgersPromises);
    await sleep(1000);

    const addSecTokensPromises = data.ledgers.flatMap(
      (ledger, index, allLedgers) =>
        function addSecToken(cb) {
          const owner = data.ledgerOwners[index];
          if (ledger.tokens.length === 0) {
            return cb(null, []);
          }

          // skip if already inserted
          let tokens = ledger.tokens;
          if (ledgerOwners.includes(owner)) {
            const stIds = ledgers[ledgerOwners.indexOf(owner)].tokens.map((token) => token.stId);
            tokens = tokens.filter((token) => !stIds.includes(token.stId));
            if (tokens.length === 0) {
              return cb(null, []);
            }
          }

          console.log(`Processing ledger - token: ${index + 1}/${allLedgers.length}`, owner, tokens);

          return series(
            tokens.map(
              (token) =>
                function AddSecTokenToEntry(callback) {
                  console.log('AddSecTokenToEntry', token.stId);
                  newContract_DataLoadableFacet
                    .addSecToken(
                      owner,
                      token.batchId,
                      token.stId,
                      token.tokTypeId,
                      token.mintedQty,
                      token.currentQty,
                      token.ft_price,
                      token.ft_lastMarkPrice,
                      token.ft_ledgerOwner,
                      token.ft_PL,
                    )
                    .then((result) => callback(null, result))
                    .catch((error) => callback(error));
                },
            ),
          )
            .then((result) => cb(null, result))
            .catch((error) => cb(error));
        },
    );
    await series(addSecTokensPromises);
    await sleep(1000);

    // add globalSecTokens to new contract
    const globalSecTokensPromises = data.globalSecTokens.map(
      (token, index, tokens) =>
        function addGlobalSecToken(cb) {
          
          const { stId, mintedQty, currentQty } = token;
          const transferedFullSecTokensEvent = data.transferedFullSecTokensEvents.find(
            (event) => Number(event.stId) === Number(stId),
          );
          if (transferedFullSecTokensEvent) {
            console.log(`Found transferedFullSecTokensEvent for ${stId}`, transferedFullSecTokensEvent);
          }
          newContract_StLedgerFacet
            .getSecToken(stId)
            .then((result) => helpers.decodeWeb3Object(result))
            .then((existToken) => {
              console.log(`Processing ${index + 1}/${tokens.length}`);
              if (existToken.exists)
                return existToken;
              
              console.log('Add global sec token', token);
              return newContract_DataLoadableFacet.addSecToken(
                    '0x0000000000000000000000000000000000000000',
                    token.batchId,
                    stId,
                    token.tokTypeId,
                    Number(mintedQty) - Number(transferedFullSecTokensEvent?.qty ?? 0),
                    Number(currentQty) - Number(transferedFullSecTokensEvent?.qty ?? 0),
                    token.ft_price,
                    token.ft_lastMarkPrice,
                    token.ft_ledgerOwner,
                    token.ft_PL,
                  );
              })
            .then((result) => cb(null, result))
            .catch((error) => cb(error));
        },
    );
    await series(globalSecTokensPromises);
    await sleep(1000);

    await newContract_DataLoadableFacet.setTokenTotals(
      data.secTokenBaseId,
      toBN(data.secTokenMintedCount),
      toBN(data.secTokenMintedQty),
      toBN(data.secTokenBurnedQty),
    );

    // set fee for currency and token types
    const ccyFeePromises = data.ccyTypes.map((ccyType, index) => {
      return function setFeeForCcyType(cb) {
        const fee = data.ccyFees[index];
        if (
          Number(fee?.fee_fixed) ||
          Number(fee?.fee_percBips) ||
          Number(fee?.fee_min) ||
          Number(fee?.fee_max) ||
          Number(fee?.ccy_perMillion) ||
          Boolean(fee?.ccy_mirrorFee)
        ) {
          console.log(`Setting fee for ccyType ${ccyType.name}`, fee);
          newContract_StFeesFacet
            .setFee_CcyType(ccyType.id, CONST.nullAddr, fee)
            .then((result) => cb(null, result))
            .catch((error) => cb(error));
        } else {
          cb(null, fee);
        }
      };
    });
    await series(ccyFeePromises);
    await sleep(1000);

    const tokenFeePromises = data.tokenTypes.map((tokenType, index) => {
      return function setFeeForTokenType(cb) {
        const fee = data.tokenFees[index];
        if (
          Number(fee?.fee_fixed) ||
          Number(fee?.fee_percBips) ||
          Number(fee?.fee_min) ||
          Number(fee?.fee_max) ||
          Number(fee?.ccy_perMillion) ||
          Boolean(fee?.ccy_mirrorFee)
        ) {
          console.log(`Setting fee for tokenType ${tokenType.name}`, fee);
          newContract_StFeesFacet
            .setFee_TokType(tokenType.id, CONST.nullAddr, fee)
            .then((result) => cb(null, result))
            .catch((error) => cb(error));
        } else {
          cb(null, fee);
        }
      };
    });

    await series(tokenFeePromises);
    await sleep(1000);

    // set currency and token types fee for ledger owner
    const ccyFeeForLedgerOwnerPromises = data.ledgerOwners.map((ledgerOwner, index) => {
      return function setFeeForLedgerOwner(callback) {
        console.log(`Setting fee for ledgerOwner ${ledgerOwner}`);
        // TODO: set fee for all currency and token types
        // set fee for currency and token types
        const ccyFeePromises = data.ledgerOwnersFees[index]?.currencies?.map((fee, counter) => {
          return function setFeeForCcyType(cb) {
            const ccyType = data.ccyTypes[counter];
            if (
              Number(fee?.fee_fixed) ||
              Number(fee?.fee_percBips) ||
              Number(fee?.fee_min) ||
              Number(fee?.fee_max) ||
              Number(fee?.ccy_perMillion) ||
              Boolean(fee?.ccy_mirrorFee)
            ) {
              console.log(`Setting fee for ccyType ${ccyType.name}`, ledgerOwner, fee);
              newContract_StFeesFacet
                .setFee_CcyType(ccyType.id, ledgerOwner, fee)
                .then((result) => cb(null, result))
                .catch((error) => cb(error));
            } else {
              cb(null, fee);
            }
          };
        });

        const tokenFeePromises = data.ledgerOwnersFees[index]?.tokens?.map((fee, counter) => {
          return function setFeeForTokenType(cb) {
            const tokenType = data.tokenTypes[counter];
            if (
              Number(fee?.fee_fixed) ||
              Number(fee?.fee_percBips) ||
              Number(fee?.fee_min) ||
              Number(fee?.fee_max) ||
              Number(fee?.ccy_perMillion) ||
              Boolean(fee?.ccy_mirrorFee)
            ) {
              console.log(`Setting fee for tokenType ${tokenType.name}`, ledgerOwner, fee);
              newContract_StFeesFacet
                .setFee_TokType(tokenType.id, ledgerOwner, fee)
                .then((result) => cb(null, result))
                .catch((error) => cb(error));
            } else {
              cb(null, fee);
            }
          };
        });

        series([...tokenFeePromises, ...ccyFeePromises])
          .then(() => callback(null, ledgerOwner))
          .catch((error) => callback(error));
      };
    });
    await series(ccyFeeForLedgerOwnerPromises);
    await sleep(1000);
  }

  if (!hasSealed) await newContract_StMasterFacet.sealContract();

  const backupData = await createBackupData2(
    [
      newContract_CcyCollateralizableFacet,
      newContract_DataLoadableFacet,
      newContract_OwnedFacet,
      newContract_StBurnableFacet,
      newContract_StErc20Facet,
      newContract_StFeesFacet,
      newContract_StLedgerFacet,
      newContract_StMasterFacet,
      newContract_StMintableFacet,
      newContract_StTransferableFacet,
    ], 
    newContractAddress, 
    0, 
    false
  );

  const onChainLedgerHash = argv?.h === 'onchain';
  const ledgerHash = onChainLedgerHash
    ? await CONST.getLedgerHashcode(newContract_StTransferableFacet)
    : getLedgerHashOffChain(backupData.data, data.transferedFullSecTokensEvents, data.whitelistAddresses.length);

  // write backup to json file
  const newBackupFile = path.join(dataDir, `${newContractAddress}.json`);
  console.log(`Writing backup to ${backupFile}`);
  fs.writeFileSync(newBackupFile, JSON.stringify({ ledgerHash, ...backupData }, null, 2));

  if (ledgerHash !== previousHash) {
    console.error(`Ledger hash mismatch!`, {
      ledgerHash,
      previousHash,
    });
    return callback(new Error(`Ledger hash mismatch!`));
  }

  console.log(`GREAT! Ledger hashes match!`, {
    previousHash,
    ledgerHash,
  });

  console.timeEnd('restore');
  callback('Done.');
};
