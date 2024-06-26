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

const { getLedgerHashOffChain, createBackupData, createBatches, retry } = require('./utils');
const CONST = require('../const');
const { helpers } = require('../../orm/build');

const DEFAULT_ENTITY_ID = 1; // If there are no entities, this default entity will be assigned

process.on('unhandledRejection', console.error);

// how many items to process in one batch
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

  console.log('\n\n=============================================');
  console.log('IMPORTANT NOTICE!');
  console.log('ALL SYSTEM ACCOUNTS SHOULD SOME BALANCE FOR GAS FOR THIS SCRIPT TO WORK!');
  console.log('=============================================\n\n');

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

  // =================================================================
  // =============== add entities data to a new contract =============
  // =================================================================
  let entitiesWithFeeOwnersOnChain = await newContract_StErc20Facet.getAllEntitiesWithFeeOwners();
  entitiesWithFeeOwnersOnChain = entitiesWithFeeOwnersOnChain.map((obj) => { return {id: obj.id, addr: obj.addr}; });
  const entitiesOnChain = entitiesWithFeeOwnersOnChain.map((obj) => Number(obj.id));

  let entityIds = [];
  if(data.entitiesWithFeeOwners) {
    entityIds = data.entitiesWithFeeOwners.map((obj) => obj.id);
  }

  const entitiesToAdd = [];
  data.entitiesWithFeeOwners?.forEach((entWithFeeOwn) => {
    if(!entitiesOnChain.includes(Number(entWithFeeOwn.id))) {
      entitiesToAdd.push(entWithFeeOwn);
    }
  });

  if(entitiesToAdd.length > 0) {
    console.log('\n Adding entities with fee owners ...');
    console.log(entitiesToAdd);
    await newContract_StErc20Facet.createEntityBatch(entitiesToAdd);
  } else if (!entitiesOnChain.includes(DEFAULT_ENTITY_ID)) {
    // NOTE: if no entities, then it will create a new entity with an id "1" and assign all the accounts to it.
    // Entity fee owner can be updated later.
    await newContract_StErc20Facet.createEntity({id: DEFAULT_ENTITY_ID, addr: info.owners[0]});
  }

  // =================================================================
  // ================= Add ccy data to new contract ==================
  // =================================================================
  const ccyTypes = await newContract_CcyCollateralizableFacet.getCcyTypes();
  const { ccyTypes: currencyTypes } = helpers.decodeWeb3Object(ccyTypes);
  const currencyNames = currencyTypes.map((type) => type.name);

  const filteredCcyTypes = data.ccyTypes.filter((ccyType) => !currencyNames.includes(ccyType.name));
  let ccyTypesBatches = createBatches(filteredCcyTypes, 20);
  
  console.log('\n Adding Ccy Types (by batches).');
  // is order important? If not, can send multiple transactions at the same time
  const ccyTypesPromises = ccyTypesBatches.map((ccyBatch, index) => 
    function addCcyTypeBatch(cb) {
      console.log(`Adding ccyTypes - ${index + 1} / ${ccyTypesBatches.length}`);

      newContract_CcyCollateralizableFacet
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
  
  // =================================================================
  // ================ Add token types to new contract ================
  // =================================================================
  const tokTypes = await newContract_StLedgerFacet.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);
  const tokenNames = tokenTypes.map((type) => type.name);

  const filteredTokenTypes = data.tokenTypes.filter((tokenType) => !tokenNames.includes(tokenType.name));
  let tokenTypesBatches = createBatches(filteredTokenTypes, 20);

  console.log('\n Adding Sec Token Types (by batches).');
  // is order important? If not, can send multiple transactions at the same time
  const tokenTypesPromises = tokenTypesBatches.map((tokenTypeBatch, index) => 
    function addSecTokenTypeBatch(cb) {
      console.log(`Adding tokenTypeBatch ${index + 1}/${tokenTypesBatches.length}`);

      newContract_StLedgerFacet
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

  const hasSealed = await newContract_StMasterFacet.getContractSeal();
  console.log('Contract seal', hasSealed);

  if (!hasSealed) {
    // =================================================================
    // ============== load batches data to new contract ================
    // =================================================================
    const maxBatchId = await newContract_StLedgerFacet.getSecTokenBatch_MaxId();
    console.log(`Max batch id: ${maxBatchId}`);

    console.log('\n Loading Sec Tokens (by batches).');

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
            newContract_DataLoadableFacet
              .loadSecTokenBatch(batches, batchCount)
              .then((result) => cb(null, result))
              .catch((error) => cb(error));
          },
      );

    await series(batchesPromises);
    await sleep(1000);

    // =================================================================
    // ====================== Creating ledger entries ==================
    // =================================================================
    // This will create a ledger record that will contain only address, entity id, list of currencies with balances and 
    // total minted/burned tokens.
    // get entities by 
    const entitiesByAccount = {};
    const accountsWithEntities = {};
    for(let i = 0; i < data.accountEntities?.length || 0; i++) {
      const acc = data.whitelistAddresses[i];
      const entId = data.accountEntities[i];
      entitiesByAccount[acc] = entId;
      if(entId != 0) {
        accountsWithEntities[acc] = true;
      }
    }    

    // get current ledgers from new smart contract
    const ledgerOwners = await newContract_StLedgerFacet.getLedgerOwners();
    const ledgers = (await Promise.all(ledgerOwners.map((owner) => newContract_StLedgerFacet.getLedgerEntry(owner))))
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

  // get addresses that are already whitelisted in new smart contract
  const whitelistedAddresses = await newContract_StErc20Facet.getWhitelist();
  
  // load ledgers data to new contract
  const ledgerOwnersMap = {};
  let filteredLedgersWithOwners = [];

  for(let i = 0; i < data.ledgerOwners.length; i++) {
    const currLedgerOwner = data.ledgerOwners[i];
    ledgerOwnersMap[currLedgerOwner] = true;
    
    // adding a new ledger only if it not already added
    if(!ledgerOwners.includes(currLedgerOwner)) {
      // if there are no acocunt entities, then we assign 1 by default
      const entityId = entitiesByAccount[currLedgerOwner] || DEFAULT_ENTITY_ID;

      // found an entry for an account that is not whitelisted, it is an error
      if(!whitelistedAddresses.includes(currLedgerOwner)) {
          console.log(`ERROR! The ledger owner is not whitelisted: ${currLedgerOwner}`);
          process.exit();
      }

      filteredLedgersWithOwners.push({
        ledger: data.ledgers[i],
        owner: currLedgerOwner,
        // TODO: cannot set entities because some of the addresses are not whitelisted (ledger entry owner)
        // This should not be a problem on production data, but needs to be tested
        entityId: entityId == 0 ? DEFAULT_ENTITY_ID : entityId
      });
    }
  }

  let ledgersBatches = createBatches(filteredLedgersWithOwners, 20);

  console.log('\n Creating ledger entries.');
  const ledgersPromises = ledgersBatches.map((ledgerBatch, index) => 
    function createLedgerEntryBatch(cb) {
      console.log(`Creating ledger entry ${index + 1}/${ledgersBatches.length}`);

      newContract_DataLoadableFacet
        .createLedgerEntryBatch(ledgerBatch.map((obj) => {
          return {
            ledgerEntryOwner: obj.owner,
            ccys: obj.ledger.ccys,
            spot_sumQtyMinted: obj.ledger.spot_sumQtyMinted,
            spot_sumQtyBurned: obj.ledger.spot_sumQtyBurned,
            entityId: obj.entityId
          };
        }))
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  await series(ledgersPromises);
  await sleep(1000);

  // =================================================================
  // =========== Set entity ID for the remaining addresses ===========
  // =================================================================

  // checking which of the addresses already have entity id assigned
  const wlAddressesBatches = createBatches(data.whitelistAddresses, 20);
  const entitiesOfWlAddressesFuncs = [];
  for (let i = 0; i < wlAddressesBatches.length; i++) {
    entitiesOfWlAddressesFuncs.push(newContract_StLedgerFacet.getAccountEntityBatch.bind(this, wlAddressesBatches[i]));
  }
  
  let currAccountEntities = await retry(entitiesOfWlAddressesFuncs, 2000);
  currAccountEntities = currAccountEntities.flat();

  const currAccEntMap = {};
  for(let i = 0; i < currAccountEntities.length; i++) {
    currAccEntMap[data.whitelistAddresses[i]] = currAccountEntities[i];
  }
  
  // adding entity ids to those accounts, that have entity id but does not have a ledger
  const accsToBeAssignedEntities = [];
  for(let acc of Object.keys(accountsWithEntities)){
    if(!ledgerOwnersMap[acc] && currAccEntMap[acc] == 0) {
      accsToBeAssignedEntities.push({addr: acc, id: entitiesByAccount[acc]});
    }
  }

  let accountsWithEntIds = createBatches(accsToBeAssignedEntities, 50);

  const accEntPromises = accountsWithEntIds.map((accEntBatch, index) => 
    function setAccountEntityBatch(cb) {
      console.log(`Assigning entities for the remaining accounts ${index + 1}/${accountsWithEntIds.length}`);

      newContract_StErc20Facet.setAccountEntityBatch(accEntBatch)
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  await series(accEntPromises);
  await sleep(1000);
  
  // =================================================================
  // ========== Adding stId tokens (the one in ledgers only) =========
  // =================================================================
  let filteredTokens = [];

  // iterating through all ledgers from the backup data
  for(let i = 0; i < data.ledgers.length; i++) {
    const currLedger = data.ledgers[i];
    const owner = data.ledgerOwners[i];

    if (currLedger.tokens.length === 0) {
      continue;
    }

    // checking which tokens are already added in the new smart contract and filtering them out, so that they are not added again
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

  // fetching other addresses that can send the transactions
  const prms = [];
  for(let i = 0; i < 10; i++) {
    prms.push(await CONST.getAccountAndKey(i));
  }

  // getting other system accounts so that transactions could go similtaneously
  const addresses = prms.map((acc) => acc.addr);
  console.log('\n Adding Sec Tokens (from ledgers).');
  
  const tokensPromises = tokensWithOwnersBatches.map((tokenWithOwnerBatch, index) => 
    function addSecTokenBatch(cb) {
      const currAddr = addresses[index % 9 + 1];
      console.log(`addSecTokenBatch (from ledger) - ${index + 1}/${tokensWithOwnersBatches.length} from ${currAddr}`);

      newContract_DataLoadableFacet
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
        }),
        {from: currAddr})
        .then((ccy) => cb(null, ccy))
        .catch((error) => cb(error));
    },
  );

  await series(tokensPromises);
  await sleep(1000);
  
  // =================================================================
  // ======= Adding remaining stIds (that are not in ledgers) ======== 
  // =================================================================

  // getSecToken for all tokens
  // addSecTokenBatch
  // add globalSecTokens to new contract
  let allTokens = [];
  let tokensExist = [];
  let i = 0;
  const batches = createBatches(data.globalSecTokens, 50);
  
  do{
    try{
      console.log(`Checking if tokens exists (in batches) - ${i + 1}/${batches.length}`);
      const promises = batches[i].map((token) => newContract_StLedgerFacet.getSecToken(token.stId));
  
      const results = await Promise.all(promises);
      tokensExist = [...tokensExist, ...results]; // stIds that are already in the new smart contract

      i++;
    } catch(err) {
      console.log('Encountered an error, trying again...');
    }
  } while(i < batches.length);

  // iterating through globalSecTokens in the backed up data
  for(let i = 0; i < data.globalSecTokens.length; i++) {
    const token = data.globalSecTokens[i];

    const transferedFullSecTokensEvent = data.transferedFullSecTokensEvents.find(
      (event) => Number(event.stId) === Number(token.stId),
    );
  
    if (transferedFullSecTokensEvent) {
      console.log(`Found transferedFullSecTokensEvent for ${token.stId}`);
    }
  
    let exists = tokensExist[i];
    exists = helpers.decodeWeb3Object(exists).exists;

    allTokens.push({token, transferedFullSecTokensEvent, exists});
  }

  // filtering out those tokens that already exist in the new smart contract - no need to add them again
  allTokens = allTokens.filter((tokenObj) => !tokenObj.exists);
  let tokensBatches = createBatches(allTokens, 20);

  console.log('\n Adding Sec Tokens (Global) (not in ledgers).');
  const promises = tokensBatches.map((tokenBatch, index, allBatches) => 
    function addSecTokenBatch(cb) {
      const currAddr = addresses[index % 9 + 1];
      console.log(`addSecTokenBatch (global) (not in ledgers) - ${index + 1}/${allBatches.length} - from ${currAddr}`);

      newContract_DataLoadableFacet.addSecTokenBatch(
          tokenBatch.map((tokenObj) => {
            return {
              ledgerEntryOwner: '0x0000000000000000000000000000000000000000',
              batchId: tokenObj.token.batchId,
              stId: tokenObj.token.stId,
              tokTypeId: tokenObj.token.tokTypeId,
              mintedQty: Number(tokenObj.token.mintedQty),
              currentQty: Number(tokenObj.token.currentQty),
              ft_price: tokenObj.token.ft_price,
              ft_lastMarkPrice: tokenObj.token.ft_lastMarkPrice,
              ft_ledgerOwner: tokenObj.token.ft_ledgerOwner,
              ft_PL: tokenObj.token.ft_PL,
            }
          }),
          {from: currAddr}
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  await series(promises);
  await sleep(1000);

  // =================================================================
  // ======================= Setting totals data =====================
  // =================================================================
  await newContract_DataLoadableFacet.setTokenTotals(
    data.secTokenBaseId,
    toBN(data.secTokenMintedCount),
    toBN(data.secTokenMintedQty),
    toBN(data.secTokenBurnedQty),
  );

    await sleep(1000);

  // =================================================================
  // ==================== Setting fees for ccyTypes ==================
  // =================================================================

    let allCcyTypesWithFees = data.ccyFees.map((ccyFee, index) => {
      const entityId = entityIds.length === 0 ? DEFAULT_ENTITY_ID : entityIds[index % entityIds.length];
      return {
        ccyType: data.ccyTypes[Math.floor(index / (entityIds.length || 1))],
        fee: ccyFee,
        entityId
      }
    });

    // let allCcyTypesWithFees = data.ccyTypes.map((ccyType, index) => {
    //   return {
    //     ccyType,
    //     fee: data.ccyFees[index]
    //   }
    // });

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
      const currAddr = addresses[index % 9 + 1];
      console.log(`Setting fee for ccyTypes (in batch) - ${index + 1}/${ccyTypesBatches.length} from ${currAddr}`);

      newContract_StFeesFacet.setFee_CcyTypeBatch(
          tokenBatch.map((ccyTypeObj) => {
            return {
              entityId: ccyTypeObj.entityId,
              ccyTypeId: ccyTypeObj.ccyType.id,
              ledgerOwner: CONST.nullAddr,
              feeArgs: ccyTypeObj.fee
            }
          }),
          {from: currAddr}
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

  await series(ccyTypesPromises);
  await sleep(1000);

  // =================================================================
  // =================== Setting fees for tokenTypes =================
  // =================================================================

  let allTokenTypesWithFees = data.tokenFees.map((tokenFee, index) => {
    const entityId = entityIds.length === 0 ? DEFAULT_ENTITY_ID : entityIds[Math.floor(index / data.tokenTypes.length)];
    return {
      tokenType: data.tokenTypes[index % data.tokenTypes.length],
      fee: tokenFee,
      entityId
    }
  });

    // let allTokenTypesWithFees = data.tokenTypes.map((tokenType, index) => {
    //   return {
    //     tokenType,
    //     fee: data.tokenFees[index]
    //   }
    // });

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

      newContract_StFeesFacet.setFee_TokTypeBatch(
        tokTypeBatch.map((tokenTypeObj) => tokenTypeObj.entityId),
          tokTypeBatch.map((tokenTypeObj) => tokenTypeObj.tokenType.id),
          new Array(tokTypeBatch.length).fill(CONST.nullAddr),
          tokTypeBatch.map((tokenTypeObj) => tokenTypeObj.fee),
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    await series(tokTypesPromises);
    await sleep(1000);

    // =================================================================
    // ======== Setting fees for ccyTypes for ledger owners ============
    // =================================================================
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
      const currAddr = addresses[index % 9 + 1];
      console.log(`Setting fee for ccyTypes for owners (in batch) - ${index + 1}/${feesWithOwnerAndCcyTypesBatches.length} from ${currAddr}`);

      newContract_StFeesFacet.setFee_CcyTypeBatch(
          feesBatch.map((ccyTypeObj) => {
            return {
              entityId: 0,
              ccyTypeId: ccyTypeObj.ccyTypeId,
              ledgerOwner: ccyTypeObj.ledgerOwner,
              feeArgs: ccyTypeObj.fee
            }
          }),
          {from: currAddr}
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    await series(feeCcyTypePromises);
    await sleep(1000);

    // =================================================================
    // ======= Setting fees for tokentypes for ledger owners ===========
    // =================================================================

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
      const currAddr = addresses[index % 9 + 1];
      console.log(`Setting fee for tokenTypes for owners (in batch) - ${index + 1}/${feesWithOwnerAndTokenTypesBatches.length} - from ${currAddr}`);

      newContract_StFeesFacet.setFee_TokTypeBatch(
        new Array(feesBatch.length).fill(0),
          feesBatch.map((tokenTypeObj) => tokenTypeObj.tokenTypeId),
          feesBatch.map((tokenTypeObj) => tokenTypeObj.ledgerOwner),
          feesBatch.map((tokenTypeObj) => tokenTypeObj.fee),
          {from: currAddr}
        )
        .then((result) => cb(null, result))
        .catch((error) => cb(error));
    },
  );

    await series(feeTokenTypePromises);
    await sleep(1000);
  }

  // ============================================================================
  // == Sealing the contract and comparing the hashes with the original backup ==
  // ============================================================================

  if (!hasSealed) await newContract_StMasterFacet.sealContract();

  const backupData = await createBackupData([
    newContract_CcyCollateralizableFacet,
    newContract_DataLoadableFacet,
    newContract_OwnedFacet,
    newContract_StBurnableFacet,
    newContract_StErc20Facet,
    newContract_StFeesFacet,
    newContract_StLedgerFacet,
    newContract_StMasterFacet,
    newContract_StMintableFacet,
    newContract_StTransferableFacet
  ], newContractAddress, 0);

  const onChainLedgerHash = argv?.h === 'onchain';
  const ledgerHash = onChainLedgerHash
    ? await CONST.getLedgerHashcode(newContract_StTransferableFacet)
    : getLedgerHashOffChain(backupData.data, data.transferedFullSecTokensEvents, data.whitelistAddresses.length, data.entitiesWithFeeOwners === undefined);

  // write backup to json file
  const newBackupFile = path.join(dataDir, `${newContractAddress}.json`);
  console.log(`Writing backup to ${newBackupFile}`);
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
