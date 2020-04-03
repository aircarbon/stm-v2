const st = artifacts.require('StMaster');
const truffleAssert = require('truffle-assertions');
const CONST = require('../const.js');
const transferHelper = require('../test/transferHelper.js');

contract("StMaster", accounts => {
    var stm;

    var WHITE, GRAY_1, GRAY_2, NDX_GRAY_1, NDX_GRAY_2;

    before(async function () {
        stm = await st.deployed();
        if (await stm.getContractType() == CONST.contractType.CASHFLOW) this.skip();

        if (!global.TaddrNdx) global.TaddrNdx = 0;   // whitelist (exchange) test addr; managed by tests
        if (!global.XaddrNdx) global.XaddrNdx = 800; // graylist (erc20) test addr; managed by tests
        
        WHITE = accounts[global.TaddrNdx + 0];
        
        NDX_GRAY_1 = global.XaddrNdx + 0;
        GRAY_1 = accounts[NDX_GRAY_1];

        NDX_GRAY_2 = global.XaddrNdx + 1;
        GRAY_2 = accounts[NDX_GRAY_2];
        
        await stm.whitelist(WHITE);
        await stm.sealContract();

        // mint batches x 3 with originator fees - should be ignored by ERC20
        const testFee = { ccy_mirrorFee: false, ccy_perMillion: 0, fee_fixed: 1, fee_percBips: 10, fee_min: 0, fee_max: 0 };
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.NATURE, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.CORSIA, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.CORSIA, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.CORSIA, CONST.KT_CARBON, 1, WHITE, testFee, 0, [], [], { from: accounts[0] });

        // set exchange fees - should be ignored by ERC20
        await stm.setFee_TokType(CONST.tokenType.NATURE, CONST.nullAddr, testFee );
        await stm.setFee_TokType(CONST.tokenType.CORSIA, CONST.nullAddr, testFee );

        // set ledger feess - should be ignored by ERC20
        await stm.setFee_TokType(CONST.tokenType.NATURE, WHITE,  testFee );
        await stm.setFee_TokType(CONST.tokenType.CORSIA, WHITE,  testFee );
        
        await stm.fund(CONST.ccyType.USD, 1, GRAY_1, { from: accounts[0] });
        await stm.setFee_TokType(CONST.tokenType.NATURE, GRAY_1, testFee );
        await stm.setFee_TokType(CONST.tokenType.CORSIA, GRAY_1, testFee );

        await stm.fund(CONST.ccyType.USD, 1, GRAY_2, { from: accounts[0] });
        await stm.setFee_TokType(CONST.tokenType.NATURE, GRAY_2, testFee );
        await stm.setFee_TokType(CONST.tokenType.CORSIA, GRAY_2, testFee );
    });

    //
    // ordered tests: these need to run in this order; they assume contract state from previous test(s)
    //

    it(`erc20 multi-type - should be able to send 2 types / 3 batches from whitelist addr to graylist addr (WITHDRAW: exchange => erc20)`, async () => {
        await white_to_gray_1();
    });
    async function white_to_gray_1() {
        await transferHelper.transferLedger({ stm, accounts, 
            ledger_A: WHITE,                               ledger_B: GRAY_1,
               qty_A: CONST.KT_CARBON * 3,            tokenTypeId_A: CONST.tokenType.NATURE,
               qty_B: 0,                              tokenTypeId_B: 0,
        ccy_amount_A: 0,                                ccyTypeId_A: 0,
        ccy_amount_B: 0,                                ccyTypeId_B: 0,
           applyFees: false,
        });
        await transferHelper.transferLedger({ stm, accounts, 
            ledger_A: WHITE,                               ledger_B: GRAY_1,
               qty_A: CONST.KT_CARBON * 3,            tokenTypeId_A: CONST.tokenType.CORSIA,
               qty_B: 0,                              tokenTypeId_B: 0,
        ccy_amount_A: 0,                                ccyTypeId_A: 0,
        ccy_amount_B: 0,                                ccyTypeId_B: 0,
           applyFees: false,
        });
    }

    it(`erc20 multi-type - should be able to send 2 types / 3 batches from graylist addr to whitelist addr (DEPOSIT: erc20 => exchange)`, async () => {
        await gray_1_to_white();
    });
    async function gray_1_to_white() {
        const fundTx = await CONST.web3_sendEthTestAddr(0, GRAY_1, "0.1"); // fund GRAY_1 for erc20 op
        const erc20Tx = await stm.transfer(WHITE, CONST.KT_CARBON * 6, { from: GRAY_1 } );
        await CONST.logGas(web3, erc20Tx, '(erc20 => exchange)');

        const GRAY_after = await stm.getLedgerEntry(GRAY_1);
        const WHITE_after = await stm.getLedgerEntry(WHITE);

        assert(GRAY_after.spot_sumQty == 0, 'unexpected graylist ledger GRAY_1 quantity after');     
        assert(WHITE_after.spot_sumQty == CONST.KT_CARBON * 6, 'unexpected whitelist ledger WHITE quantity after');     
    }

    it(`erc20 multi-type - should be able to send 2 types / 3 batches from graylist addr to graylist addr (erc20 => erc20)`, async () => {
        await white_to_gray_1(); 
        await gray_1_to_gray_2();
    });
    async function gray_1_to_gray_2() {
        const fundTx = await CONST.web3_sendEthTestAddr(0, GRAY_1, "0.01"); // fund GRAY_1 for erc20 op
        const erc20Tx = await stm.transfer(GRAY_2, CONST.KT_CARBON * 6, { from: GRAY_1 } );
        await CONST.logGas(web3, erc20Tx, '(erc20 => erc20)');
        
        const GRAY1_after = await stm.getLedgerEntry(GRAY_1);
        const GRAY2_after = await stm.getLedgerEntry(GRAY_2);
        assert(GRAY1_after.spot_sumQty == 0, 'unexpected graylist ledger GRAY_1 quantity after');     
        assert(GRAY2_after.spot_sumQty == CONST.KT_CARBON * 6, 'unexpected graylist ledger GRAY_2 quantity after');     
    }
});
