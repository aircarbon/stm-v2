const truffleAssert = require('truffle-assertions');
const st = artifacts.require('StMaster');
const CONST = require('../const.js');
const helper = require('./transferHelper.js');

contract("StMaster", accounts => {
    var stm;

    before(async function () {
        stm = await st.deployed();
        if (await stm.getContractType() == CONST.contractType.CASHFLOW) this.skip();
        if (!global.TaddrNdx) global.TaddrNdx = 0;
        
        for (let i=0 ; i < 60 ; i++) { // whitelist enough accounts for the tests
            await stm.whitelist(accounts[global.TaddrNdx + i]);
        }
        await stm.sealContract();
    });

    beforeEach(async () => {
        global.TaddrNdx += 2;
        if (CONST.logTestAccountUsage)
            console.log(`addrNdx: ${global.TaddrNdx} - contract @ ${stm.address} (owner: ${accounts[0]})`);
    });

    it(`transferring tok - should have reasonable gas cost for one-sided 0.5 vST transfer (A -> B), aka. carbon movement`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.ETH,                   0,                                  accounts[global.TaddrNdx + 1],         { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        CONST.logGas(data.transferTx, `0.5 vST one-way (A -> B)`);
    });

    // one-sided kg transfer, no consideration, 1 full ST
    it(`transferring tok - should allow one-sided transfer (A -> B) of 1.0 vST (VCS) across ledger entries`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.ktCarbon, 1,       accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.SGD,                CONST.thousandCcy_cents, accounts[global.TaddrNdx + 1],         { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                    qty_A: CONST.ktCarbon,                  tokenTypeId_A: CONST.tokenType.VCS,
                    qty_B: 0,                               tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        assert(data.eeuFullEvents.length == 1 && data.eeuPartialEvents == 0, 'unexpected event composition');
        assert(data.eeuFullEvents[0].stId == data.ledgerA_before.tokens[0].stId, 'unexpected event eeu id vs. ledger A before');
        assert(data.ledgerA_after.tokens.length == 0, 'unexpected eeu count ledger A after');
        assert(data.ledgerB_after.tokens.length == 1, 'unexpected eeu count ledger B after');
        assert(data.ledgerB_after.tokens[0].stId == data.ledgerA_before.tokens[0].stId, 'unexpected eeu id ledger B after vs. ledger A before');
    });

    it(`transferring tok - should allow one-sided transfer (B -> A) of 1.0 vST (UNFCCC) across ledger entries`, async () => {
        await stm.fund(CONST.ccyType.SGD,                   CONST.thousandCcy_cents, accounts[global.TaddrNdx + 0],         { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.ktCarbon, 1,       accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokenTypeId_A: 0,
                   qty_B: CONST.ktCarbon,                   tokenTypeId_B: CONST.tokenType.UNFCCC,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        assert(data.eeuFullEvents.length == 1 && data.eeuPartialEvents == 0, 'unexpected event composition');
        assert(data.eeuFullEvents[0].stId == data.ledgerB_before.tokens[0].stId, 'unexpected event eeu id vs. ledger B before');
        assert(data.ledgerB_after.tokens.length == 0, 'unexpected eeu count ledger B after');
        assert(data.ledgerA_after.tokens.length == 1, 'unexpected eeu count ledger A after');
        assert(data.ledgerA_after.tokens[0].stId == data.ledgerB_before.tokens[0].stId, 'unexpected eeu id ledger A after vs. ledger B before');
    });

    // one-sided kg transfer, no consideration, 0.5 ST (split)
    it(`transferring tok - should allow one-sided transfer (A -> B) of 0.5 vST (VCS) across ledger entries`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.ktCarbon, 1,       accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.SGD,                CONST.thousandCcy_cents, accounts[global.TaddrNdx + 1],         { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: CONST.ktCarbon / 2,               tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        assert(data.eeuFullEvents.length == 0 && data.eeuPartialEvents.length == 1, 'unexpected event composition');
        assert(data.eeuPartialEvents[0].splitFromSecTokenId == data.ledgerA_before.tokens[0].stId, 'unexpected event parent eeu id vs. ledger A before');
        assert(data.eeuPartialEvents[0].newSecTokenId == data.ledgerB_after.tokens[0].stId, 'unexpected event soft-minted eeu id vs. ledger B after');
        assert(data.ledgerA_after.tokens.length == 1, 'unexpected eeu count ledger A after');
        assert(data.ledgerB_after.tokens.length == 1, 'unexpected eeu count ledger B after');
        assert(data.ledgerB_after.tokens[0].stId != data.ledgerA_after.tokens[0].stId, 'unexpected eeu id ledger B after vs. ledger A after');
    });

    it(`transferring tok - should allow one-sided transfer (B -> A) of 0.5 vST (VCS) across ledger entries`, async () => {
        await stm.fund(CONST.ccyType.SGD,                CONST.thousandCcy_cents, accounts[global.TaddrNdx + 0],         { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.ktCarbon, 1,       accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 0,                                tokenTypeId_A: 0,
                   qty_B: CONST.ktCarbon / 2,               tokenTypeId_B: CONST.tokenType.VCS,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        assert(data.eeuFullEvents.length == 0 && data.eeuPartialEvents.length == 1, 'unexpected event composition');
        assert(data.eeuPartialEvents[0].splitFromSecTokenId == data.ledgerB_before.tokens[0].stId, 'unexpected event parent eeu id vs. ledger B before');
        assert(data.eeuPartialEvents[0].newSecTokenId == data.ledgerA_after.tokens[0].stId, 'unexpected event soft-minted eeu id vs. ledger A after');
        assert(data.ledgerA_after.tokens.length == 1, 'unexpected eeu count ledger A after');
        assert(data.ledgerB_after.tokens.length == 1, 'unexpected eeu count ledger B after');
        assert(data.ledgerA_after.tokens[0].stId != data.ledgerB_after.tokens[0].stId, 'unexpected eeu id ledger A after vs. ledger B after');
    });

    // one-sided kg transfer, no consideration, 1 full + 1 partial ST (split)
    // DEPRECATED - no multi-vST minting
    // it(`transferring tok - should allow one-sided transfer (A -> B) of 1.5 vSTs (VCS) across ledger entries`, async () => {
    //     await stm.mintSecTokenBatch(CONST.tokenType.VCS, CONST.tonCarbon, 2,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
    //     await stm.fund        (CONST.ccyType.USD, CONST.thousandCcy_cents, accounts[global.TaddrNdx + 1],         { from: accounts[0] });
    //     const data = await helper.transferLedger({ stm, accounts, 
    //             ledger_A: accounts[global.TaddrNdx + 0],     ledger_B: accounts[global.TaddrNdx + 1],
    //                 qty_A: 750,                              tokenTypeId_A: CONST.tokenType.VCS,
    //                 qty_B: 0,                                tokenTypeId_B: 0,
    //         ccy_amount_A: 0,                                ccyTypeId_A: 0,
    //         ccy_amount_B: 0,                                ccyTypeId_B: 0,
    //     });
    //     helper.assert_nFull_1Partial({
    //                    fullEvents: data.eeuFullEvents,
    //                 partialEvents: data.eeuPartialEvents,
    //   expectFullTransfer_eeuCount: 1,
    //           ledgerSender_before: data.ledgerA_before,   ledgerSender_after: data.ledgerA_after,
    //         ledgerReceiver_before: data.ledgerB_before, ledgerReceiver_after: data.ledgerB_after,
    //     });
    // });
    // it(`transferring tok - should allow one-sided transfer (B -> A) of 1.5 vSTs (UNFCCC) across ledger entries`, async () => {
    //     await stm.fund        (CONST.ccyType.USD,    CONST.thousandCcy_cents, accounts[global.TaddrNdx + 0],         { from: accounts[0] });
    //     await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 2,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
    //     const data = await helper.transferLedger({ stm, accounts, 
    //             ledger_A: accounts[global.TaddrNdx + 0],     ledger_B: accounts[global.TaddrNdx + 1],
    //                 qty_A: 0,                                tokenTypeId_A: 0,
    //                 qty_B: 750,                              tokenTypeId_B: CONST.tokenType.UNFCCC,
    //         ccy_amount_A: 0,                                ccyTypeId_A: 0,
    //         ccy_amount_B: 0,                                ccyTypeId_B: 0,
    //     });
    //     helper.assert_nFull_1Partial({
    //                    fullEvents: data.eeuFullEvents,
    //                 partialEvents: data.eeuPartialEvents,
    //   expectFullTransfer_eeuCount: 1,
    //           ledgerSender_before: data.ledgerB_before,   ledgerSender_after: data.ledgerB_after,
    //         ledgerReceiver_before: data.ledgerA_before, ledgerReceiver_after: data.ledgerA_after,
    //     });
    // });

    // one-sided kg transfer, no consideration, partial ST (split), receiver owns other type
    it(`transferring tok - should allow one-sided transfer (A -> B) of 0.5 vST (VCS) across ledger entries, receiver owns other type`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 500,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        helper.assert_nFull_1Partial({
                       fullEvents: data.eeuFullEvents,
                    partialEvents: data.eeuPartialEvents,
      expectFullTransfer_eeuCount: 0,
              ledgerSender_before: data.ledgerA_before,   ledgerSender_after: data.ledgerA_after,
            ledgerReceiver_before: data.ledgerB_before, ledgerReceiver_after: data.ledgerB_after,
        });
    });

    // one-sided kg transfer, no consideration, full + partial ST (split), receiver owns other type
    it(`transferring tok - should allow one-sided transfer (A -> B) of 1.5 vSTs (VCS) across ledger entries, receiver owns other type`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 1500,                             tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        helper.assert_nFull_1Partial({
                       fullEvents: data.eeuFullEvents,
                    partialEvents: data.eeuPartialEvents,
      expectFullTransfer_eeuCount: 1,
              ledgerSender_before: data.ledgerA_before,   ledgerSender_after: data.ledgerA_after,
            ledgerReceiver_before: data.ledgerB_before, ledgerReceiver_after: data.ledgerB_after,
        });
    });

    // one-sided kg transfer, no consideration, full + partial ST (split), receiver owns same type
    it(`transferring tok - should allow one-sided transfer (A -> B) of 1.5 vSTs (VCS) across ledger entries, receiver owns same type`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 1500,                             tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        //console.log('data.eeuFullEvents', data.eeuFullEvents);
        //console.log('data.eeuPartialEvents', data.eeuPartialEvents);
        helper.assert_nFull_1Partial({
                       fullEvents: data.eeuFullEvents,
                    partialEvents: data.eeuPartialEvents,
      expectFullTransfer_eeuCount: 1,
              ledgerSender_before: data.ledgerA_before,   ledgerSender_after: data.ledgerA_after,
            ledgerReceiver_before: data.ledgerB_before, ledgerReceiver_after: data.ledgerB_after,
        });
    });

    // two-sided kg transfer / kg consideration, 1 full + 1 partial ST (split), receiver owns and sends same type
    it(`transferring tok - should allow two-sided transfer (A <-> B) 1.5 vSTs (VCS) across ledger entries, receiver owns same type`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 250,                              tokenTypeId_B: CONST.tokenType.VCS,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
    });

    // two-sided kg transfer / kg consideration, 1 full + 1 partial ST (split), receiver owns and sends different type
    it(`transferring tok - should allow two-sided transfer (A <-> B) 1.5 vSTs of different ST types across ledger entries`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 750,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 250,                              tokenTypeId_B: CONST.tokenType.UNFCCC,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
    });

    // merge test
    // one-sided kg transfer, no consideration, partial ST (split), receiver owns same type, same batch (merge)
    it(`transferring tok - should allow one-sided transfer (A -> B) of 0.5 + 0.25 vSTs (VCS) across ledger entries, receiver owns same type, same batch`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.fund(CONST.ccyType.SGD,                   0,                       accounts[global.TaddrNdx + 1],         { from: accounts[0] });
        
        // setup: transfer 0.5, from batch 1 
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 500,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });

        // transfer 0.25, also from batch 1 -- expect merge on existing destination eeu of same batch
        const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 250,                              tokenTypeId_A: CONST.tokenType.VCS,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });
        assert(data.ledgerB_after.tokens.length == 1, 'ledger B was not merged');
        assert(data.eeuPartialEvents.some(p => p.mergedToSecTokenId == data.ledgerB_before.tokens[0].stId), 'unexpected merge event data');
    });

    // merge test
    // one-sided kg transfer, no consideration, partial ST (split), receiver owns same type, same and different batches (merge)
    it(`transferring tok - should allow one-sided transfer (A -> B) of 0.1 + 0.001, 0.001... vSTs (UNFCCC) across ledger entries, receiver owns same type, same batch`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC,    CONST.tonCarbon, 1,   accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC,    CONST.tonCarbon, 1,   accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        // setup: transfer 0.1, split batch 1 to receiver
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 100,                              tokenTypeId_A: CONST.tokenType.UNFCCC,
                   qty_B: 0,                                tokenTypeId_B: 0,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });

        // repeated transfers -- expect consistent merge of existing destination eeu of the same batch
        for (var i = 0; i < 3 ; i++) {
            const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],    ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 1,                           tokenTypeId_A: CONST.tokenType.UNFCCC,
                   qty_B: 0,                           tokenTypeId_B: 0,
            ccy_amount_A: 0,                             ccyTypeId_A: 0,
            ccy_amount_B: 0,                             ccyTypeId_B: 0,
            });
            assert(data.ledgerB_after.tokens.length == data.ledgerB_before.tokens.length, 'ledger B was not merged');
            assert(data.eeuPartialEvents.some(p => data.ledgerB_before.tokens.some(p2 => p2.stId == p.mergedToSecTokenId)), 'unexpected merge event data');
        }
    });

    // merge test
    // two-sided kg / kg transfer, partial ST (split), receiver owns same type, same batch (merge)
    it(`transferring tok - should allow two-sided transfer (A <-> B) of 0.1 + 0.001, 0.001... vSTs (UNFCCC) across ledger entries, receiver owns same type, same batch`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC,    CONST.tonCarbon, 1,   accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,       CONST.tonCarbon, 1,   accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        
        // setup A: transfer 0.1 from B, split batch 2 to A
        // setup B: transfer 0.1 from A, split batch 1 to B
        await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 100,                              tokenTypeId_A: CONST.tokenType.UNFCCC,
                   qty_B: 100,                              tokenTypeId_B: CONST.tokenType.VCS,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
        });

        // repeated transfers -- expect consistent merge of existing destination eeu of the same batch
        for (var i = 0; i < 3 ; i++) {
            const data = await helper.transferLedger({ stm, accounts, 
                ledger_A: accounts[global.TaddrNdx + 0],         ledger_B: accounts[global.TaddrNdx + 1],
                   qty_A: 1,                                tokenTypeId_A: CONST.tokenType.UNFCCC,
                   qty_B: 1,                                tokenTypeId_B: CONST.tokenType.VCS,
            ccy_amount_A: 0,                                  ccyTypeId_A: 0,
            ccy_amount_B: 0,                                  ccyTypeId_B: 0,
            });
            assert(data.ledgerB_after.tokens.length == data.ledgerB_before.tokens.length, 'ledger B was not merged');
            assert(data.eeuPartialEvents.some(p => data.ledgerB_before.tokens.some(p2 => p2.stId == p.mergedToSecTokenId)), 'unexpected merge event data for ledger B');

            assert(data.ledgerA_after.tokens.length == data.ledgerA_before.tokens.length, 'ledger A was not merged');
            assert(data.eeuPartialEvents.some(p => data.ledgerA_before.tokens.some(p2 => p2.stId == p.mergedToSecTokenId)), 'unexpected merge event data for ledger A');
        }
    });

    it(`transferring tok - should not allow one-sided transfer (A -> B) of an invalid (-1) token unit quantity`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                -1,                          // qty_A
                CONST.tokenType.VCS,         // tokenTypeId_A
                0,                           // qty_B
                0,                           // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad qty_A', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`transferring tok - should not allow one-sided transfer (B -> A) of an invalid (-1) token unit quantity`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.UNFCCC, CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                0,                           // qty_A
                0,                           // tokenTypeId_A
                -1,                          // qty_B 
                CONST.tokenType.VCS,         // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Bad qty_B', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });    

    it(`transferring tok - should not allow one-sided transfer (A -> B) of tokens in excess of the amount held, correct type held`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.mtCarbon,  1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                CONST.tonCarbon + 1,         // qty_A
                CONST.tokenType.VCS,         // tokenTypeId_A
                0,                           // qty_B
                0,                           // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });

    it(`transferring tok - should not allow one-sided transfer (A -> B) of tokens in excess of the amount held, incorrect type held`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.mtCarbon,  1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                CONST.tonCarbon,             // qty_A
                CONST.tokenType.UNFCCC,      // tokenTypeId_A
                0,                           // qty_B
                0,                           // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'No tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });    

    it(`transferring tok - should not allow one-sided transfer (B -> A) of tokens in excess of the amount held, correct type held`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                0,                           // qty_A
                0,                           // tokenTypeId_A
                CONST.tonCarbon + 1,         // qty_B
                CONST.tokenType.VCS,         // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'Insufficient tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });
    
    it(`transferring tok - should not allow one-sided transfer (B -> A) of tokens in excess of the amount held, incorrect type held`, async () => {
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 0], CONST.nullFees, [], [], { from: accounts[0] });
        await stm.mintSecTokenBatch(CONST.tokenType.VCS,    CONST.tonCarbon, 1,      accounts[global.TaddrNdx + 1], CONST.nullFees, [], [], { from: accounts[0] });
        try {
            await helper.transferWrapper(stm, accounts,
                accounts[global.TaddrNdx + 0], accounts[global.TaddrNdx + 1],
                0,                           // qty_A
                0,                           // tokenTypeId_A
                CONST.tonCarbon,             // qty_B
                CONST.tokenType.UNFCCC,      // tokenTypeId_B
                0, 0, 0, 0, 
                false,                       // applyFees
                { from: accounts[0] });
        } catch (ex) { 
            assert(ex.reason == 'No tokens', `unexpected: ${ex.reason}`);
            return;
        }
        assert.fail('expected contract exception');
    });
});