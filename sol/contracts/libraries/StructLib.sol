// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

library StructLib {
	enum ContractType {
		COMMODITY,
		CASHFLOW_BASE,
		CASHFLOW_CONTROLLER
	}

	enum FundWithdrawType {
		FUND,
		WITHDRAW
	}

	enum CustodyType {
		SELF_CUSTODY,
		THIRD_PARTY_CUSTODY
	}

	enum GetFeeType {
		CCY,
		TOK
	}

	enum TransferType {
		Undefined,
		// spot trades: user-requested trade transfers, and automated fees
		User,
		ExchangeFee,
		OriginatorFee,
		// futures: settlement transfers
		//TakePay,
		TakePayFee,
		SettleTake,
		SettlePay,
		// manual transfers: ccy fees
		MintFee,
		BurnFee,
		WithdrawFee,
		DepositFee,
		DataFee,
		OtherFee1, // AC: ONBOARDING FEE
		OtherFee2, // AC: FIAT/TOKEN WITHDRAW
		OtherFee3, // AC: RETIREMENT
		OtherFee4, // AC: REBATE
		OtherFee5, // AC: PHYSICAL_DELIVERY
		// transfer across related accounts (e.g. corp-admin transfer to corp-trader)
		RelatedTransfer,
		// generic adjustment
		Adjustment,
		// ERC20: token transfer
		ERC20,
		// CFT: token issuance/subscription
		Subscription,
		// AC: BLOCK_TRADE
		BlockTrade,

		OtherFee6, // AC: Minimum Balance Fee
		OtherFee7, // AC: No Movement Fee
		OtherFee8, // AC: TBD
		OtherFee9, // AC: TBD
		OtherFee10, // AC: TBD
		OtherFee11, // AC: TBD
		OtherFee12, // AC: TBD
		OtherFee13, // AC: TBD
		OtherFee14, // AC: TBD
		OtherFee15, // AC: TBD
		OtherFee16, // AC: TBD
		OtherFee17, // AC: TBD
		OtherFee18, // AC: TBD
		OtherFee19, // AC: TBD
		OtherFee20, // AC: TBD
		OtherFee21, // AC: TBD
		OtherFee22, // AC: TBD
		OtherFee23, // AC: TBD
		OtherFee24, // AC: TBD
		OtherFee25, // AC: TBD
		Retokenize // AC: Retokenization
	}

	enum CashflowType {
		BOND,
		EQUITY
	}

	enum SettlementType {
		UNDEFINED,
		SPOT,
		FUTURE
	}

	struct CreateLedgerEntryArgs {
		address ledgerEntryOwner;
		LedgerCcyReturn[] ccys;
		uint256 spot_sumQtyMinted;
		uint256 spot_sumQtyBurned;
		uint256 entityId;
	}

	struct AddSecTokenBatchArgs {
		address ledgerEntryOwner;
		uint64 batchId;
		uint256 stId;
		uint256 tokTypeId;
		int64 mintedQty;
		int64 currentQty;
		int128 ft_price;
		int128 ft_lastMarkPrice;
		address ft_ledgerOwner;
		int128 ft_PL;
	}

	struct AddSecTokenTypeBatchArgs {
		string name;
		SettlementType settlementType;
		FutureTokenTypeArgs ft;
		address payable cashflowBaseAddr;
	}

	struct SetFeeCcyTypeBatchArgs {
		uint256 entityId;
		uint256 ccyTypeId;
		address ledgerOwner;
		SetFeeArgs feeArgs;
	}

	struct IdWithAddress {
		uint id;
		address addr;
	}

	/**
	 * @notice Transfers currency across ledger entries
	 * @param a Transfer arguments
	 */
	struct TransferCcyArgs {
		address from;
		address to;
		uint256 ccyTypeId;
		uint256 amount;
		StructLib.TransferType transferType;
	}

	struct TakePayArgs2 {
		uint256 tokTypeId;
		uint256 stId;
		int128 markPrice;
		int256 feePerSide;
		address feeAddrOwner;
	}

	struct CombinePositionArgs {
		uint256 tokTypeId;
		uint256 master_StId;
		uint256[] child_StIds;
	}

	struct FeesCalc {
		uint256 fee_ccy_A; // currency fee paid by A
		uint256 fee_ccy_B; // currency fee paid by B
		uint256 fee_tok_A; // token fee paid by A
		uint256 fee_tok_B; // token fee paid by B
		address fee_to_A; // fees paid to for entity A
		address fee_to_B; // fees paid to for entity B
		uint256 origTokFee_qty; // for originator token fees: token quantity from batch being sent by A or B
		uint64 origTokFee_batchId; // for originator token fees: batch ID supplying the sent token quantity
		SetFeeArgs origTokFee_struct; // for originator token fees: batch originator token fee structure
	}

	struct FuturesPositionArgs {
		uint256 tokTypeId;
		address ledger_A;
		address ledger_B;
		int256 qty_A;
		int256 qty_B;
		int256 price; // signed, so we can explicitly test for <0 (otherwise -ve values are silently wrapped by web3 to unsigned values)
	}

	struct CashflowArgs {
		// v1: single-issuance, single-subscriber
		CashflowType cashflowType; // issuance type
		uint256 term_Blks; // total term/tenor, in blocks - (todo: 0 for perpetual?)
		uint256 bond_bps; // rates: basis points per year on principal
		uint256 bond_int_EveryBlks; // rates: interest due every n blocks
	}

	struct CashflowStruct {
		CashflowArgs args;
		uint256 wei_currentPrice; // current subscription price, in wei per token; or
		uint256 cents_currentPrice; // current subscription price, in USD cents per token
		uint256 qty_issuanceMax; // the amount minted in the issuance uni-batch
		uint256 qty_issuanceRemaining; // the amount remaining unsold of the issuance uni-batch
		uint256 qty_issuanceSold; // the amount sold of the issuance uni-batch
		uint256 qty_saleAllocation; // the amount of the issuance uni-batch that is available for sale
		address issuer; // the uni-batch originator ("minter"), i.e. the issuer (or null address, if not yet minted)

		//uint256      issued_Blk;         // issuance (start) block no
		// --> wei_totIssued
		// --> mapping(address ==> )

		// TODO: payment history... (& bond_int_lastPaidBlk)
		//uint256 bond_int_payments;       // todo - { block_no, amount, }
		//uint256 bond_int_lastPaidBlk;    // rates: last paid interest block no

		// TODO: getCashflowStatus() ==> returns in default or not, based on block.number # and issuer payment history...
	}

	/**
	 *  Issuer Payment - Struct for current issuer payment
	 *  Reset all except curPaymentId after full payment cycle (i.e. after last batch payment)
	 *  0 < curPaymentId < 65535
	 *  0 < curBatchNdx < 4294967295
	 *  0 < curNdx < 4294967295
	 */
	struct IssuerPaymentBatchStruct {
		// ** DATA_DUMP: TODO
		uint32 curPaymentId; // 1-based payment ID for each issuer payment: indicates current issuer payment
		uint32 curBatchNdx; // 1-based batch index for the current issuer payment
		uint32 curNdx; // 0-based index into the ledger owners list for current issuer payment batch processing
		uint256 curPaymentTotalAmount; // total payment due from issuer for the current issuer payment
		uint256 curPaymentProcessedAmount; // current processed payment amount
	}

	struct TransferArgs {
		address ledger_A;
		address ledger_B;
		uint256 qty_A; // ST quantity moving from A (excluding fees, if any)
		uint256[] k_stIds_A; // if len>0: the constant/specified ST IDs to transfer (must correlate with qty_A, if supplied)
		uint256 tokTypeId_A; // ST type moving from A
		uint256 qty_B; // ST quantity moving from B (excluding fees, if any)
		uint256[] k_stIds_B; // if len>0: the constant/specified ST IDs to transfer (must correlate with qty_B, if supplied)
		uint256 tokTypeId_B; // ST type moving from B
		int256 ccy_amount_A; // currency amount moving from A (excluding fees, if any)
		// (signed value: ledger supports -ve balances)
		uint256 ccyTypeId_A; // currency type moving from A
		int256 ccy_amount_B; // currency amount moving from B (excluding fees, if any)
		// (signed value: ledger supports -ve balances)
		uint256 ccyTypeId_B; // currency type moving from B
		bool applyFees; // apply global fee structure to the transfer (both legs)
		address feeAddrOwner_A; // exchange fees: receive address from entity of ledger_A
		address feeAddrOwner_B; // exchange fees: receive address from entity of ledger_B
		TransferType transferType; // reason/type code: applies only to one-sided transfers (not two-sided trades, which are coded automatically)
		// bytes reverseTxHash; // hash of the reversed transaction
	}

	struct CustomFee {
		uint feeA;
		uint feeB;
		bool applyCustomFee;
	}

	struct CustomCcyFee {
		uint ccyTypeId;
		uint fee;
		bool applyCustomFee;
	}

	struct Ccy {
		uint256 id;
		string name; // e.g. "USD", "BTC"
		string unit; // e.g. "cents", "satoshi"
		uint16 decimals;
	}

	struct GetCcyTypesReturn {
		Ccy[] ccyTypes;
	}

	struct CcyTypesStruct {
		// ** DATA_DUMP: OK
		mapping(uint256 => Ccy) _ct_Ccy; // typeId (1-based) -> ccy
		uint256 _ct_Count;
	}

	struct SecTokenTypeReturn {
		uint256 id;
		string name;
		SettlementType settlementType;
		FutureTokenTypeArgs ft;
		address cashflowBaseAddr;
	}

	struct GetSecTokenTypesReturn {
		SecTokenTypeReturn[] tokenTypes;
	}

	struct StTypesStruct {
		mapping(uint256 => string) _tt_name; // typeId (1-based) -> typeName
		mapping(uint256 => SettlementType) _tt_settle;
		mapping(uint256 => FutureTokenTypeArgs) _tt_ft;
		mapping(uint256 => address payable) _tt_addr; // cashflow base
		uint256 _tt_Count;
	}

	struct FutureTokenTypeArgs {
		uint64 expiryTimestamp;
		uint256 underlyerTypeId;
		uint256 refCcyId;
		uint16 initMarginBips; // initial margin - set only once at future token-type creation
		uint16 varMarginBips; // variation margin - can be updated after token-type creation
		uint16 contractSize; // contract size - set only once at future token-type creation
		uint128 feePerContract; // paid by both sides in refCcyId - can be updated after token-type creation
	}

	struct SecTokenBatch {
		uint64 id; // global sequential id: 1-based
		uint256 mintedTimestamp; // minting block.timestamp
		uint256 tokTypeId; // token type of the batch
		uint256 mintedQty; // total unit qty minted in the batch
		uint256 burnedQty; // total unit qty burned from the batch
		string[] metaKeys; // metadata keys
		string[] metaValues; // metadata values
		SetFeeArgs origTokFee; // batch originator token fee on all transfers of tokens from this batch
		uint16 origCcyFee_percBips_ExFee; // batch originator ccy fee on all transfers of tokens from this batch - % of exchange currency fee
		address payable originator; // original owner (minter) of the batch
	}

	struct Ledger {
		bool exists; // for existance check by address
		mapping(uint256 => uint256[]) tokenType_stIds; // SectokTypeId -> stId[] of all owned STs
		mapping(uint256 => int256) ccyType_balance; // CcyTypeId -> spot/total cash balance -- signed, for potential -ve balances
		mapping(uint256 => int256) ccyType_reserved; // CcyTypeId -> total margin requirement [FUTURES] (available = balance - reserved)
		StructLib.FeeStruct spot_customFees; // global fee override - per ledger entry
		uint256 spot_sumQtyMinted;
		uint256 spot_sumQtyBurned;
		mapping(uint256 => uint16) ft_initMarginBips; // SectokTypeId -> custom initial margin override ("hedge exemption"); overrides FT-type value if set
		mapping(uint256 => uint128) ft_feePerContract; // SectokTypeId -> custom fee per contract override; overrides FT-type value if set
	}

	struct LedgerReturn {
		// ledger return structure
		bool exists;
		LedgerSecTokenReturn[] tokens; // STs with types & sizes (in contract base unit) information - v2
		uint256 spot_sumQty; // retained for caller convenience - v1 [SPOT types only]
		LedgerCcyReturn[] ccys; // currency balances
		uint256 spot_sumQtyMinted; // [SPOT types only]
		uint256 spot_sumQtyBurned; // [SPOT types only]
	}

	struct LedgerSecTokenReturn {
		bool exists;
		uint256 stId;
		uint256 tokTypeId;
		string tokTypeName;
		uint64 batchId;
		int64 mintedQty;
		int64 currentQty;
		int128 ft_price;
		address ft_ledgerOwner;
		int128 ft_lastMarkPrice;
		int128 ft_PL;
	}

	struct LedgerCcyReturn {
		uint256 ccyTypeId;
		string name;
		string unit;
		int256 balance;
		int256 reserved;
	}

	struct PackedSt {
		uint64 batchId; // can be zero for "batchless" future "auto-minted" tokens; non-zero for spot tok-types
		int64 mintedQty; // existence check field: should never be non-zero
		int64 currentQty; // current (variable) unit qty in the ST (i.e. burned = currentQty - mintedQty)
		int128 ft_price; // [FUTURE types only] -- becomes average price after combining
		address ft_ledgerOwner; // [FUTURE types only] -- for takePay() lookup of ledger owner by ST
		int128 ft_lastMarkPrice; // [FUTURE types only]
		int128 ft_PL; // [FUTURE types only] -- running total P&L
	}

	struct LedgerStruct {
		StructLib.ContractType contractType;
		// *** Batch LIST
		mapping(uint256 => SecTokenBatch) _batches; // main (spot) batch list: ST batches, by batch ID (future STs don't have batches)
		uint64 _batches_currentMax_id; // 1-based
		// *** SecTokens LIST
		mapping(uint256 => PackedSt) _sts; // stId => PackedSt
		uint256 _tokens_base_id; // 1-based - assigned (once, when set to initial zero value) by Mint()
		uint256 _tokens_currentMax_id; // 1-based - updated by Mint() and by transferSplitSecTokens()
		// *** LEDGER
		mapping(address => Ledger) _ledger; // main ledger list: all entries, by account
		address[] _ledgerOwners; // list of ledger owners (accounts)
		// global totals -- // 24k - exception/retain - needed for erc20 total supply
		uint256 _spot_totalMintedQty; // [SPOT types only] - todo: split by type?
		uint256 _spot_totalBurnedQty; // [SPOT types only] - todo: split by type?
		// 24k
		//PackedStTotals _spot_total;                             // [SPOT types only] - todo: split by type?

		// 24k
		//mapping(uint256 => uint256) _ccyType_totalFunded;
		//mapping(uint256 => uint256) _ccyType_totalWithdrawn;
		//mapping(uint256 => uint256) _ccyType_totalTransfered;
		//mapping(uint256 => uint256) _ccyType_totalFeesPaid;

		bool _contractSealed;
	}

	// SPOT FEE STRUCTURE -- (ledger or global) fees for all ccy's and token types
	struct FeeStruct {
		mapping(uint256 => bool) tokType_Set; // bool - values are set for the token type
		mapping(uint256 => bool) ccyType_Set; // bool - values are set for the currency type
		mapping(uint256 => SetFeeArgs) tok; // fee structure by token type
		mapping(uint256 => SetFeeArgs) ccy; // fee structure by currency type
	}

	struct SetFeeArgs {
		// fee for a specific ccy or token type
		uint256 fee_fixed; // ccy & tok: transfer/trade - apply fixed a, if any
		uint256 fee_percBips; // ccy & tok: transfer/trade - add a basis points a, if any - in basis points, i.e. minimum % = 1bp = 1/100 of 1% = 0.0001x
		uint256 fee_min; // ccy & tok: transfer/trade - collar for a (if >0)
		uint256 fee_max; // ccy & tok: transfer/trade - and cap for a (if >0)
		uint256 ccy_perMillion; // ccy only: trade - fixed ccy fee per million of trade counterparty's consideration token qty
		bool ccy_mirrorFee; // ccy only: trade - apply this ccy fee structure to counterparty's ccy balance, post trade
	}

	struct Erc20Struct {
		address[] _whitelist;
		mapping(address => bool) _whitelisted;
		mapping(address => mapping(address => uint256)) _allowances; // account => [ { spender, allowance } ]
		//uint256 _nextWhitelistNdx;
	}

	struct RetokenizationBurningParam {
		address batchOwner; // TODO: repace with ledger owner
		uint tokenTypeId;
		uint[] k_stIds;
		uint qty;
	}

	event TransferedLedgerCcy(
		address indexed from,
		address indexed to,
		uint256 ccyTypeId,
		uint256 amount,
		TransferType transferType
	);

	event ReservedLedgerCcy(address indexed ledgerOwner, uint256 ccyTypeId, uint256 amount);

	function transferCcy(StructLib.LedgerStruct storage ld, TransferCcyArgs memory a) public {
		if (a.amount > 0) {
			require(a.amount <= uint256(type(int256).max), "Bound check found overflow");
			ld._ledger[a.from].ccyType_balance[a.ccyTypeId] -= int256(a.amount);
			ld._ledger[a.to].ccyType_balance[a.ccyTypeId] += int256(a.amount);
			emitTransferedLedgerCcy(a);
		}
	}

	function emitTransferedLedgerCcy(TransferCcyArgs memory a) public {
		if (a.amount > 0) {
			emit StructLib.TransferedLedgerCcy(a.from, a.to, a.ccyTypeId, a.amount, a.transferType);
		}
	}

	/**
	 * @notice Sets the reserved (unavailable/margined) currency amount for the specified ledger owner
	 * @param ledger Ledger owner
	 * @param ccyTypeId currency type
	 * @param reservedAmount Reserved amount to set
	 */
	function setReservedCcy(
		StructLib.LedgerStruct storage ld,
		StructLib.CcyTypesStruct storage ctd,
		address ledger,
		uint256 ccyTypeId,
		int256 reservedAmount
	) public {
		require(ccyTypeId >= 1 && ccyTypeId <= ctd._ct_Count, "Bad ccyTypeId");
		initLedgerIfNew(ld, ledger);
		require(
			ld._ledger[ledger].ccyType_balance[ccyTypeId] >= reservedAmount,
			"Reservation exceeds balance"
		);
		require(reservedAmount >= 0, "Bad reservedAmount");

		if (ld._ledger[ledger].ccyType_reserved[ccyTypeId] != reservedAmount) {
			ld._ledger[ledger].ccyType_reserved[ccyTypeId] = reservedAmount;
			emit ReservedLedgerCcy(ledger, ccyTypeId, uint256(reservedAmount));
		}
	}

	/**
	 * @notice Creates a new ledger entry, if not already existing
	 * @param ld Ledger data
	 * @param addr Ledger entry address
	 */
	function initLedgerIfNew(StructLib.LedgerStruct storage ld, address addr) public {
		if (!ld._ledger[addr].exists) {
			StructLib.Ledger storage entry = ld._ledger[addr];
			entry.exists = true;
			ld._ledgerOwners.push(addr);
		}
	}

	/**
	 * @notice Checks if the supplied ledger owner holds at least the specified quantity of supplied ST type
	 * @param ledger Ledger owner
	 * @param tokTypeId ST type
	 * @param qty Validation quantity in contract base unit
	 */
	function sufficientTokens(
		StructLib.LedgerStruct storage ld,
		address ledger,
		uint256 tokTypeId,
		int256 qty,
		int256 fee
	) public view returns (bool) {
		int256 qtyAvailable;
		require(ld._contractSealed, "Contract is not sealed");
		require(ld._ledger[ledger].exists == true, "Bad ledgerOwner");

		uint256[] memory tokenTypeStIds = ld._ledger[ledger].tokenType_stIds[tokTypeId];
		for (uint256 i = 0; i < tokenTypeStIds.length; i++) {
			qtyAvailable += ld._sts[tokenTypeStIds[i]].currentQty;
		}
		return qtyAvailable >= qty + fee;
	}

	/**
	 * @notice Checks if the supplied ledger owner holds at least the specified amount of supplied currency type
	 * @param ledger Ledger owner
	 * @param ccyTypeId currency type
	 * @param sending Amount to be sent
	 * @param receiving Amount to be received
	 * @param fee Fee to be paid
	 */
	function sufficientCcy(
		StructLib.LedgerStruct storage ld,
		address ledger,
		uint256 ccyTypeId,
		int256 sending,
		int256 receiving,
		int256 fee
	) public view returns (bool) {
		require(ld._contractSealed, "Contract is not sealed");
		require(ld._ledger[ledger].exists == true, "Bad ledgerOwner");
		return
			(ld._ledger[ledger].ccyType_balance[ccyTypeId] +
				receiving -
				ld._ledger[ledger].ccyType_reserved[ccyTypeId]) >= sending + fee;
	}

	/**
	 * @notice Checks if the supplied token of supplied type is present on the supplied ledger entry
	 * @param ledger Ledger owner
	 * @param tokTypeId Token type ID
	 * @param stId Security token ID
	 */
	function tokenExistsOnLedger(
		StructLib.LedgerStruct storage ld,
		uint256 tokTypeId,
		address ledger,
		uint256 stId
	) public view returns (bool) {
		uint256[] memory tokenTypeStIds = ld._ledger[ledger].tokenType_stIds[tokTypeId];
		for (uint256 x = 0; x < tokenTypeStIds.length; x++) {
			if (tokenTypeStIds[x] == stId) {
				return true;
			}
		}

		return false;
	}
}
