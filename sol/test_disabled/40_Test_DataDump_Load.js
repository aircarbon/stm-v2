// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: (all) - esp. DataLoadable.sol => LoadLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const OwnedFacet = artifacts.require('OwnedFacet');
const StMintableFacet = artifacts.require('StMintableFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const DiamondCutFacet = artifacts.require('DiamondCutFacet');
const DataLoadableFacet = artifacts.require('DataLoadableFacet');
const StBurnableFacet = artifacts.require('StBurnableFacet');

const chalk = require('chalk');
const _ = require('lodash');
const CONST = require('../const.js');

contract("DiamondProxy", accounts => {
    let stm_cur, stm_new;

    let stmStMasterFacet_curr;
    let stmStErc20Facet_curr;
    let stmCcyCollateralizableFacet_curr;
    let stmStLedgerFacet_curr;
    let stmStFeesFacet_curr;
    let stmOwnedFacet_curr;
    let stmStMintableFacet_curr;
    let stmStTransferableFacet_curr;
    let stmStBurnableFacet_curr;
    
    let stmStMasterFacet_new;
    let stmStErc20Facet_new;
    let stmCcyCollateralizableFacet_new;
    let stmStLedgerFacet_new;
    let stmStFeesFacet_new;
    let stmStTransferableFacet_new;
    let stmDataLoadableFacet_new;

    before(async function () {  
        stm_cur = await st.deployed();
        const addr_curr = stm_cur.address;

        stmStMasterFacet_curr = await StMasterFacet.at(addr_curr);
        stmStErc20Facet_curr = await StErc20Facet.at(addr_curr);
        stmCcyCollateralizableFacet_curr = await CcyCollateralizableFacet.at(addr_curr);
        stmStLedgerFacet_curr = await StLedgerFacet.at(addr_curr);
        stmStFeesFacet_curr = await StFeesFacet.at(addr_curr);
        stmOwnedFacet_curr = await OwnedFacet.at(addr_curr);
        stmStMintableFacet_curr = await StMintableFacet.at(addr_curr);
        stmStTransferableFacet_curr = await StTransferableFacet.at(addr_curr);
        stmStBurnableFacet_curr = await StBurnableFacet.at(addr_curr);

        if (await stmStMasterFacet_curr.getContractType() != CONST.contractType.COMMODITY) this.skip();
        
        console.log(`stm_cur: @${addr_curr} ledgerHash=${await CONST.getLedgerHashcode(stmStTransferableFacet_curr)} / ${await stmStMasterFacet_curr.name()} ${await stmStMasterFacet_curr.version()}`);
        
        // deploying new contract
        stm_new = await st.new(accounts[0], DiamondCutFacet.address);
        const addr_new = stm_new.address;
        const stmDiamondCut = await DiamondCutFacet.at(addr_new);

        // cuttin Owners Facet
        const owners = await stmOwnedFacet_curr.getOwners();
        const custodyType = await stmOwnedFacet_curr.custodyType();
        let abi = CONST.getAbi('OwnedFacet');
        const ownedInitCalldata = web3.eth.abi.encodeFunctionCall(
            abi.find((func) => func.name === 'init'), 
            [owners, custodyType]
        );

        await stmDiamondCut.diamondCut([
            {
                facetAddress: OwnedFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('OwnedFacet', ['init'])
            }
        ], OwnedFacet.address, ownedInitCalldata);

        // cutting StErc20Facet
        abi = CONST.getAbi('StErc20Facet');
        const newSymbol = await stmStErc20Facet_curr.symbol();
        const newDecimal = await stmStErc20Facet_curr.decimals();
        const sterc20InitCalldata = web3.eth.abi.encodeFunctionCall(
            abi.find((func) => func.name === 'init'), 
            [newSymbol, newDecimal]
        );

        await stmDiamondCut.diamondCut([
            {
                facetAddress: StErc20Facet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StErc20Facet', ['init'])
            }
        ], StErc20Facet.address, sterc20InitCalldata);

        // cutting StMasterFacet
        const contractName = `${await stmStMasterFacet_curr.name()}_V++`;
        const contractType = await stmStMasterFacet_curr.getContractType();
        const contractVersion = `${await stmStMasterFacet_curr.version()}_V++`;
        const contractUnit = await stmStMasterFacet_curr.unit();

        abi = CONST.getAbi('StMasterFacet');
        const masterInitCalldata = web3.eth.abi.encodeFunctionCall(
            abi.find((func) => func.name === 'init'), 
            [contractType, contractName, contractVersion, contractUnit]
        );

        await stmDiamondCut.diamondCut([
            {
                facetAddress: StMasterFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StMasterFacet', ['init'])
            }
        ], StMasterFacet.address, masterInitCalldata);

        // cutting All other facets
        const diamondCutParams = [
            {
                facetAddress: CcyCollateralizableFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('CcyCollateralizableFacet')
            },
            {
                facetAddress: DataLoadableFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('DataLoadableFacet')
            },
            {
                facetAddress: StFeesFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StFeesFacet')
            },
            {
                facetAddress: StLedgerFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StLedgerFacet')
            },
            {
                facetAddress: StTransferableFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StTransferableFacet')
            },

            ////////////////////// CAN BE DELETED AFTER DEBUGGING (START)
            {
                facetAddress: StMintableFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StMintableFacet')
            },
            {
                facetAddress: StBurnableFacet.address,
                action: CONST.FacetCutAction.Add,
                functionSelectors: CONST.getContractsSelectors('StBurnableFacet')
            },
            ////////////////////// CAN BE DELETED AFTER DEBUGGING (FINISH)
            
        ];
        await stmDiamondCut.diamondCut(diamondCutParams, CONST.nullAddr, "0x");
        
        stmStMasterFacet_new = await StMasterFacet.at(addr_new);
        stmStErc20Facet_new = await StErc20Facet.at(addr_new);
        stmCcyCollateralizableFacet_new = await CcyCollateralizableFacet.at(addr_new);
        stmStLedgerFacet_new = await StLedgerFacet.at(addr_new);
        stmStFeesFacet_new = await StFeesFacet.at(addr_new);
        stmStTransferableFacet_new = await StTransferableFacet.at(addr_new);
        stmDataLoadableFacet_new = await DataLoadableFacet.at(addr_new);

        console.log(`stm_new: @${addr_new} ledgerHash=${await CONST.getLedgerHashcode(stmStTransferableFacet_new)} / ${await stmStMasterFacet_new.name()} ${await stmStMasterFacet_new.version()}`);
    });

    it(`data dump - should be able to read without gas fees`, async () => {
        var curHash = await CONST.getLedgerHashcode(stmStTransferableFacet_curr);
        const ctd = await stmCcyCollateralizableFacet_curr.getCcyTypes();
        const std = await stmStLedgerFacet_curr.getSecTokenTypes();
        const whitelist = await stmStErc20Facet_curr.getWhitelist();
        const allLedgerOwners = await stmStLedgerFacet_curr.getLedgerOwners();
        const ledgerEntry = await stmStLedgerFacet_curr.getLedgerEntry(accounts[0]);
//#if process.env.CONTRACT_TYPE === 'CASHFLOW_CONTROLLER' || process.env.CONTRACT_TYPE === 'CASHFLOW_BASE'
//#         const cashflowData = await stm_cur.getCashflowData();
//#endif
    });

    it(`data dump - should be able to set (and then read) all contract data`, async function () {
        if (await stmStMasterFacet_curr.getContractType() == CONST.contractType.CASHFLOW_BASE) this.skip();
        const WHITELIST_COUNT = 11;
        const TEST_ADDR_COUNT = 2;
        var curHash = await CONST.getLedgerHashcode(stmStTransferableFacet_curr);

        // whitelist
        //for (let i=0 ; i < WHITELIST_COUNT + 1; i++)
        //    await stm_cur.whitelist(accounts[i]);
        await stmStErc20Facet_curr.whitelistMany(accounts.slice(0,WHITELIST_COUNT));
        const whitelist = await stmStErc20Facet_curr.getWhitelist();
        console.log(`Whitelist: ${whitelist.join(', ')}`);
        curHash = await checkHashUpdate(curHash);
        stmStMasterFacet_curr.sealContract();
        await stmStErc20Facet_curr.createEntity({id: 1, addr: CONST.nullAddr});

        // ccy types
        await stmCcyCollateralizableFacet_curr.addCcyType('TEST_CCY_TYPE', 'TEST_UNIT', 42);
        const ccyTypes = await stmCcyCollateralizableFacet_curr.getCcyTypes();
        console.log(`Ccy Types: ${ccyTypes.ccyTypes.map(p => p.name).join(', ')}`);
        curHash = await checkHashUpdate(curHash);

        // token types (spot & future)
        const tokTypes = await stmStLedgerFacet_curr.getSecTokenTypes();
        console.log(`St Types: ${tokTypes.tokenTypes.map(p => p.name).join(', ')}`);
        var FT;
        if (await stmStMasterFacet_curr.getContractType() == CONST.contractType.COMMODITY) {
            
            // add spot type
            await stmStLedgerFacet_curr.addSecTokenType('NEW_TOK_SPOT_TYPE', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr, { from: accounts[0] });
            // adding second token type because futures no longer suported and this test requires two token types
            await stmStLedgerFacet_curr.addSecTokenType('NEW_TOK_SPOT_TYPE2', CONST.settlementType.SPOT, CONST.nullFutureArgs, CONST.nullAddr, { from: accounts[0] });
            
            // FT - add future type
            // const spotTypes = tokTypes.tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT);
            // const ccyTypes = (await stmCcyCollateralizableFacet_curr.getCcyTypes()).ccyTypes;
            // await stmStLedgerFacet_curr.addSecTokenType('NEW_TOK_FT_TYPE', CONST.settlementType.FUTURE, {
            //     expiryTimestamp: DateTime.local().toMillis(),
            //     underlyerTypeId: spotTypes[0].id, 
            //            refCcyId: ccyTypes[0].id,
            //      initMarginBips: 1000,
            //       varMarginBips: 500,
            //        contractSize: 1,
            //      feePerContract: 0,
            // }, CONST.nullAddr );
            // curHash = await checkHashUpdate(curHash);
            // FT = (await stm_cur.getSecTokenTypes()).tokenTypes.filter(p => p.settlementType == CONST.settlementType.FUTURE)[0];

            // // FT - update future variation margin
            // await stm_cur.setFuture_VariationMargin(FT.id, 600);
            // curHash = await checkHashUpdate(curHash);

            // // FT - update future fee per contract
            // await stm_cur.setFuture_FeePerContract(FT.id, 1);
            // curHash = await checkHashUpdate(curHash);
        }

        // allocate next whitelist entry
        //const wl = await stm_cur.getWhitelistNext();
        //await stm_cur.incWhitelistNext();

        // exchange fee - ccy's
        for (let i=0 ; i < ccyTypes.ccyTypes.length; i++) {
            const ccyType = ccyTypes.ccyTypes[i];
            const setFee = await stmStFeesFacet_curr.setFee_CcyType(1, ccyType.id, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: i+1, fee_percBips: (i+1)*100, fee_min: (i+1), fee_max: (i+1+100) } );
            const x = await stmStFeesFacet_curr.getFee(CONST.getFeeType.CCY, 1, ccyType.id, CONST.nullAddr);
            console.log(`Exchange Fee: ccyTypeId=${ccyType.id} { x.fee_fixed=${x.fee_fixed} / x.fee_percBips=${x.fee_percBips} / x.fee_min=${x.fee_min} / x.fee_max=${x.fee_max} }`);
            curHash = await checkHashUpdate(curHash);
        }

        // exchange fee - tok's
        for (let i=0 ; i < tokTypes.tokenTypes.length; i++) {
            const tokType = tokTypes.tokenTypes[i];
            const setFee = await stmStFeesFacet_curr.setFee_TokType(1, tokType.id, CONST.nullAddr, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: i+1, fee_percBips: (i+1)*100, fee_min: (i+1), fee_max: (i+1+100) } );
            const x = await stmStFeesFacet_curr.getFee(CONST.getFeeType.TOK, 1, tokType.id, CONST.nullAddr);
            console.log(`Exchange Fee: tokType=${tokType.id} { x.fee_fixed=${x.fee_fixed} / x.fee_percBips=${x.fee_percBips} / x.fee_min=${x.fee_min} / x.fee_max=${x.fee_max} }`);
            curHash = await checkHashUpdate(curHash);
        }

        //
        // populate test data: spot minting/burning, batch fees & transfers
        //
        const MM = [];
        await stmStErc20Facet_curr.setAccountEntity({id: 1, addr: accounts[0]});
        for (let i=1 ; i <= TEST_ADDR_COUNT ; i++) {

            const M = accounts[i];
            await stmStErc20Facet_curr.setAccountEntity({id: 1, addr: M});
            console.log('minting, setting fees, trading & burning: for account... ', M);

            MM.push(M);
            const batchFee = { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: i+1, fee_percBips: (i+1)*100, fee_min: (i+1), fee_max: (i+1+100) };
            const metaKVPs = [
                { k: `DATADUMP_TEST_${i+1}`,        v: `${i+1}` },
                { k: `DATADUMP_TEST2_${(i+1)*100}`, v: `${(i+1)*100}` },
            ];
            
            // mint
            const mintTx_B1 = await stmStMintableFacet_curr.mintSecTokenBatch(
                CONST.tokenType.TOK_T1, 1000 * (i+1), 1, M, batchFee, 100,
                metaKVPs.map(p => p.k), metaKVPs.map(p => p.v),
                //0,
            );
            curHash = await checkHashUpdate(curHash);
            if (await stmStMasterFacet_curr.getContractType() == CONST.contractType.COMMODITY) {
                const mintTx_B2 = await stmStMintableFacet_curr.mintSecTokenBatch(
                    CONST.tokenType.TOK_T2, 10000 * (i+1), 1, M, batchFee, 100, metaKVPs.map(p => p.k), metaKVPs.map(p => p.v),
                    //0,
                );
                curHash = await checkHashUpdate(curHash);
            }
            const batchId = (await stmStLedgerFacet_curr.getSecTokenBatch_MaxId.call()).toNumber();
            
            // add batch metadata
            const addBatchKvpTx = await stmStMintableFacet_curr.addMetaSecTokenBatch(batchId, "NEW_KEY", "NEW_VALUE");
            curHash = await checkHashUpdate(curHash);

            // modify batch token fee
            const modifiedBatchFee = _.cloneDeep(batchFee);
            modifiedBatchFee.fee_percBips = batchFee.fee_percBips / 2;
            const modifyBatchTokenFeeTx = await stmStMintableFacet_curr.setOriginatorFeeTokenBatch(batchId, modifiedBatchFee);
            curHash = await checkHashUpdate(curHash);

            // modify batch ccy fee
            const modifyBatchCcyFeeTx = await stmStMintableFacet_curr.setOriginatorFeeCurrencyBatch(batchId, 50);
            curHash = await checkHashUpdate(curHash);

            // transfer tokens to owner - batch 1 CORSIA, no fees
            const send_tx_B1 = await stmStTransferableFacet_curr.transferOrTrade({ 
                        ledger_A: M,                            ledger_B: accounts[0], 
                           qty_A: 200,                       tokTypeId_A: CONST.tokenType.TOK_T1, 
                           qty_B: 0,                         tokTypeId_B: 0, 
                       k_stIds_A: [],                          k_stIds_B: [],
                    ccy_amount_A: 0,                         ccyTypeId_A: 0, 
                    ccy_amount_B: 0,                         ccyTypeId_B: 0, 
                       applyFees: false,
                    feeAddrOwner_A: CONST.nullAddr,
                    feeAddrOwner_B: CONST.nullAddr,
                    transferType: CONST.transferType.OTHER_FEE1,
                },
            );
            curHash = await checkHashUpdate(curHash);

            // transfer tokens to owner - batch 2 NATURE, with fees
            if (await stmStMasterFacet_curr.getContractType() == CONST.contractType.COMMODITY) {
                    const send_tx_B2 = await stmStTransferableFacet_curr.transferOrTrade({ 
                         ledger_A: M,                            ledger_B: accounts[0], 
                            qty_A: 100,                       tokTypeId_A: CONST.tokenType.TOK_T2, 
                            qty_B: 0,                         tokTypeId_B: 0, 
                        k_stIds_A: [],                          k_stIds_B: [],
                     ccy_amount_A: 0,                         ccyTypeId_A: 0, 
                     ccy_amount_B: 0,                         ccyTypeId_B: 0, 
                        applyFees: true,
                   feeAddrOwner_A: CONST.nullAddr,
                   feeAddrOwner_B: CONST.nullAddr,
                     transferType: CONST.transferType.OTHER_FEE2,
                    },
                );
                curHash = await checkHashUpdate(curHash);
            }

            // burn - parital, CORSIA
            const burn_tx_B1 = await stmStBurnableFacet_curr.burnTokens(M, CONST.tokenType.TOK_T1, 1, []);
            curHash = await checkHashUpdate(curHash);

            // burn - full, batch 2 NATURE
            const burn_tx_B2 = await stmStBurnableFacet_curr.burnTokens(M, CONST.tokenType.TOK_T2, 100, []);
            curHash = await checkHashUpdate(curHash);

        }

        const batchCount = await stmStLedgerFacet_curr.getSecTokenBatch_MaxId.call();
        for (let i=1 ; i <= batchCount; i++) { // read all
            const x = await stmStLedgerFacet_curr.getSecTokenBatch(i);
            console.log(`Batch Data: id=${i} mintedQty=${x.mintedQty} burnedQty=${x.burnedQty} metaKeys=${x.metaKeys.join()} metaValues=${x.metaValues.join()} { x.fee_fixed=${x.origTokFee.fee_fixed} / x.fee_percBips=${x.origTokFee.fee_percBips} / x.fee_min=${x.origTokFee.fee_min} / x.fee_max=${x.origTokFee.fee_max} }`);
        }

        //
        // populate test data 2: fund, withdraw, ccy & tok fees, futures
        //
        const entryCount = await stmStLedgerFacet_curr.getLedgerOwnerCount(); // DATA_DUMP: individual fetches
        const allEntries = await stmStLedgerFacet_curr.getLedgerOwners(); // ## NON-PAGED - x-ref check
        assert(allEntries.length == entryCount, 'getLedgerOwnerCount / getLedgerOwners mismatch');
        for (let j=0 ; j < entryCount; j++) {
            const entryOwner = await stmStLedgerFacet_curr.getLedgerOwner(j);
            console.log('funding, withdrawing, setting ledger ccy, token fees & future init margin override, spot trading & opening futures positions: for account... ', entryOwner);

            // for all ccy types
            for (let i=0 ; i < ccyTypes.ccyTypes.length; i++) { // test ccy data 
                const ccyType = ccyTypes.ccyTypes[i];
            
                const FUND = (j+1)*100000+(i+1), RESERVE = Math.ceil(FUND / 2), WITHDRAW = Math.ceil(FUND / 4);

                // fund 
                await stmCcyCollateralizableFacet_curr.fundOrWithdraw(CONST.fundWithdrawType.FUND, ccyType.id, FUND, entryOwner, 'TEST');
                if (entryOwner != accounts[0]) curHash = await checkHashUpdate(curHash);

                // reserve 
                // commented out because it is for futures
                // await stm_cur.setReservedCcy(ccyType.id, RESERVE, entryOwner);
                // if (entryOwner != accounts[0]) curHash = await checkHashUpdate(curHash);

                // withdraw 
                await stmCcyCollateralizableFacet_curr.fundOrWithdraw(CONST.fundWithdrawType.WITHDRAW, ccyType.id, WITHDRAW, entryOwner, 'TEST');
                if (entryOwner != accounts[0]) curHash = await checkHashUpdate(curHash);

                // set ledger ccy fee
                await stmStFeesFacet_curr.setFee_CcyType(1, ccyType.id, entryOwner, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: i+2+j+2, fee_percBips: (i+2+j+2)*100, fee_min: (i+2+j+2), fee_max: (i+2+j+2+100) } );
                if (entryOwner != accounts[0]) curHash = await checkHashUpdate(curHash);
            }

            // spot trade
            if (entryOwner != accounts[0]) {
                await stmCcyCollateralizableFacet_curr.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, 1000, accounts[0], 'TEST');
                 const tradeTx = await stmStTransferableFacet_curr.transferOrTrade({ 
                        ledger_A: entryOwner,                   ledger_B: accounts[0], 
                           qty_A: 1,                         tokTypeId_A: CONST.tokenType.TOK_T1, 
                           qty_B: 0,                         tokTypeId_B: 0, 
                       k_stIds_A: [],                          k_stIds_B: [],
                    ccy_amount_A: 0,                         ccyTypeId_A: 0, 
                    ccy_amount_B: 1,                         ccyTypeId_B: CONST.ccyType.USD,
                       applyFees: true,
                    feeAddrOwner_A: CONST.nullAddr,
                    feeAddrOwner_B: CONST.nullAddr,
                    transferType: CONST.transferType.UNDEFINED,
                });
                //truffleAssert.prettyPrintEmittedEvents(tradeTx);
                curHash = await checkHashUpdate(curHash);
            }

            // for all token types
            for (let k=0 ; k < tokTypes.tokenTypes.length; k++) {
                // set ledger token fee
                const tokType = tokTypes.tokenTypes[k];
                
                if (tokType.settlementType == CONST.settlementType.SPOT) {
                    await stmStFeesFacet_curr.setFee_TokType(1, tokType.id, entryOwner, { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: k+4+j+4, fee_percBips: (k+4+j+4)*100, fee_min: (k+4+j+4), fee_max: (k+4+j+4+100) } );
                    if (entryOwner != accounts[0]) curHash = await checkHashUpdate(curHash);
                }
            }

            // if (entryOwner != accounts[0]) {
                // FT - override initial margin
                // commented out because related to futures
                // await stm_cur.setLedgerOverride(1, FT.id, entryOwner, j+1); //await stm_cur.initMarginOverride(FT.id, entryOwner, j+1);
                // curHash = await checkHashUpdate(curHash);

                // FT - override fee per contract
                // commented out because related to futures
                // await stm_cur.setLedgerOverride(2, FT.id, entryOwner, j+42); //await stm_cur.feePerContractOverride(FT.id, entryOwner, j+42);
                // curHash = await checkHashUpdate(curHash);

                // FT - open futures position
                // commented out because related to futures
                // const openFtPosTx = await stm_cur.openFtPos({ 
                //     tokTypeId: FT.id,
                //      ledger_A: entryOwner,
                //      ledger_B: accounts[0],
                //         qty_A: +1, // * ((j+1) * 10),
                //         qty_B: -1, // * ((j+1) * 10),
                //         price: j+1,
                // });
                //truffleAssert.prettyPrintEmittedEvents(openFtPosTx);
                // const x = await futuresHelper.openFtPos({ stm: stm_cur, accounts,
                //     tokTypeId: FT.id,
                //      ledger_A: entryOwner,
                //      ledger_B: accounts[0],
                //         qty_A: +1,
                //         qty_B: -1,
                //         price: j+1
                // });
                // curHash = await checkHashUpdate(curHash);
                // const longStId = Number(await stmStLedgerFacet_curr.getSecToken_MaxId()) - 0;
                // const shortStId = Number(await stmStLedgerFacet_curr.getSecToken_MaxId()) - 1;

                // FT - run one settlement cycle
                // commented out because related to futures
                // await stm_cur.takePay2(FT.id, shortStId, j+2/*markPrice*/, 1/*feePerSide*/);
                // await stm_cur.takePay2(FT.id, longStId,  j+2/*markPrice*/, 1/*feePerSide*/);
            // }
        }
    });

    it(`data load - should be able to initialize a new contract with data from old`, async () => {

        const whitelisted = await stmStErc20Facet_new.getWhitelist();

        //
        // cashflow data: args are set in new contract ctor()
        // todo: remaining cashflow data (need StDataLoadable support...)
        //...

        // load ccy & token types
        const curCcys = await stmCcyCollateralizableFacet_curr.getCcyTypes(), newCcys = await stmCcyCollateralizableFacet_new.getCcyTypes(), loadCcys = _.differenceWith(curCcys.ccyTypes, newCcys.ccyTypes, _.isEqual);
        _.forEach(loadCcys, async (p) => await stmCcyCollateralizableFacet_new.addCcyType(p.name, p.unit, p.decimals));

        const curToks = await stmStLedgerFacet_curr.getSecTokenTypes(), newToks = await stmStLedgerFacet_new.getSecTokenTypes(), loadToks = _.differenceWith(curToks.tokenTypes, newToks.tokenTypes, _.isEqual);
        _.forEach(loadToks, async (p) => await stmStLedgerFacet_new.addSecTokenType(p.name, p.settlementType, p.ft, p.cashflowBaseAddr));
        
        // load whitelist
        await stmStErc20Facet_new.whitelistMany([accounts[555]]); // simulate a new contract owner (first whitelist entry, by convention) -- i.e. we can upgrade contract with a new privkey
        const curWL = (await stmStErc20Facet_curr.getWhitelist()), newWL = (await stmStErc20Facet_new.getWhitelist()), loadWL = _.differenceWith(curWL.slice(1), newWL.slice(1), _.isEqual);
        //_.forEach(loadWL, async (p) => await stm_new.whitelist(p));
        await stmStErc20Facet_new.whitelistMany(loadWL);
        await stmStErc20Facet_new.whitelistMany([accounts[0]]);
        await stmStErc20Facet_new.createEntity({id: 1, addr: CONST.nullAddr});

        // set whitelist index
        //stm_new.setWhitelistNextNdx(await stm_cur.getWhitelistNextNdx());

        // currencies - load exchange fees, set total funded & withdrawn
        _.forEach(curCcys.ccyTypes, async (p) => { 
            await stmStFeesFacet_new.setFee_CcyType(1, p.id, CONST.nullAddr, (await stmStFeesFacet_curr.getFee(CONST.getFeeType.CCY, 1, p.id, CONST.nullAddr)));
            
            // 24k
            // await stm_new.setCcyTotals(p.id, 
            //     (await stm_cur.getTotalCcyFunded(p.id)),
            //     (await stm_cur.getTotalCcyWithdrawn(p.id)),
            //     (await stm_cur.getCcy_totalTransfered(p.id)),
            //     (await stm_cur.getCcy_totalExchangeFeesPaid(p.id)));
        });

        // spot tokens - load exchange fees
        _.forEach(curToks.tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT), async (p) => { 
            await stmStFeesFacet_new.setFee_TokType(1, p.id, CONST.nullAddr, (await stmStFeesFacet_curr.getFee(CONST.getFeeType.TOK, 1, p.id, CONST.nullAddr)));
        });

        // load batches
        const curBatchCount = await stmStLedgerFacet_curr.getSecTokenBatch_MaxId();
        const curBatches = [];
        for (let batchId=1; batchId <= curBatchCount; batchId++) curBatches.push(await stmStLedgerFacet_curr.getSecTokenBatch(batchId));
        for (let p of _.chunk(curBatches, 2)) { // ** tune chunk size
            await stmDataLoadableFacet_new.loadSecTokenBatch(p, curBatchCount);
        }

        // create ledger entries, add tokens, fees & balances
        const curEntryCount = await stmStLedgerFacet_curr.getLedgerOwnerCount();
        for (let i=0 ; i < curEntryCount; i++) {
            const curEntryOwner = await stmStLedgerFacet_curr.getLedgerOwner(i);
            const curEntry = await stmStLedgerFacet_curr.getLedgerEntry(curEntryOwner);

            // create ledger entry, populate with currency balances
            await stmDataLoadableFacet_new.createLedgerEntry(curEntryOwner, curEntry.ccys, curEntry.spot_sumQtyMinted, curEntry.spot_sumQtyBurned, 1);

            // set ledger ccy fees
            for (p of curCcys.ccyTypes) await stmStFeesFacet_new.setFee_CcyType(1, p.id, curEntryOwner, (await stmStFeesFacet_curr.getFee(CONST.getFeeType.CCY, 1, p.id, curEntryOwner)));

            // set ledger spot token fees
            for (p of curToks.tokenTypes.filter(p => p.settlementType == CONST.settlementType.SPOT)) await stmStFeesFacet_new.setFee_TokType(1, p.id, curEntryOwner, (await stmStFeesFacet_curr.getFee(CONST.getFeeType.TOK, 1, p.id, curEntryOwner)));

            // set ledger futures overrides (init-margin & fee-per-contract)
            // for (p of curToks.tokenTypes.filter(p => p.settlementType == CONST.settlementType.FUTURE))
                // await stm_new.setLedgerOverride(1, p.id, curEntryOwner, (await stm_cur.getInitMarginOverride(p.id, curEntryOwner))); //await stm_new.initMarginOverride(p.id, curEntryOwner, (await stm_cur.getInitMarginOverride(p.id, curEntryOwner)));

            // for (p of curToks.tokenTypes.filter(p => p.settlementType == CONST.settlementType.FUTURE))
                // await stm_new.setLedgerOverride(2, p.id, curEntryOwner, (await stm_cur.getFeePerContractOverride(p.id, curEntryOwner))); //await stm_new.feePerContractOverride(p.id, curEntryOwner, (await stm_cur.getFeePerContractOverride(p.id, curEntryOwner)));

            // add tokens to ledger
            for (let p of curEntry.tokens) {
                await stmDataLoadableFacet_new.addSecToken(curEntryOwner, 
                    p.batchId,
                    p.stId,
                    p.tokTypeId,
                    p.mintedQty,
                    p.currentQty,
                    p.ft_price,
                    p.ft_lastMarkPrice,
                    p.ft_ledgerOwner,
                    p.ft_PL
                );
            }
        }
        // for (let p of await stm_cur.getLedgerOwners()) {
        //     const x = await stm_cur.getLedgerEntry(p);
        //     console.log(`curEntry: ${p} tok.stId=[ ${x.tokens.map(p => p.stId).join(', ')} ] ccy.bal=[${x.ccys.map(p => `{ccyId=${p.ccyTypeId} bal=${p.balance}}`).join(', ')}]`);
        // }
        // console.log('---');
        // for (let p of await stm_new.getLedgerOwners()) {
        //     const x = await stm_new.getLedgerEntry(p);
        //     console.log(`newEntry: ${p} tok.stId=[ ${x.tokens.map(p => p.stId).join(', ')} ] ccy.bal=[${x.ccys.map(p => `{ccyId=${p.ccyTypeId} bal=${p.balance}}`).join(', ')}]`);
        // }

        // set token totals
        const curSecTokenBaseId = await stmStLedgerFacet_curr.getSecToken_BaseId();
        const curSecTokenMintedCount = await stmStLedgerFacet_curr.getSecToken_MaxId();
        const curSecTokenBurnedQty = await stmStBurnableFacet_curr.getSecToken_totalBurnedQty();
        const curSecTokenMintedQty = await stmStMintableFacet_curr.getSecToken_totalMintedQty();
        await stmDataLoadableFacet_new.setTokenTotals(
            curSecTokenBaseId,
            curSecTokenMintedCount, curSecTokenMintedQty, curSecTokenBurnedQty
        );

        const whitelist_cur = await stmStErc20Facet_curr.getWhitelist();
        const whitelist_new = await stmStErc20Facet_new.getWhitelist();

        //console.log('whitelist_cur', whitelist_cur);
        //console.log('whitelist_new', whitelist_new);
        console.log(chalk.inverse('stm_cur.getLedgerHashcode') + '\n\t', await CONST.getLedgerHashcode(stmStTransferableFacet_curr));
        console.log(chalk.inverse('stm_new.getLedgerHashcode') + '\n\t', await CONST.getLedgerHashcode(stmStTransferableFacet_new));
        
        stmStMasterFacet_new.sealContract();
        assert(await CONST.getLedgerHashcode(stmStTransferableFacet_curr) == await CONST.getLedgerHashcode(stmStTransferableFacet_new), 'ledger hashcode mismatch');
    });

    async function checkHashUpdate(curHash) {
        newHash = await CONST.getLedgerHashcode(stmStTransferableFacet_curr);
        assert(newHash.toString() != curHash.toString(), `expected ledger hashcode change (newHash=${newHash}, curHash=${curHash})`);
        return newHash;
    }
});
