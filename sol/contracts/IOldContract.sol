// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
// Author: https://github.com/7-of-9
// Certik (AD): locked compiler version
pragma solidity 0.8.5;

import "./StructLibOld.sol";

interface IOldContract {
	
	// CcyLib events
	event AddedCcyType(uint256 id, string name, string unit);
	event CcyFundedLedger(uint256 ccyTypeId, address indexed to, int256 amount, string desc);
	event CcyWithdrewLedger(uint256 ccyTypeId, address indexed from, int256 amount, string desc);
	// TokenLib events
	event AddedSecTokenType(
		uint256 id,
		string name,
		StructLibOld.SettlementType settlementType,
		uint64 expiryTimestamp,
		uint256 underlyerTypeId,
		uint256 refCcyId,
		uint16 initMarginBips,
		uint16 varMarginBips
	);
	event SetFutureVariationMargin(uint256 tokTypeId, uint16 varMarginBips);
	event SetFutureFeePerContract(uint256 tokTypeId, uint256 feePerContract);
	event Burned(uint256 tokTypeId, address indexed from, uint256 burnedQty);
	event BurnedFullSecToken(
		uint256 indexed stId,
		uint256 tokTypeId,
		address indexed from,
		uint256 burnedQty
	);
	event BurnedPartialSecToken(
		uint256 indexed stId,
		uint256 tokTypeId,
		address indexed from,
		uint256 burnedQty
	);
	event Minted(
		uint256 indexed batchId,
		uint256 tokTypeId,
		address indexed to,
		uint256 mintQty,
		uint256 mintSecTokenCount
	);
	event MintedSecToken(
		uint256 indexed stId,
		uint256 indexed batchId,
		uint256 tokTypeId,
		address indexed to,
		uint256 mintedQty
	);
	event AddedBatchMetadata(uint256 indexed batchId, string key, string value);
	event SetBatchOriginatorFee_Token(uint256 indexed batchId, StructLibOld.SetFeeArgs originatorFee);
	event SetBatchOriginatorFee_Currency(uint256 indexed batchId, uint16 origCcyFee_percBips_ExFee);
	// TransferLib events
	event TransferedFullSecToken(
		address indexed from,
		address indexed to,
		uint256 indexed stId,
		uint256 mergedToSecTokenId,
		uint256 qty,
		TransferType transferType
	);
	event TransferedPartialSecToken(
		address indexed from,
		address indexed to,
		uint256 indexed splitFromSecTokenId,
		uint256 newSecTokenId,
		uint256 mergedToSecTokenId,
		uint256 qty,
		TransferType transferType
	);
	event TradedCcyTok(
		uint256 ccyTypeId,
		uint256 ccyAmount,
		uint256 tokTypeId,
		address indexed from, // tokens
		address indexed to, // tokens
		uint256 tokQty,
		uint256 ccyFeeFrom,
		uint256 ccyFeeTo
	);
	// StructLibOld events
	enum TransferType {
		Undefined,
		User,
		ExchangeFee,
		OriginatorFee,
		TakePayFee,
		SettleTake,
		SettlePay,
		MintFee,
		BurnFee,
		WithdrawFee,
		DepositFee,
		DataFee,
		OtherFee1,
		OtherFee2,
		OtherFee3,
		OtherFee4,
		OtherFee5,
		RelatedTransfer,
		Adjustment,
		ERC20,
		Subscription
	}
	event TransferedLedgerCcy(
		address indexed from,
		address indexed to,
		uint256 ccyTypeId,
		uint256 amount,
		TransferType transferType
	);
	event ReservedLedgerCcy(address indexed ledgerOwner, uint256 ccyTypeId, uint256 amount);
	// SpotFeeLib events
	event SetFeeTokFix(uint256 tokTypeId, address indexed ledgerOwner, uint256 fee_tokenQty_Fixed);
	event SetFeeCcyFix(uint256 ccyTypeId, address indexed ledgerOwner, uint256 fee_ccy_Fixed);
	event SetFeeTokBps(uint256 tokTypeId, address indexed ledgerOwner, uint256 fee_token_PercBips);
	event SetFeeCcyBps(uint256 ccyTypeId, address indexed ledgerOwner, uint256 fee_ccy_PercBips);
	event SetFeeTokMin(uint256 tokTypeId, address indexed ledgerOwner, uint256 fee_token_Min);
	event SetFeeCcyMin(uint256 ccyTypeId, address indexed ledgerOwner, uint256 fee_ccy_Min);
	event SetFeeTokMax(uint256 tokTypeId, address indexed ledgerOwner, uint256 fee_token_Max);
	event SetFeeCcyMax(uint256 ccyTypeId, address indexed ledgerOwner, uint256 fee_ccy_Max);
	event SetFeeCcyPerMillion(
		uint256 ccyTypeId,
		address indexed ledgerOwner,
		uint256 fee_ccy_perMillion
	);
	// Erc20Lib
	event Transfer(address indexed from, address indexed to, uint256 value);
	event Approval(address indexed owner, address indexed spender, uint256 value);
	// PayableLib events
	event IssuanceSubscribed(
		address indexed subscriber,
		address indexed issuer,
		uint256 weiSent,
		uint256 weiChange,
		uint256 tokensSubscribed,
		uint256 weiPrice
	);
	// Issuer Payment events
	event IssuerPaymentProcessed(
		uint32 indexed paymentId,
		address indexed issuer,
		uint256 totalAmount,
		uint32 totalBatchCount
	);
	event IssuerPaymentBatchProcessed(
		uint32 indexed paymentId,
		uint32 indexed paymentBatchId,
		address indexed issuer,
		uint256 weiSent,
		uint256 weiChange
	);
	event SubscriberPaid(
		uint32 indexed paymentId,
		uint32 indexed paymentBatchId,
		address indexed issuer,
		address subscriber,
		uint256 amount
	);
	// FuturesLib events
	event FutureOpenInterest(
		address indexed long,
		address indexed short,
		uint256 shortStId,
		uint256 tokTypeId,
		uint256 qty,
		uint256 price,
		uint256 feeLong,
		uint256 feeShort
	);
	event SetInitialMarginOverride(
		uint256 tokTypeId,
		address indexed ledgerOwner,
		uint16 initMarginBips
	);
	//event TakePay(address indexed from, address indexed to, uint256 delta, uint256 done, address indexed feeTo, uint256 otmFee, uint256 itmFee, uint256 feeCcyId);
	event TakePay2(
		address indexed from,
		address indexed to,
		uint256 ccyId,
		uint256 delta,
		uint256 done,
		uint256 fee
	);
	event Combine(address indexed to, uint256 masterStId, uint256 countTokensCombined);
	
	function sealContract() external;

	function getContractType() external view returns (StructLibOld.ContractType contractType);
	function getContractSeal() external view returns (bool isSealed);

	//////////////////////////////////////////////////////////////////
	// CcyCollateralizable
	//////////////////////////////////////////////////////////////////

	function getCcyTypes() external view returns (StructLibOld.GetCcyTypesReturn memory ccyTypes);
	
	function addCcyType(
		string memory name,
		string memory unit,
		uint16 decimals
	) external;
	
	function fundOrWithdraw(
		StructLibOld.FundWithdrawType direction,
		uint256 ccyTypeId,
		int256 amount,
		address ledgerOwner,
		string calldata desc
	) external;

	//////////////////////////////////////////////////////////////////
	// DataLoadable
	//////////////////////////////////////////////////////////////////

	function createLedgerEntryBatch(StructLibOld.CreateLedgerEntryArgs[] calldata params) external;

	function createLedgerEntry(
		address ledgerEntryOwner,
		StructLibOld.LedgerCcyReturn[] memory ccys,
		uint256 spot_sumQtyMinted,
		uint256 spot_sumQtyBurned
	) external;

	function addSecToken(
		address ledgerEntryOwner,
		uint64 batchId,
		uint256 stId,
		uint256 tokTypeId,
		int64 mintedQty,
		int64 currentQty,
		int128 ft_price,
		int128 ft_lastMarkPrice,
		address ft_ledgerOwner,
		int128 ft_PL
	) external;
	
	function setTokenTotals(
		//uint80 packed_ExchangeFeesPaidQty, uint80 packed_OriginatorFeesPaidQty, uint80 packed_TransferedQty,
		uint256 base_id,
		uint256 currentMax_id,
		uint256 totalMintedQty,
		uint256 totalBurnedQty
	) external;

	function setCcyTotals(
	    //LoadLib.SetCcyTotalArgs memory a
	    uint256 ccyTypeId,
	    uint256 totalFunded,
	    uint256 totalWithdrawn,
	    uint256 totalTransfered,
	    uint256 totalFeesPaid
	) external;

	//////////////////////////////////////////////////////////////////
	// Owned
	//////////////////////////////////////////////////////////////////
	
	enum CustodyType {
		SELF_CUSTODY,
		THIRD_PARTY_CUSTODY
	}
	
	function setReadOnly(bool readOnlyNewState) external;
	
	function readOnly() external view returns (bool isReadOnly);
	
	function getOwners() external view returns (address[] memory deploymentOwners);

	//////////////////////////////////////////////////////////////////
	// StBurnable
	//////////////////////////////////////////////////////////////////

	function getSecToken_totalBurnedQty() external view returns (uint256 totalBurnedQty);

	function burnTokens(
		address ledgerOwner,
		uint256 tokTypeId,
		int256 burnQty,
		uint256[] memory stIds // IFF supplied (len > 0): sum of supplied STs current qty must == supplied burnQty
	) external;

	//////////////////////////////////////////////////////////////////
	// StErc20
	//////////////////////////////////////////////////////////////////

	function setEntityBatch(address[] calldata addr, uint[] calldata entityId) external;

	function setEntity(address addr, uint entityId) external;

	function whitelistMany(address[] calldata addr) external;

	function getWhitelistCount() external view returns (uint256 whitelistAddressCount);

	function getWhitelist() external view returns (address[] memory whitelistAddresses);

	function getWhitelist(uint256 pageNo, uint256 pageSize)
		external
		view
		returns (address[] memory whitelistAddresses);

	function transfer(address recipient, uint256 amount) external returns (bool transferStatus);

	function transferFrom(
		address sender,
		address recipient,
		uint256 amount
	) external returns (bool transferFromStatus);

	function approve(address spender, uint256 amount) external returns (bool approvalStatus);

	function totalSupply() external view returns (uint256 availableQty);

	function balanceOf(address account) external view returns (uint256 balance);
	
	function allowance(address sender, address spender)
		external
		view
		returns (uint256 spendAllowance);

	//////////////////////////////////////////////////////////////////
	// StFees
	//////////////////////////////////////////////////////////////////

	enum GetFeeType {
		CCY,
		TOK
	}

	function getFee(
		GetFeeType feeType,
		uint256 typeId,
		address ledgerOwner
	) external view returns (StructLibOld.SetFeeArgs memory fee);

	function setFee_TokType(
		uint256 tokTypeId,
		address ledgerOwner,
		StructLibOld.SetFeeArgs memory feeArgs
	) external;

	function setFee_CcyType(
		uint256 ccyTypeId,
		address ledgerOwner,
		StructLibOld.SetFeeArgs memory feeArgs
	) external;

	//////////////////////////////////////////////////////////////////
	// StLedger
	//////////////////////////////////////////////////////////////////

	function addSecTokenTypeBatch(StructLibOld.AddSecTokenTypeBatchArgs[] calldata params) external;

	function getSecTokenTypes()
		external
		view
		returns (StructLibOld.GetSecTokenTypesReturn memory secTokenTypes);

	function getLedgerOwners() external view returns (address[] memory ledgerOwners);

	function getLedgerOwnerCount() external view returns (uint256 ledgerOwnerCount);

	function getLedgerOwner(uint256 index) external view returns (address ledgerOwner);

	function getLedgerEntry(address account)
		external
		view
		returns (StructLibOld.LedgerReturn memory ledgerEntry);

	function getSecTokenBatch_MaxId() external view returns (uint256 secTokenBatch_MaxId);

	function getSecTokenBatch(uint256 batchId)
		external
		view
		returns (StructLibOld.SecTokenBatch memory secTokenBatch);
	
	function getSecToken_BaseId() external view returns (uint256 secTokenBaseId);

	function getSecToken_MaxId() external view returns (uint256 secTokenMaxId);

	function getSecToken(uint256 id)
		external
		view
		returns (StructLibOld.LedgerSecTokenReturn memory secToken);

	//////////////////////////////////////////////////////////////////
	// StMintable
	//////////////////////////////////////////////////////////////////

	function addMetaSecTokenBatch(
		uint64 batchId,
		string calldata metaKeyNew,
		string calldata metaValueNew
	) external;

	function setOriginatorFeeTokenBatch(uint64 batchId, StructLibOld.SetFeeArgs calldata originatorFee) external;

	function setOriginatorFeeCurrencyBatch(uint64 batchId, uint16 origCcyFee_percBips_ExFee) external;
	
	function getSecToken_totalMintedQty() external view returns (uint256 totalMintedQty);

	function mintSecTokenBatch(
		uint256 tokTypeId,
		uint256 mintQty,
		int64 mintSecTokenCount,
		address payable batchOwner,
		StructLibOld.SetFeeArgs memory originatorFee,
		uint16 origCcyFee_percBips_ExFee,
		string[] memory metaKeys,
		string[] memory metaValues
	) external;

	//////////////////////////////////////////////////////////////////
	// StTransferable
	//////////////////////////////////////////////////////////////////

	function getLedgerHashcode(uint256 mod, uint256 n)
		external
		view
		returns (bytes32 ledgerHashcode);

	function transfer_feePreview_ExchangeOnly(StructLibOld.TransferArgs calldata transferArgs)
		external
		view
		returns (StructLibOld.FeesCalc[1] memory feesAll);

	function transfer_feePreview(StructLibOld.TransferArgs calldata transferArgs)
		external
		view
		returns (StructLibOld.FeesCalc[1] memory);

	function transferOrTrade(StructLibOld.TransferArgs memory transferArgs) external;

	function addSecTokenBatch(StructLibOld.AddSecTokenBatchArgs[] calldata params) external;

	function addCcyTypeBatch(
		string[] calldata _name,
		string[] calldata _unit,
		uint16[] calldata _decimals
	) external;

	function setFee_CcyTypeBatch(StructLibOld.SetFeeCcyTypeBatchArgs[] calldata params) external;

	function setFee_TokTypeBatch(
		uint256[] calldata tokTypeId,
		address[] calldata ledgerOwner,
		StructLibOld.SetFeeArgs[] calldata feeArgs
	) external;
	
	 function loadSecTokenBatch(
		StructLibOld.SecTokenBatch[] memory batches,
		uint64 _batches_currentMax_id
	) external;

	function name() external view returns (string calldata);

	function version() external view returns (string calldata);

	function unit() external view returns (string calldata);

	function symbol() external view returns (string calldata);

	function decimals() external view returns (uint256);
}
