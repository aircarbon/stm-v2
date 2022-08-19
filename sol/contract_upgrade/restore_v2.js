// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { toBN } = require('web3-utils');
const chalk = require('chalk');
const argv = require('yargs-parser')(process.argv.slice(2));
// @ts-ignore artifacts from truffle
const StMaster = artifacts.require('StMaster');
const dcStMaster = artifacts.require('dcStMaster');
const series = require('async/series');

const { getLedgerHashOffChain, createBackupData, createBatches } = require('./utils');
const CONST = require('../const');
const { helpers } = require('../../orm/build');

process.on('unhandledRejection', console.error);

// how many items to process in one batch
// const WHITELIST_COUNT = 5000;
// const WHITELIST_CHUNK_SIZE = 100;
const BATCH_CHUNK_SIZE = 10;

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
  const newContract = await StMaster.at(newContractAddress);
  const newContractDc = await dcStMaster.at(newContractAddress);
  // show debug info in table format
  console.log(chalk.yellow(`${info.name} (${info.version})`));

  // get contract info
  const name = await newContract.name();
  const version = await newContract.version();
  console.log(`New contract address: ${newContract.address}`);
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
  const ccyTypes = await newContract.getCcyTypes();
  const { ccyTypes: currencyTypes } = helpers.decodeWeb3Object(ccyTypes);
  const currencyNames = currencyTypes.map((type) => type.name);

  const filteredCcyTypes = data.ccyTypes.filter((ccyType) => !currencyNames.includes(ccyType.name));
  let ccyTypesBatches = createBatches(filteredCcyTypes, 20);
  
  console.log('\n Adding Ccy Types (by batches).');
  // is order important? If not, can send multiple transactions at the same time
  const ccyTypesPromises = ccyTypesBatches.map((ccyBatch, index) => 
    function addCcyTypeBatch(cb) {
      console.log(`Adding ccyTypes - ${index + 1} / ${ccyTypesBatches.length}`);

      newContractDc
        .addCcyTypeBatch(
          ccyBatch.map((ccyType) => ccyType.name), 
          ccyBatch.map((ccyType) => ccyType.unit), 
          ccyBatch.map((ccyType) => ccyType.decimals))
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    },
  );
  
  await series(ccyTypesPromises);
  await sleep(1000);

  // add token types to new contract
  const tokTypes = await newContract.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);
  const tokenNames = tokenTypes.map((type) => type.name);

  const filteredTokenTypes = data.tokenTypes.filter((tokenType) => !tokenNames.includes(tokenType.name));
  let tokenTypesBatches = createBatches(filteredTokenTypes, 20);

  console.log('\n Adding Sec Token Types (by batches).');
  // is order important? If not, can send multiple transactions at the same time
  const tokenTypesPromises = tokenTypesBatches.map((tokenTypeBatch, index) => 
    function addCcyTypeBatch(cb) {
      console.log(`Adding tokenTypeBatch ${index + 1}/${tokenTypesBatches.length}`);

      newContract
        .addSecTokenTypeBatch(
          tokenTypeBatch.map((ccyType) => {
            return {
              name: ccyType.name,
              settlementType: ccyType.settlementType,
              ft: ccyType.ft,
              cashflowBaseAddr: ccyType.cashflowBaseAddr
            }
          }))
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    }
  );
  
  await series(tokenTypesPromises);
  await sleep(1000);

  const hasSealed = await newContract.getContractSeal();
  console.log('Contract seal', hasSealed);

  if (!hasSealed) {
    // load batches data to new contract
    const maxBatchId = await newContract.getSecTokenBatch_MaxId();
    console.log(`Max batch id: ${maxBatchId}`);

    console.log('\n Loading Sec Tokens (by batches).');

    // is order important? If not, can send multiple transactions at the same time
    // can play around with BATCH_CHUNK_SIZE, in ideal case make it dynamic
    // not much to optimize, the transaction data is heavy and already imported in batches.

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
            console.log(`Processing batches: ${index + 1}/${allBatches.length}`);
            const batchCount = batches[1]?.id || batches[0]?.id;
            newContract
              .loadSecTokenBatch(batches, batchCount)
              .then((result) => cb(null, result))
              .catch((error) => cb(error));
          },
      );

    await series(batchesPromises);
    await sleep(1000);

    // get ledgers
    const ledgerOwners = await newContract.getLedgerOwners();
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

    const whitelistedAddresses = await newContract.getWhitelist();

    // whitelisting owners
    const toBeWhitelisted = data.ledgerOwners.filter((owner) => (!whitelistedAddresses.includes(owner)));
    let whitelistingAddrBatches = createBatches(toBeWhitelisted, 100);

    // order matters?
    console.log('\n Whitelisting addresses (among ledger owners) that were not whitelisted yet (by batches).');
    const whiteListingPromises = whitelistingAddrBatches.map((wlBatch, index) => 
      function whitelistMany(cb) {
        console.log(`Adding addresses to whitelist ${index + 1}/${whitelistingAddrBatches.length}`);

        newContract
          .whitelistMany(wlBatch)
          .then((result) => cb(null, result))
          .catch((error) => cb(error));
    });
  
  await series(whiteListingPromises);
  await sleep(1000);
  
  // load ledgers data to new contract
  let filteredLedgersWithOwners = [];

  for(let i = 0; i < data.ledgerOwners.length; i++) {
    if(!ledgerOwners.includes(data.ledgerOwners[i])) {
      filteredLedgersWithOwners.push({
        ledger: data.ledgers[i],
        owner: data.ledgerOwners[i]
      });
    }
  }

  let ledgersBatches = createBatches(filteredLedgersWithOwners, 20);

  console.log('\n Creating ledger entries (by batches).');
  const ledgersPromises = ledgersBatches.map((ledgerBatch, index) => 
    function createLedgerEntryBatch(cb) {
      console.log(`Creating ledger batch entry ${index + 1}/${ledgersBatches.length}`);

      newContract
        .createLedgerEntryBatch(ledgerBatch.map((obj) => {
          return {
            ledgerEntryOwner: obj.owner,
            ccys: obj.ledger.ccys,
            spot_sumQtyMinted: obj.ledger.spot_sumQtyMinted,
            spot_sumQtyBurned: obj.ledger.spot_sumQtyBurned,
            entityId: 1
          };
        }))
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  await series(ledgersPromises);
  await sleep(1000);
  
  // adding sec tokens
  let filteredTokens = [];

  for(let i = 0; i < data.ledgers.length; i++) {
    const currLedger = data.ledgers[i];
    const owner = data.ledgerOwners[i];

    if (currLedger.tokens.length === 0) {
      continue;
    }

    // skip if already inserted
    let tokens = currLedger.tokens;
    if (ledgerOwners.includes(owner)) {
      const stIds = ledgers[ledgerOwners.indexOf(owner)].tokens.map((token) => token.stId);
      tokens = tokens.filter((token) => !stIds.includes(token.stId));
      if (tokens.length === 0) {
        continue;
      }
    }

    tokens.forEach((token) => {
      filteredTokens.push({token, owner});
    });
  }

  let tokensWithOwnersBatches = createBatches(filteredTokens, 30);

  console.log('\n Adding Sec Tokens (by batches).');
  const tokensPromises = tokensWithOwnersBatches.map((tokenWithOwnerBatch, index) => 
    function addSecTokenBatch(cb) {
      console.log(`addSecTokenBatch - ${index + 1}/${tokensWithOwnersBatches.length}`);

      newContractDc
        .addSecTokenBatch(tokenWithOwnerBatch.map((batchWithOwner) => {
          return {
            ledgerEntryOwner: batchWithOwner.owner,
            batchId: batchWithOwner.token.batchId,
            stId: batchWithOwner.token.stId,
            tokTypeId: batchWithOwner.token.tokTypeId,
            mintedQty: batchWithOwner.token.mintedQty,
            currentQty: batchWithOwner.token.currentQty,
            ft_price: batchWithOwner.token.ft_price,
            ft_lastMarkPrice: batchWithOwner.token.ft_lastMarkPrice,
            ft_ledgerOwner: batchWithOwner.token.ft_ledgerOwner,
            ft_PL: batchWithOwner.token.ft_PL,
          }
        }))
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    },
  );

  await series(tokensPromises);
  await sleep(1000);

  // getSecToken for all tokens
  // addSecTokenBatch
  // add globalSecTokens to new contract
  let allTokens = [];
  
  // this loop takes for too long, need to create a batchGet function

  let counter = 0;
  
  // This mechanism is added to avoid the script being stopped once a node doesn't reply once
  do{
    break;
    try{
      const token = data.globalSecTokens[counter]

      const transferedFullSecTokensEvent = data.transferedFullSecTokensEvents.find(
        (event) => Number(event.stId) === Number(token.stId),
      );
  
      if (transferedFullSecTokensEvent) {
        console.log(`Found transferedFullSecTokensEvent for ${token.stId}`);
      }
  
      let exists = await newContract.getSecToken(token.stId);
      exists = helpers.decodeWeb3Object(exists).exists;
  
      allTokens.push({token, transferedFullSecTokensEvent, exists});
      counter++;
    }catch(err) {
      console.log('Encountered error, trying again...');
      continue;
    }
  } while(counter < data.globalSecTokens.length);

  allTokens = allTokens.filter((tokenObj) => !tokenObj.exists);
  let tokensBatches = createBatches(allTokens, 20);

  console.log('\n Adding Sec Tokens (Global) (by batches).');
  const promises = tokensBatches.map((tokenBatch, index, allBatches) => 
    function addSecTokenBatch(cb) {
      console.log(`addSecTokenBatch global - ${index + 1}/${allBatches.length}`);

        newContractDc.addSecTokenBatch(
          tokenBatch.map((tokenObj) => {
            return {
              ledgerEntryOwner: '0x0000000000000000000000000000000000000000',
              batchId: tokenObj.token.batchId,
              stId: tokenObj.token.stId,
              tokTypeId: tokenObj.token.tokTypeId,
              mintedQty: Number(tokenObj.token.mintedQty) - Number(tokenObj.transferedFullSecTokensEvent?.qty ?? 0),
              currentQty: Number(tokenObj.token.currentQty) - Number(tokenObj.transferedFullSecTokensEvent?.qty ?? 0),
              ft_price: tokenObj.token.ft_price,
              ft_lastMarkPrice: tokenObj.token.ft_lastMarkPrice,
              ft_ledgerOwner: tokenObj.token.ft_ledgerOwner,
              ft_PL: tokenObj.token.ft_PL,
            }
          })
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  console.log('\n\n======= CHANGES 6 INCOMING ========');
  await series(promises);
  await sleep(1000);

    await newContract.setTokenTotals(
      data.secTokenBaseId,
      toBN(data.secTokenMintedCount),
      toBN(data.secTokenMintedQty),
      toBN(data.secTokenBurnedQty),
    );

    let allCcyTypesWithFees = data.ccyTypes.map((ccyType, index) => {
      return {
        ccyType,
        fee: data.ccyFees[index]
      }
    });

    allCcyTypesWithFees = allCcyTypesWithFees.filter((ccyTypeObj) => {
      return Number(ccyTypeObj.fee?.fee_fixed) ||
        Number(ccyTypeObj.fee?.fee_percBips) ||
        Number(ccyTypeObj.fee?.fee_min) ||
        Number(ccyTypeObj.fee?.fee_max) ||
        Number(ccyTypeObj.fee?.ccy_perMillion) ||
        Boolean(ccyTypeObj.fee?.ccy_mirrorFee)
    });

    let ccyTypesBatches = createBatches(allCcyTypesWithFees, 20);

    const ccyTypesPromises = ccyTypesBatches.map((tokenBatch, index) => 
    function setCcyTypesBatches(cb) {
      console.log(`Setting fee for ccyTypes (in batch) - ${index + 1}/${ccyTypesBatches.length}`);

        newContractDc.setFee_CcyTypeBatch(
          tokenBatch.map((ccyTypeObj) => {
            return {
              ccyTypeId: ccyTypeObj.ccyType.id,
              ledgerOwner: CONST.nullAddr,
              feeArgs: ccyTypeObj.fee
            }
          })
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  console.log('\n\n\n\n======= CHANGES 7 INCOMING ========');
  await series(ccyTypesPromises);
  await sleep(1000);

    let allTokenTypesWithFees = data.tokenTypes.map((tokenType, index) => {
      return {
        tokenType,
        fee: data.tokenFees[index]
      }
    });

    allTokenTypesWithFees = allTokenTypesWithFees.filter((tokenTypeWithFee) => {
      return Number(tokenTypeWithFee.fee?.fee_fixed) ||
        Number(tokenTypeWithFee.fee?.fee_percBips) ||
        Number(tokenTypeWithFee.fee?.fee_min) ||
        Number(tokenTypeWithFee.fee?.fee_max) ||
        Number(tokenTypeWithFee.fee?.ccy_perMillion) ||
        Boolean(tokenTypeWithFee.fee?.ccy_mirrorFee);
    });

    let tokTypesBatches = createBatches(allTokenTypesWithFees, 20);

    const tokTypesPromises = tokTypesBatches.map((tokTypeBatch, index) => 
    function setCcyTypesBatches(cb) {
      console.log(`Setting fee for token types (in batch) - ${index + 1}/${ccyTypesBatches.length}`);

        newContractDc.setFee_TokTypeBatch(
          tokTypeBatch.map((tokenTypeObj) => tokenTypeObj.tokenType.id),
          new Array(tokTypeBatch.length).fill(CONST.nullAddr),
          tokTypeBatch.map((tokenTypeObj) => tokenTypeObj.fee),
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    console.log('\n\n======= CHANGES 8 INCOMING ========');
    await series(tokTypesPromises);
    await sleep(1000);

    // setting fees for currency types for ledger owners
    console.log('\nSetting fees for currency types for ledger owners...');
    let feesWithOwnerAndCcyTypes = [];

    for(let i = 0; i < data.ledgerOwners.length; i++) {
      const ledgerOwner = data.ledgerOwners[i];
      const cciesFees = data.ledgerOwnersFees[i]?.currencies || [];

      for(let j = 0; j < cciesFees.length; j++) {
        const fee = cciesFees[j];

        if(Number(fee?.fee_fixed) ||
          Number(fee?.fee_percBips) ||
          Number(fee?.fee_min) ||
          Number(fee?.fee_max) ||
          Number(fee?.ccy_perMillion) ||
          Boolean(fee?.ccy_mirrorFee)) {
            feesWithOwnerAndCcyTypes.push({ccyTypeId: data.ccyTypes[j].id, ledgerOwner, fee});
        }
      
      }
    }

    let feesWithOwnerAndCcyTypesBatches = createBatches(feesWithOwnerAndCcyTypes, 20);

    const feeCcyTypePromises = feesWithOwnerAndCcyTypesBatches.map((feesBatch, index) => 
    function setCcyTypesBatches(cb) {
      console.log(`Setting fee for ccyTypes for owners (in batch) - ${index + 1}/${feesWithOwnerAndCcyTypesBatches.length}`);

        newContractDc.setFee_CcyTypeBatch(
          feesBatch.map((ccyTypeObj) => {
            return {
              ccyTypeId: ccyTypeObj.ccyTypeId,
              ledgerOwner: ccyTypeObj.ledgerOwner,
              feeArgs: ccyTypeObj.fee
            }
          })
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    console.log('\n\n======= CHANGES 9 INCOMING ========');
    await series(feeCcyTypePromises);
    await sleep(1000);

    // setting fees for token types for ledger owners
    console.log('\nSetting fees for token types for ledger owners...');
    let feesWithOwnerAndTokenTypes = [];

    for(let i = 0; i < data.ledgerOwners.length; i++) {
      const ledgerOwner = data.ledgerOwners[i];
      const tokensFees = data.ledgerOwnersFees[i]?.tokens || [];

      for(let j = 0; j < tokensFees.length; j++) {
        const fee = tokensFees[j];

        if(Number(fee?.fee_fixed) ||
          Number(fee?.fee_percBips) ||
          Number(fee?.fee_min) ||
          Number(fee?.fee_max) ||
          Number(fee?.ccy_perMillion) ||
          Boolean(fee?.ccy_mirrorFee)) {
            feesWithOwnerAndTokenTypes.push({tokenTypeId: data.tokenTypes[j].id, ledgerOwner, fee});
        }
      
      }
    }

    let feesWithOwnerAndTokenTypesBatches = createBatches(feesWithOwnerAndTokenTypes, 20);

    const feeTokenTypePromises = feesWithOwnerAndTokenTypesBatches.map((feesBatch, index) => 
    function setTokenTypesBatches(cb) {
      console.log(`Setting fee for tokenTypes for owners (in batch) - ${index + 1}/${feesWithOwnerAndTokenTypesBatches.length}`);

        newContractDc.setFee_TokTypeBatch(
          feesBatch.map((tokenTypeObj) => tokenTypeObj.tokenTypeId),
          feesBatch.map((tokenTypeObj) => tokenTypeObj.ledgerOwner),
          feesBatch.map((tokenTypeObj) => tokenTypeObj.fee),
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    console.log('\n\n======= CHANGES 10 INCOMING ========');
    await series(feeTokenTypePromises);
    await sleep(1000);
  }

  if (!hasSealed) await newContract.sealContract();

  const backupData = await createBackupData(newContract, newContractAddress, 0, false);

  const onChainLedgerHash = argv?.h === 'onchain';
  const ledgerHash = onChainLedgerHash
    ? await CONST.getLedgerHashcode(newContract)
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
