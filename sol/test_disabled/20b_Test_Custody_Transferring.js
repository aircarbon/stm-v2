// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9

// Re: StTransferable.sol => TransferLib.sol
const st = artifacts.require('DiamondProxy');
const StMasterFacet = artifacts.require('StMasterFacet');
const StErc20Facet = artifacts.require('StErc20Facet');

const StMintableFacet = artifacts.require('StMintableFacet');
const CcyCollateralizableFacet = artifacts.require('CcyCollateralizableFacet');
const StLedgerFacet = artifacts.require('StLedgerFacet');
const StFeesFacet = artifacts.require('StFeesFacet');
const StTransferableFacet = artifacts.require('StTransferableFacet');
const OwnedFacet = artifacts.require('OwnedFacet');

const Big = require('big.js');
const transferHelper = require('../test/transferHelper.js');
const CONST = require('../const.js');
const setupHelper = require('../test/testSetupContract.js');

contract("StMaster", accounts => {
    var stm;
    var stmStMasterFacet;
    var stmStErc20Facet;
    var stmStMintableFacet;
    var stmCcyCollateralizableFacet;
    var stmStLedgerFacet;
    var stmStFeesFacet;
    var stmStTransferableFacet;
    

    before(async function () {
        stm = await st.deployed();
        const addr = stm.address;

        stmStMasterFacet = await StMasterFacet.at(addr);
        stmStErc20Facet = await StErc20Facet.at(addr);
        stmStMintableFacet = await StMintableFacet.at(addr);
        stmCcyCollateralizableFacet = await CcyCollateralizableFacet.at(addr);
        stmStLedgerFacet = await StLedgerFacet.at(addr);
        stmStFeesFacet = await StFeesFacet.at(addr);
        stmStTransferableFacet = await StTransferableFacet.at(addr);
        stmOwnedFacet = await OwnedFacet.at(addr);

        

        if (await stmStMasterFacet.getContractType() != CONST.contractType.COMMODITY) this.skip();
        if (await stmOwnedFacet.custodyType() == CONST.custodyType.SELF_CUSTODY) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;
        
        await stmStErc20Facet.whitelistMany(accounts.slice(global.TaddrNdx, global.TaddrNdx + 40));
        await stmStMasterFacet.sealContract();
        await setupHelper.setDefaults({ 
            StErc20Facet: stmStErc20Facet, 
            stmStMaster: stmStMasterFacet, 
            stmStLedger: stmStLedgerFacet, 
            stmCcyCollateralizable: stmCcyCollateralizableFacet, 
            stmFees: stmStFeesFacet,
            accounts });
    });
    
    beforeEach(async () => {
        global.TaddrNdx += 2;
        await stmStErc20Facet.setAccountEntityBatch([{id: 1, addr: accounts[global.TaddrNdx + 0]}, {id: 1, addr: accounts[global.TaddrNdx + 1]}]);
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`transferring / 3rd party custody - should allow transfer of tokens from custody address index`, async () => {
        var custodyType = await stmOwnedFacet.custodyType();
        assert(custodyType == CONST.custodyType.THIRD_PARTY_CUSTODY, `unexpected custody type: ${custodyType}`);
        const A = accounts[global.TaddrNdx + 0], B = accounts[global.TaddrNdx + 1];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], []);
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST', );
        const txConfirmationHash = await transferHelper.transferWrapper(stmStTransferableFacet, accounts, A, B,
            1, CONST.tokenType.TOK_T2, // qty_A, tokTypeId_A, 
            0, 0,                      // qty_B, tokTypeId_B, 
            0, 0,                      // ccy_amount_A, ccyTypeId_A, 
            1, CONST.ccyType.USD,      // ccy_amount_B, ccyTypeId_B, 
        false, CONST.transferType.UNDEFINED, { from: accounts[1] }); // custody account address [check Owned.sol for more info]
        assert.exists(txConfirmationHash, `third-party custody transferOrTrade missing tx hash`);
    });

    it(`transferring / 3rd party custody - should not allow transfer of tokens from an address other than custody address index`, async () => {
        var custodyType = await stmOwnedFacet.custodyType();
        assert(custodyType == CONST.custodyType.THIRD_PARTY_CUSTODY, `unexpected custody type: ${custodyType}`);
        const A = accounts[global.TaddrNdx + 0], B = accounts[global.TaddrNdx + 1];
        await stmStMintableFacet.mintSecTokenBatch(CONST.tokenType.TOK_T2, CONST.GT_CARBON, 1, A, CONST.nullFees, 0, [], []);
        await stmCcyCollateralizableFacet.fundOrWithdraw(CONST.fundWithdrawType.FUND, CONST.ccyType.USD, CONST.thousandCcy_cents, B, 'TEST', );
        try{
            await transferHelper.transferWrapper(stmStTransferableFacet, accounts, A, B,
                1, CONST.tokenType.TOK_T2, // qty_A, tokTypeId_A, 
                0, 0,                      // qty_B, tokTypeId_B, 
                0, 0,                      // ccy_amount_A, ccyTypeId_A, 
                1, CONST.ccyType.USD,      // ccy_amount_B, ccyTypeId_B, 
            false, CONST.transferType.UNDEFINED, { from: accounts[0] }); // root account address
        } catch(ex) {
            assert(ex.reason == 'Restricted', `unexpected: ${ex.reason}`);
        }
    });
    
});