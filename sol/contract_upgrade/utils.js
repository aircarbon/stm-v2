// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const { soliditySha3, hexToNumberString } = require('web3-utils');
const Web3 = require('web3');
const argv = require('yargs-parser')(process.argv.slice(2));
const fs = require('fs');
const path = require('path');

const CONST = require('../const');
const { helpers } = require('../../orm/build');
const config = require('../truffle-config');

const series = require('async/series');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// implement get ledger hash
// Refer to: getLedgerHashcode on LedgerLib.sol
function getLedgerHashOffChain(data, ignoreGlobalStIds = [], wlAddressesStopAtIdx, ignoreEntities = false) {
  console.log('getLedgerHashOffChain');
  // hash currency types & exchange currency fees
  let ledgerHash = '';
  const entitiesWithFeeOwners = data?.entitiesWithFeeOwners ?? [];
  const accountEntities = data?.accountEntities ?? [];
  const ccyTypes = data?.ccyTypes ?? [];
  const ccyFees = data?.ccyFees ?? [];
  for (let index = 0; index < ccyTypes.length; index++) {
    const ccyType = ccyTypes[index];
    ledgerHash = soliditySha3(ledgerHash, ccyType.id, ccyType.name, ccyType.unit, ccyType.decimals);
    if (
      Number(ccyFees[index]?.fee_fixed) ||
      Number(ccyFees[index]?.fee_percBips) ||
      Number(ccyFees[index]?.fee_min) ||
      Number(ccyFees[index]?.fee_max) ||
      Number(ccyFees[index]?.ccy_perMillion) ||
      Boolean(ccyFees[index]?.ccy_mirrorFee)
    ) {
      ledgerHash = soliditySha3(
        ledgerHash,
        ccyFees[index].fee_fixed,
        ccyFees[index].fee_percBips,
        ccyFees[index].fee_min,
        ccyFees[index].fee_max,
        ccyFees[index].ccy_perMillion,
        ccyFees[index].ccy_mirrorFee,
      );
    }

    // hash ledger owner fees for token type
    data.ledgerOwnersFees.forEach((ledgerOwnerFee) => {
      const fee = ledgerOwnerFee.currencies[index];
      if (
        Number(fee?.fee_fixed) ||
        Number(fee?.fee_percBips) ||
        Number(fee?.fee_min) ||
        Number(fee?.fee_max) ||
        Number(fee?.ccy_perMillion) ||
        Boolean(fee?.ccy_mirrorFee)
      ) {
        ledgerHash = soliditySha3(
          ledgerHash,
          fee.fee_fixed,
          fee.fee_percBips,
          fee.fee_min,
          fee.fee_max,
          fee.ccy_perMillion,
          fee.ccy_mirrorFee,
        );
      }
    });
  }
  console.log('ledger hash - hash currency types & exchange currency fees', ledgerHash);

  // hash token types & exchange token fees
  const tokenTypes = data?.tokenTypes ?? [];
  const tokenFees = data?.tokenFees ?? [];
  for (let index = 0; index < tokenTypes.length; index++) {
    const tokenType = tokenTypes[index];
    ledgerHash = soliditySha3(
      ledgerHash,
      tokenType.name,
      tokenType.settlementType,
      tokenType.ft.expiryTimestamp,
      tokenType.ft.underlyerTypeId,
      tokenType.ft.refCcyId,
      tokenType.ft.initMarginBips,
      tokenType.ft.varMarginBips,
      tokenType.ft.contractSize,
      tokenType.ft.feePerContract,
      tokenType.cashflowBaseAddr,
    );
    if (
      Number(tokenFees[index]?.fee_fixed) ||
      Number(tokenFees[index]?.fee_percBips) ||
      Number(tokenFees[index]?.fee_min) ||
      Number(tokenFees[index]?.fee_max) ||
      Number(tokenFees[index]?.ccy_perMillion) ||
      Boolean(tokenFees[index]?.ccy_mirrorFee)
    ) {
      ledgerHash = soliditySha3(
        ledgerHash,
        tokenFees[index].fee_fixed,
        tokenFees[index].fee_percBips,
        tokenFees[index].fee_min,
        tokenFees[index].fee_max,
        tokenFees[index].ccy_perMillion,
        tokenFees[index].ccy_mirrorFee,
      );
    }
    // hash ledger owner fees for token type
    data.ledgerOwnersFees.forEach((ledgerOwnerFee) => {
      const fee = ledgerOwnerFee.tokens[index];
      if (
        Number(fee?.fee_fixed) ||
        Number(fee?.fee_percBips) ||
        Number(fee?.fee_min) ||
        Number(fee?.fee_max) ||
        Number(fee?.ccy_perMillion) ||
        Boolean(fee?.ccy_mirrorFee)
      ) {
        ledgerHash = soliditySha3(
          ledgerHash,
          fee.fee_fixed,
          fee.fee_percBips,
          fee.fee_min,
          fee.fee_max,
          fee.ccy_perMillion,
          fee.ccy_mirrorFee,
        );
      }
    });
  }
  console.log('ledger hash - token types & exchange token fees', ledgerHash);

  // hash whitelist
  const whitelistAddresses = data?.whitelistAddresses ?? [];
  if (wlAddressesStopAtIdx) {
    for (let i = 0; i < wlAddressesStopAtIdx; i++) {
      ledgerHash = soliditySha3(ledgerHash, data?.whitelistAddresses[i]);
    }
  } else {
    whitelistAddresses.forEach((address) => {
      ledgerHash = soliditySha3(ledgerHash, address);
    });
  }

  console.log('ledger hash - whitelist', ledgerHash);

  // hash batches
  const batches = data?.batches ?? [];
  batches.forEach((batch) => {
    ledgerHash = soliditySha3(
      ledgerHash,
      batch.id,
      batch.mintedTimestamp,
      batch.tokTypeId,
      batch.mintedQty,
      batch.burnedQty,
      ...batch.metaKeys,
      ...batch.metaValues,
      batch.origTokFee.fee_fixed,
      batch.origTokFee.fee_percBips,
      batch.origTokFee.fee_min,
      batch.origTokFee.fee_max,
      batch.origTokFee.ccy_perMillion,
      batch.origTokFee.ccy_mirrorFee,
      batch.origCcyFee_percBips_ExFee,
      batch.originator,
    );
  });

  console.log('ledger hash - batches', ledgerHash);

  // hash ledgers
  const ledgers = data?.ledgers ?? [];
  const ledgerOwners = data?.ledgerOwners ?? [];
  for (let index = 0; index < ledgers.length; index++) {
    if (index !== 0) {
      ledgerHash = soliditySha3(ledgerHash, ledgerOwners[index]);
    }
    const legerEntry = ledgers[index];
    ledgerHash = soliditySha3(
      ledgerHash,
      legerEntry.spot_sumQty,
      legerEntry.spot_sumQtyMinted,
      legerEntry.spot_sumQtyBurned,
    );

    const ccys = legerEntry.ccys ?? [];
    ccys.forEach((ccy) => {
      ledgerHash = soliditySha3(ledgerHash, ccy.ccyTypeId, ccy.name, ccy.unit, ccy.balance, ccy.reserved);
    });

    const tokens = legerEntry.tokens ?? [];
    tokens.forEach((token) => {
      ledgerHash = soliditySha3(
        ledgerHash,
        token.stId,
        token.tokTypeId,
        token.tokTypeName,
        token.batchId,
        token.mintedQty,
        token.currentQty,
        token.ft_price,
        token.ft_ledgerOwner,
        token.ft_lastMarkPrice,
        token.ft_PL,
      );
    });
  }
  console.log('ledger hash - ledgers', ledgerHash);

  // hash secTokens
  const secTokens = data?.globalSecTokens ?? [];
  secTokens.forEach((token) => {
    if (ignoreGlobalStIds.length > 0) {
      const isExist = ignoreGlobalStIds.find((event) => Number(event.stId) === Number(token.stId));
      if (!isExist) {
        ledgerHash = soliditySha3(
          ledgerHash,
          token.stId,
          token.tokTypeId,
          token.tokTypeName,
          token.batchId,
          token.mintedQty,
          token.currentQty,
          token.ft_price,
          token.ft_ledgerOwner,
          token.ft_lastMarkPrice,
          token.ft_PL,
        );
      }
    } else {
      ledgerHash = soliditySha3(
        ledgerHash,
        token.stId,
        token.tokTypeId,
        token.tokTypeName,
        token.batchId,
        token.mintedQty,
        token.currentQty,
        token.ft_price,
        token.ft_ledgerOwner,
        token.ft_lastMarkPrice,
        token.ft_PL,
      );
    }
  });

  console.log('ledger hash - secTokens', ledgerHash);

  if(!ignoreEntities) {
    entitiesWithFeeOwners.forEach((entityWithFeeOwner) => {
      ledgerHash = soliditySha3(ledgerHash, entityWithFeeOwner.id, entityWithFeeOwner.addr)
    });
    
    console.log('ledger hash - accountEntities', ledgerHash);
  }

  if(!ignoreEntities) {
    accountEntities.forEach((entityId) => {
      ledgerHash = soliditySha3(ledgerHash, entityId)
    });
  }

  console.log('result', ledgerHash);
  return ledgerHash;
}

// This function will be used for creating backup data for OLD version STM contracts (like the one currently deployed to Polygon mainnet)
async function createBackupDataFromOldContract(contracts, contractAddress, contractType) {
  const owners = await contracts.getOwners();
  const unit = await contracts.unit();
  const symbol = await contracts.symbol();
  const decimals = await contracts.decimals();
  const network = argv?.network || 'development';
  const name = await contracts.name();
  const version = await contracts.version();
  console.log(`Contract address: ${contractAddress}`);
  console.log(`Name: ${name}`);
  console.log(`Version: ${version}`);

  // get all ccy and token types
  const ccyTypes = await contracts.getCcyTypes();
  const { ccyTypes: currencyTypes } = helpers.decodeWeb3Object(ccyTypes);

  const tokTypes = await contracts.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);

  // open contract file if exist
  let previousLedgersOwners;
  let previousGlobalFees;
  let previousLedgerOwnersFees;
  const dataFile = path.join(__dirname, `${name}.json`);
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log(`Previous data found: ${name}.json`, data);
    previousLedgersOwners = data.ledgerOwners;
    previousGlobalFees = data.globalFees;
    previousLedgerOwnersFees = data.ledgerOwnersFees;
  }

  // get ledgers
  const ledgerOwners = previousLedgersOwners || (await contracts.getLedgerOwners());

  // this is used due to Ganache limitations
  let ledgers = [];
  if(network === 'development') {
    for(let i = 0; i < ledgerOwners.length; i++) {
      ledgers.push(await contracts.getLedgerEntry(ledgerOwners[i]));
    }
  } else {
    ledgers = (await Promise.all(ledgerOwners.map((owner) => contracts.getLedgerEntry(owner))));
  }

  ledgers = ledgers
    .map((ledger) => helpers.decodeWeb3Object(ledger))
    .map((ledger, index, ledgers) => {
      return {
        ...ledger,
        ccys: ledgers[index].ccys.map((ccy) => ({
          ccyTypeId: ccy.ccyTypeId,
          name: ccy.name,
          unit: ccy.unit,
          balance: ccy.balance,
          reserved: ccy.reserved,
        })),
      };
    });

  if (!previousLedgerOwnersFees) {
    // fetch ledger owner fee for all currencies types and token types
    console.time('ledgerOwnersFeesPromises');

    let results = [];
    for(let i = 0; i < ledgerOwners.length; i++) {
      console.log(`#${i + 1}/${ledgerOwners.length} - getLedgerOwnersFees for ${ledgerOwners[i]}`);
      const ccyFeeFuncs = [];
      for (let index = 0; index < currencyTypes.length; index++) {
        ccyFeeFuncs.push(contracts.getFee.bind(this, CONST.getFeeType.CCY, currencyTypes[index].id, ledgerOwners[i]));
      }

      const tokenFeeFuncs = [];
      for (let index = 0; index < tokenTypes.length; index++) {
        tokenFeeFuncs.push(contracts.getFee.bind(this, CONST.getFeeType.TOK, tokenTypes[index].id, ledgerOwners[i]));
      }

      const ccyFeeFundBatches = createBatches(ccyFeeFuncs, 50);
      const tokenFeeFuncBatches = createBatches(tokenFeeFuncs, 50);

      let ccyFees = [];
      
      for(let batch of ccyFeeFundBatches) {
        const newResults = await retry(batch, 2000);
        ccyFees = [...ccyFees, ...newResults];
      }
      
      let tokenFees = [];
      for(let batch of tokenFeeFuncBatches) {
        const newResults = await retry(batch, 2000);
        tokenFees = [...tokenFees, ...newResults];
      }

      results.push({
        currencies: ccyFees.map((fee) => helpers.decodeWeb3Object(fee)),
        tokens: tokenFees.map((fee) => helpers.decodeWeb3Object(fee)),
      });
    }

    previousLedgerOwnersFees = results;
    console.timeEnd('ledgerOwnersFeesPromises');
  }

  // get all batches
  let batches = [];
  const maxBatchId = await contracts.getSecTokenBatch_MaxId();
  
  const funcs = [];
  for (let index = 1; index <= maxBatchId; index++) {
    funcs.push(contracts.getSecTokenBatch.bind(this, index));
  }

  const batchedFuncs = createBatches(funcs, 50);

  for(let batch of batchedFuncs) {
    const newResults = await retry(batch, 1000);
    batches = [...batches, ...newResults];
  }

  const whitelistAddresses = await contracts.getWhitelist();
  const secTokenBaseId = await contracts.getSecToken_BaseId();
  const secTokenMintedCount = await contracts.getSecToken_MaxId();
  const secTokenBurnedQty = await contracts.getSecToken_totalBurnedQty();
  const secTokenMintedQty = await contracts.getSecToken_totalMintedQty();

  // get all currency types fee
  let ccyFees;
  if (previousGlobalFees?.currencies) {
    ccyFees = previousGlobalFees.currencies;
  } else {
    const ccyFeePromise = [];
    for (let index = 0; index < currencyTypes.length; index++) {
      ccyFeePromise.push(contracts.getFee(CONST.getFeeType.CCY, currencyTypes[index].id, CONST.nullAddr));
    }
    ccyFees = await Promise.all(ccyFeePromise);
  }

  // get all token types fee
  let tokenFees;
  if (previousGlobalFees?.tokens) {
    tokenFees = previousGlobalFees.tokens;
  } else {
    const tokenFeePromise = [];
    for (let index = 0; index < tokenTypes.length; index++) {
      tokenFeePromise.push(contracts.getFee(CONST.getFeeType.TOK, tokenTypes[index].id, CONST.nullAddr));
    }
    tokenFees = await Promise.all(tokenFeePromise);
  }

  // get all stId
  const maxStId = Number(hexToNumberString(secTokenMintedCount));
  const existStId = [];
  ledgers.forEach((ledger) => {
    ledger.tokens.forEach((token) => {
      const stId = Number(token.stId);
      if (!existStId.includes(stId)) {
        existStId.push(stId);
      }
    });
  });

  const allFuncs = [];
  for (let index = 0; index < maxStId; index++) {
    if (!existStId.includes(index + 1)) {
      allFuncs.push(contracts.getSecToken.bind(this, index + 1));
    }
  }

  const funcBatches = createBatches(allFuncs, 50);
  let globalSecTokens = [];

  for(let i = 0; i < funcBatches.length; i++) {
    console.log(`#${i+1}/${funcBatches.length} - getSecToken`);
    const newResults = await retry(funcBatches[i], 1000);
    globalSecTokens = [...globalSecTokens, ...newResults];
  }

  // write backup to json file
  const backup = {
    info: {
      network,
      contractAddress,
      contractType,
      name,
      version,
      owners,
      symbol,
      unit,
      decimals,
    },
    data: {
      secTokenBaseId: hexToNumberString(secTokenBaseId),
      secTokenMintedCount: hexToNumberString(secTokenMintedCount),
      secTokenBurnedQty: hexToNumberString(secTokenBurnedQty),
      secTokenMintedQty: hexToNumberString(secTokenMintedQty),
      transferedFullSecTokensEvents: [],
      whitelistAddresses,
      ledgerOwners,
      ledgerOwnersFees: previousLedgerOwnersFees || [],
      ccyTypes: currencyTypes.map((ccy) => ({
        id: ccy.id,
        name: ccy.name,
        unit: ccy.unit,
        decimals: ccy.decimals,
      })),
      ccyFees: previousGlobalFees?.currencies ?? ccyFees.map((fee) => helpers.decodeWeb3Object(fee)),
      tokenTypes: tokenTypes.map((tok, index) => {
        return {
          ...tok,
          ft: {
            expiryTimestamp: tokTypes[0][index]['ft']['expiryTimestamp'],
            underlyerTypeId: tokTypes[0][index]['ft']['underlyerTypeId'],
            refCcyId: tokTypes[0][index]['ft']['refCcyId'],
            initMarginBips: tokTypes[0][index]['ft']['initMarginBips'],
            varMarginBips: tokTypes[0][index]['ft']['varMarginBips'],
            contractSize: tokTypes[0][index]['ft']['contractSize'],
            feePerContract: tokTypes[0][index]['ft']['feePerContract'],
          },
        };
      }),
      tokenFees: previousGlobalFees?.tokens ?? tokenFees.map((fee) => helpers.decodeWeb3Object(fee)),
      globalSecTokens: globalSecTokens.map((token) => helpers.decodeWeb3Object(token)),
      ledgers,
      batches: batches
        .map((batch) => helpers.decodeWeb3Object(batch))
        .map((batch, index) => {
          return {
            ...batch,
            origTokFee: {
              fee_fixed: batches[index]['origTokFee']['fee_fixed'],
              fee_percBips: batches[index]['origTokFee']['fee_percBips'],
              fee_min: batches[index]['origTokFee']['fee_min'],
              fee_max: batches[index]['origTokFee']['fee_max'],
              ccy_perMillion: batches[index]['origTokFee']['ccy_perMillion'],
              ccy_mirrorFee: batches[index]['origTokFee']['ccy_mirrorFee'],
            },
          };
        }),
    },
  };
  return backup;
}

// This function will be used for creating backup data for NEW version STM contracts
async function createBackupData(contracts, contractAddress, contractType) {
  const [
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
  ] = contracts;

  const owners = await newContract_OwnedFacet.getOwners();
  const deploymentOwner = await newContract_OwnedFacet.deploymentOwner();
  const unit = await newContract_StMasterFacet.unit();
  const symbol = await newContract_StErc20Facet.symbol();
  const decimals = await newContract_StErc20Facet.decimals();
  const network = argv?.network || 'development';
  const name = await newContract_StMasterFacet.name();
  const version = await newContract_StMasterFacet.version();
  console.log(`Contract address: ${contractAddress}`);
  console.log(`Name: ${name}`);
  console.log(`Version: ${version}`);

  // get entities with fee owners
  let entitiesWithFeeOwners = await newContract_StErc20Facet.getAllEntitiesWithFeeOwners();
  entitiesWithFeeOwners = entitiesWithFeeOwners.map((obj) => { return {id: obj.id, addr: obj.addr}; });

  const entities = entitiesWithFeeOwners.map((obj) => obj.id);

  // get all ccy and token types
  const ccyTypes = await newContract_CcyCollateralizableFacet.getCcyTypes();
  const { ccyTypes: currencyTypes } = helpers.decodeWeb3Object(ccyTypes);

  const tokTypes = await newContract_StLedgerFacet.getSecTokenTypes();
  const { tokenTypes } = helpers.decodeWeb3Object(tokTypes);

  // open contract file if exist
  let previousLedgersOwners;
  let previousGlobalFees;
  let previousLedgerOwnersFees;
  const dataFile = path.join(__dirname, `${name}.json`);
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log(`Previous data found: ${name}.json`, data);
    previousLedgersOwners = data.ledgerOwners;
    previousGlobalFees = data.globalFees;
    previousLedgerOwnersFees = data.ledgerOwnersFees;
  }

  // get address entities
  console.log('Retrieving account entities...');
  const wlAddresses = await newContract_StErc20Facet.getWhitelist();
  const wlAddressesBatches = createBatches(wlAddresses, 20);

  const entitiesOfWlAddressesFuncs = [];
  for (let i = 0; i < wlAddressesBatches.length; i++) {
    entitiesOfWlAddressesFuncs.push(newContract_StLedgerFacet.getAccountEntityBatch.bind(this, wlAddressesBatches[i]));
  }

  let accountEntities = await retry(entitiesOfWlAddressesFuncs, 2000);
  accountEntities = accountEntities.flat();

  // get ledgers
  const ledgerOwners = previousLedgersOwners || (await newContract_StLedgerFacet.getLedgerOwners());

  // this is used due to Ganache limitations
  let ledgers = [];
  if(network === 'development') {
    for(let i = 0; i < ledgerOwners.length; i++) {
      ledgers.push(await newContract_StLedgerFacet.getLedgerEntry(ledgerOwners[i]));
    }
  } else {
    ledgers = (await Promise.all(ledgerOwners.map((owner) => newContract_StLedgerFacet.getLedgerEntry(owner))));
  }

  ledgers = ledgers
    .map((ledger) => helpers.decodeWeb3Object(ledger))
    .map((ledger, index, ledgers) => {
      return {
        ...ledger,
        ccys: ledgers[index].ccys.map((ccy) => ({
          ccyTypeId: ccy.ccyTypeId,
          name: ccy.name,
          unit: ccy.unit,
          balance: ccy.balance,
          reserved: ccy.reserved,
        })),
      };
    });

  if (!previousLedgerOwnersFees) {
    // fetch ledger owner fee for all currencies types and token types for every user 
    // (passing entity id as 0 because it is optional when an address of a specific user is passed)
    console.time('ledgerOwnersFeesPromises');

    let results = [];
    for(let i = 0; i < ledgerOwners.length; i++) {
      const currLedgerOwner = ledgerOwners[i];
      console.log(`#${i + 1}/${ledgerOwners.length} - getLedgerOwnersFees for ${currLedgerOwner}`);
      const ccyFeeFuncs = [];
      for (let index = 0; index < currencyTypes.length; index++) {
        // workaround for a system account (null address)
        if(currLedgerOwner == CONST.nullAddr) {
          ccyFeeFuncs.push(async () => {return CONST.nullFees});  
        } else {
          ccyFeeFuncs.push(newContract_StFeesFacet.getFee.bind(this, CONST.getFeeType.CCY, 0, currencyTypes[index].id, currLedgerOwner));
        }
      }

      const tokenFeeFuncs = [];
      for (let index = 0; index < tokenTypes.length; index++) {
        // workaround for a system account (null address)
        if(currLedgerOwner == CONST.nullAddr) {
          ccyFeeFuncs.push(async () => {return CONST.nullFees});  
        } else {
          tokenFeeFuncs.push(newContract_StFeesFacet.getFee.bind(this, CONST.getFeeType.TOK, 0, tokenTypes[index].id, currLedgerOwner));
        }
      }

      const ccyFeeFundBatches = createBatches(ccyFeeFuncs, 50);
      const tokenFeeFuncBatches = createBatches(tokenFeeFuncs, 50);

      let ccyFees = [];
      
      for(let batch of ccyFeeFundBatches) {
        const newResults = await retry(batch, 2000);
        ccyFees = [...ccyFees, ...newResults];
      }
      
      let tokenFees = [];
      for(let batch of tokenFeeFuncBatches) {
        const newResults = await retry(batch, 2000);
        tokenFees = [...tokenFees, ...newResults];
      }

      results.push({
        currencies: ccyFees.map((fee) => helpers.decodeWeb3Object(fee)),
        tokens: tokenFees.map((fee) => helpers.decodeWeb3Object(fee)),
      });
    }

    previousLedgerOwnersFees = results;
    console.timeEnd('ledgerOwnersFeesPromises');
  }

  // get all batches
  let batches = [];
  const maxBatchId = await newContract_StLedgerFacet.getSecTokenBatch_MaxId();
  
  const funcs = [];
  for (let index = 1; index <= maxBatchId; index++) {
    funcs.push(newContract_StLedgerFacet.getSecTokenBatch.bind(this, index));
  }

  const batchedFuncs = createBatches(funcs, 50);

  for(let batch of batchedFuncs) {
    const newResults = await retry(batch, 1000);
    batches = [...batches, ...newResults];
  }

  const whitelistAddresses = await newContract_StErc20Facet.getWhitelist();
  const secTokenBaseId = await newContract_StLedgerFacet.getSecToken_BaseId();
  const secTokenMintedCount = await newContract_StLedgerFacet.getSecToken_MaxId();
  const secTokenBurnedQty = await newContract_StBurnableFacet.getSecToken_totalBurnedQty();
  const secTokenMintedQty = await newContract_StMintableFacet.getSecToken_totalMintedQty();

  // get all currency types fee
  let ccyFees;
  if (previousGlobalFees?.currencies) {
    ccyFees = previousGlobalFees.currencies;
  } else {
    const ccyFeePromise = [];
    for (let index = 0; index < currencyTypes.length; index++) {
      for(let entityId of entities) {
        ccyFeePromise.push(newContract_StFeesFacet.getFee(CONST.getFeeType.CCY, entityId, currencyTypes[index].id, CONST.nullAddr));
      }
    }
    // will be recorded in "ccyFees" field of the backup object
    ccyFees = await Promise.all(ccyFeePromise);
  }

  // get all token types fee
  let tokenFees;
  if (previousGlobalFees?.tokens) {
    tokenFees = previousGlobalFees.tokens;
  } else {
    const tokenFeePromise = [];
    for (let index = 0; index < tokenTypes.length; index++) {
      for(let entityId of entities) {
        tokenFeePromise.push(newContract_StFeesFacet.getFee(CONST.getFeeType.TOK, entityId, tokenTypes[index].id, CONST.nullAddr));
      }
    }
    // will be recorded in "tokenFees" field of the backup object
    tokenFees = await Promise.all(tokenFeePromise);
  }

  // get all stId
  const maxStId = Number(hexToNumberString(secTokenMintedCount));
  const existStId = [];
  ledgers.forEach((ledger) => {
    ledger.tokens.forEach((token) => {
      const stId = Number(token.stId);
      if (!existStId.includes(stId)) {
        existStId.push(stId);
      }
    });
  });

  const allFuncs = [];
  for (let index = 0; index < maxStId; index++) {
    if (!existStId.includes(index + 1)) {
      allFuncs.push(newContract_StLedgerFacet.getSecToken.bind(this, index + 1));
    }
  }

  const funcBatches = createBatches(allFuncs, 50);
  let globalSecTokens = [];

  for(let i = 0; i < funcBatches.length; i++) {
    console.log(`#${i+1}/${funcBatches.length} - getSecToken`);
    const newResults = await retry(funcBatches[i], 1000);
    globalSecTokens = [...globalSecTokens, ...newResults];
  }

  // write backup to json file
  const backup = {
    info: {
      network,
      contractAddress,
      contractType,
      name,
      version,
      owners,
      symbol,
      unit,
      decimals,
      deploymentOwner
    },
    data: {
      entitiesWithFeeOwners: entitiesWithFeeOwners,
      accountEntities,
      secTokenBaseId: hexToNumberString(secTokenBaseId),
      secTokenMintedCount: hexToNumberString(secTokenMintedCount),
      secTokenBurnedQty: hexToNumberString(secTokenBurnedQty),
      secTokenMintedQty: hexToNumberString(secTokenMintedQty),
      transferedFullSecTokensEvents: [],
      whitelistAddresses,
      ledgerOwners,
      ledgerOwnersFees: previousLedgerOwnersFees || [],
      ccyTypes: currencyTypes.map((ccy) => ({
        id: ccy.id,
        name: ccy.name,
        unit: ccy.unit,
        decimals: ccy.decimals,
      })),
      ccyFees: previousGlobalFees?.currencies ?? ccyFees.map((fee) => helpers.decodeWeb3Object(fee)),
      tokenTypes: tokenTypes.map((tok, index) => {
        return {
          ...tok,
          ft: {
            expiryTimestamp: tokTypes[0][index]['ft']['expiryTimestamp'],
            underlyerTypeId: tokTypes[0][index]['ft']['underlyerTypeId'],
            refCcyId: tokTypes[0][index]['ft']['refCcyId'],
            initMarginBips: tokTypes[0][index]['ft']['initMarginBips'],
            varMarginBips: tokTypes[0][index]['ft']['varMarginBips'],
            contractSize: tokTypes[0][index]['ft']['contractSize'],
            feePerContract: tokTypes[0][index]['ft']['feePerContract'],
          },
        };
      }),
      tokenFees: previousGlobalFees?.tokens ?? tokenFees.map((fee) => helpers.decodeWeb3Object(fee)),
      globalSecTokens: globalSecTokens.map((token) => helpers.decodeWeb3Object(token)),
      ledgers,
      batches: batches
        .map((batch) => helpers.decodeWeb3Object(batch))
        .map((batch, index) => {
          return {
            ...batch,
            origTokFee: {
              fee_fixed: batches[index]['origTokFee']['fee_fixed'],
              fee_percBips: batches[index]['origTokFee']['fee_percBips'],
              fee_min: batches[index]['origTokFee']['fee_min'],
              fee_max: batches[index]['origTokFee']['fee_max'],
              ccy_perMillion: batches[index]['origTokFee']['ccy_perMillion'],
              ccy_mirrorFee: batches[index]['origTokFee']['ccy_mirrorFee'],
            },
          };
        }),
    },
  };
  return backup;
}

const createBatches = (arr, batchSize = 1) => {
  let result = [];

  for(let i = 0; i < Math.ceil(arr.length / batchSize); i++) {
    const start = batchSize * i;
    const finish = batchSize * (i + 1); // not including

    const currLedgers = arr.slice(start, finish);
    result.push(currLedgers);
  }

  return result;
}

// funcs - array of functions
function retry(funcs, delay) {
  const currFunc = async(funcBatch) => {
    const promises = [];
    for(let func of funcBatch) {
      promises.push(func());
    }
    return Promise.all(promises);
  }

  const operation = currFunc.bind(this, funcs);
  return operation().catch(function(reason) {
    console.log(reason);
    console.log('Error, retrying...');
    return sleep(delay).then(retry.bind(null, funcs, delay));
  });
}

exports.getLedgerHashOffChain = getLedgerHashOffChain;
exports.createBackupData = createBackupData;
exports.createBatches = createBatches;
exports.createBackupDataFromOldContract = createBackupDataFromOldContract;
exports.retry = retry;
