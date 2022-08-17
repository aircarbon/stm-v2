// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { toBN } = require('web3-utils');
const chalk = require('chalk');
const argv = require('yargs-parser')(process.argv.slice(2));
// @ts-ignore artifacts from truffle
const StMaster = artifacts.require('StMaster');
const series = require('async/series');

const { getLedgerHashOffChain, createBackupData, createBatches } = require('./utils');
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
  const newContract = await StMaster.at(newContractAddress);
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

  const filteredCcyTypes = data.ccyTypes.filter((ccyType) => currencyNames.includes(ccyType.name));
  let ccyTypesBatches = createBatches(filteredCcyTypes, 20);

  const ccyTypesPromises = ccyTypesBatches.map((ccyBatch) => 
    function addCcyTypeBatch(cb) {
      console.log(`Adding ccyTypes`);
      console.log(ccyBatch.map((ccyType) => ccyType.name));

      newContract
        .addCcyTypeBatch(
          ccyBatch.map((ccyType) => ccyType.name), 
          ccyBatch.map((ccyType) => ccyType.unit), 
          ccyBatch.map((ccyType) => ccyType.decimals))
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    },
  );
  
  console.log('\n\n\n\n======= CHANGES 1 INCOMING ========');
  await series(ccyTypesPromises);
  await sleep(1000);

  // add token types to new contract
  const tokTypes = await newContract.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);
  const tokenNames = tokenTypes.map((type) => type.name);

  const filteredTokenTypes = data.tokenTypes.filter((tokenType) => tokenNames.includes(tokenType.name));
  let tokenTypesBatches = createBatches(filteredTokenTypes, 20);

  const tokenTypesPromises = tokenTypesBatches.map((tokenTypeBatch) => 
    function addCcyTypeBatch(cb) {
      console.log(`Adding tokenType`);
      console.log(tokenTypeBatch.map((ccyType) => ccyType.name));

      newContract
        .addSecTokenBatch(
          tokenTypeBatch.map((ccyType) => ccyType.name), 
          tokenTypeBatch.map((ccyType) => ccyType.settlementType), 
          tokenTypeBatch.map((ccyType) => ccyType.ft),
          tokenTypeBatch.map((ccyType) => ccyType.cashflowBaseAddr))
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    },
  );
  
  console.log('\n\n\n\n======= CHANGES 2 INCOMING ========');
  await series(tokenTypesPromises);
  await sleep(1000);

  const hasSealed = await newContract.getContractSeal();
  console.log('Contract seal', hasSealed);

  if (!hasSealed) {
    // load batches data to new contract
    const maxBatchId = await newContract.getSecTokenBatch_MaxId();
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
    const toBeWhitelisted = data.ledgerOwners.filter((owner) => (ledgerOwners.includes(owner) && !whitelistedAddresses.includes(owner)));
    let whitelistingAddrBatches = createBatches(toBeWhitelisted, 500);

    const whiteListingPromises = whitelistingAddrBatches.map((wlBatch) => 
      function whitelistMany(cb) {
        console.log(`Adding addresses to whitelist`);

        newContract
          .whitelistMany(wlBatch)
          .then(() => {
            newContract
            .then((result) => cb(null, result))
            .catch((error) => cb(error));
            },
          );
    });

  console.log('\n\n\n\n======= CHANGES 3 INCOMING ========');
  await series(whiteListingPromises);
  await sleep(1000);
  
  // load ledgers data to new contract
  const batchSize_ledgers = 20;
  let filteredLedgersWithOwners = [];

  for(let i = 0; i < data.ledgerOwners.length; i++) {
    if(ledgerOwners.includes(data.ledgerOwners[i])) {
      filteredLedgersWithOwners.push({
        ledger: data.ledgers[i],
        owner: data.ledgerOwners[i]
      });
    }
  }

  let ledgersBatches = createBatches(filteredLedgersWithOwners, 20);

  const ledgersPromises = ledgersBatches.map((ledgerBatch, index, allBatches) => 
    function createLedgerEntryBatch(cb) {
      console.log(`Creating ledger batch entry #${index}/${allBatches.length} - currency`);

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

  console.log('\n\n\n\n======= CHANGES 4 INCOMING ========');
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

  let tokensWithOwnersBatches = createBatches(filteredTokens, 20);

  const tokensPromises = tokensWithOwnersBatches.map((tokenWithOwnerBatch) => 
    function addSecTokenBatch(cb) {
      console.log('AddSecTokenToEntryBatch');
      console.log(tokenWithOwnerBatch.map((batchWithOwner) => batchWithOwner.token.stId));

      newContract
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
  
  console.log('\n\n\n\n======= CHANGES 5 INCOMING ========');
  await series(tokensPromises);
  await sleep(1000);

  // getSecToken for all tokens
  // addSecTokenBatch
  // add globalSecTokens to new contract
  let allTokens = [];

  for(let i = 0; i < data.globalSecTokens.length; i++) {
    const token = data.globalSecTokens[i]

    const transferedFullSecTokensEvent = data.transferedFullSecTokensEvents.find(
      (event) => Number(event.stId) === Number(token.stId),
    );

    if (transferedFullSecTokensEvent) {
      console.log(`Found transferedFullSecTokensEvent for ${token.stId}`, transferedFullSecTokensEvent);
    }

    let exists = await newContract.getSecToken(token.stId);
    exists = helpers.decodeWeb3Object(exists).exists;

    allTokens.push({token, transferedFullSecTokensEvent, exists});
  }
  allTokens = allTokens.filter((tokenObj) => !tokenObj.exists);
  let tokensBatches = createBatches(allTokens, 20);

  const promises = tokensBatches.map((tokenBatch, index, allBatches) => 
    function addGlobalSecToken(cb) {
      console.log(`Creating ledger batch entry #${index}/${allBatches.length} - currency`);

        newContract.addSecTokenBatch(
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

  console.log('\n\n\n\n======= CHANGES 6 INCOMING ========');
  await series(promises);
  await sleep(1000);

    await newContract.setTokenTotals(
      data.secTokenBaseId,
      toBN(data.secTokenMintedCount),
      toBN(data.secTokenMintedQty),
      toBN(data.secTokenBurnedQty),
    );

    //////////////////////////////////////////

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
    
    

    const promises = tokensBatches.map((tokenBatch, index, allBatches) => 
    function setCcyTypesBatches(cb) {
      console.log(`Setting fee for ccyTypes`);

        newContract.addSecTokenBatch(
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

  console.log('\n\n\n\n======= CHANGES 6 INCOMING ========');
  await series(promises);
  await sleep(1000);

    //////////////////////////////////////////


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
          newContract
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
          newContract
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
              newContract
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
              newContract
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
