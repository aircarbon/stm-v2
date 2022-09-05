// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms
pragma solidity 0.8.5;

import { StructLib } from "../libraries/StructLib.sol";
import { LibMainStorage } from "../libraries/LibMainStorage.sol";

/**
 * @title Security Token Master
 * @author Dominic Morris (7-of-9) and Ankur Daharwal (ankurdaharwal)
 * @notice STMaster is configured at the deployment time to one of:<br/>
 * <pre>   - commodity token (CT): a semi-fungible (multi-batch), multi-type & single-version commodity underlying; or</pre>
 * <pre>   - cashflow token (CFT): a fully-fungible, multi-type & multi-version (recursive/linked contract deployments) cashflow-generating underlyings.</pre>
 * <pre>   - cashflow controller (CFC): singleton cashflow token governance contract; keeps track of global ledger and states across n CFTs</pre>
 * It is an EVM-compatible set of smart contracts written in Solidity, comprising:<br/><br/>
 * <pre>   (a) asset-backed, multi token/collateral-type atomic spot cash collateral trading & on-chain settlement;</pre>
 * <pre>   (b) scalable, semi-fungible & metadata-backed extendible type-system;</pre>
 * <pre>   (c) upgradable contracts: cryptographic checksumming of v+0 and v+1 contract data fields;</pre>
 * <pre>   (d) full ERC20 implementation (inc. transferFrom, allowance, approve) for self-custody;</pre>
 * <pre>   (e) multiple reserved contract owner/operator addresses, for concurrent parallel/batched operations via independent account-nonce sequencing;</pre>
 * <pre>   (f) split ledger: hybrid permission semantics - owner-controller ("whitelisted") addresses for centralised spot trade execution,<br/>
 *       alongside third-party controlled ("graylisted") addresses for self-custody;</pre>
 * <pre>   (g) generic metadata batch minting via extendible (append-only, immutable) KVP collection;</pre>
 * <pre>   (h) hybrid on/off chain futures settlement engine (take & pay period processing, via central clearing account),<br/>
 *       with on-chain position management & position-level P&L;</pre>
 * <pre>   (i) decentralized issuance of cashflow tokens & corporate actions: subscriber cashflow (e.g. ETH/BNB) <br/>
 *       processing of (USD-priced or ETH/BNB-priced) token issuances, and (inversely) issuer cashflow processing of CFT-equity or CFT-loan payments.</pre>
 * @dev All function calls are currently implemented without side effects
 */

contract StMasterFacet {
	// === STM (AC COMMODITY) ===
	// TODO: type-rename...
	// todo: drop fee_fixed completely (it's == fee_min)
	// todo: etherscan -> verify contract interfaces? -- needs ctor bytecode
	// todo: change internalTransfer so it can operate on *any* stTypeId

	// events -- (hack: see: https://ethereum.stackexchange.com/questions/11137/watching-events-defined-in-libraries)
	// need to be defined (duplicated) here - web3 can't see event signatures in libraries
	// CcyLib events
	event AddedCcyType(uint256 id, string name, string unit);
	event CcyFundedLedger(uint256 ccyTypeId, address indexed to, int256 amount, string desc);
	event CcyWithdrewLedger(uint256 ccyTypeId, address indexed from, int256 amount, string desc);
	// TokenLib events
	event AddedSecTokenType(
		uint256 id,
		string name,
		StructLib.SettlementType settlementType,
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
	event SetBatchOriginatorFee_Token(uint256 indexed batchId, StructLib.SetFeeArgs originatorFee);
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
	// StructLib events
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

	function init(
		StructLib.ContractType _contractType,
		string memory _contractName,
		string memory _contractVer,
		string memory _contractUnit
	) external {
		LibMainStorage.MainStorage storage s = LibMainStorage.getStorage();

		s.name = _contractName;
		s.version = _contractVer;
		s.unit = _contractUnit;

		s.ld.contractType = _contractType;
	}

	/**
	 * @dev permanenty seals the contract; once sealed, no further addresses can be whitelisted
	 */
	function sealContract() external {
		LibMainStorage.getStorage().ld._contractSealed = true;
	}

	function name() external view returns (string memory _name) {
		_name = LibMainStorage.getStorage().name;
	}

	function version() external view returns (string memory _version) {
		_version = LibMainStorage.getStorage().version;
	}

	function unit() external view returns (string memory _unit) {
		_unit = LibMainStorage.getStorage().unit;
	}

	/**
	 * @dev returns the contract type
	 * @return contractType
	 * @param contractType returns the contract type<br/>0: commodity token<br/>1: cashflow token<br/>2: cashflow controller
	 */
	function getContractType() external view returns (StructLib.ContractType contractType) {
		return LibMainStorage.getStorage().ld.contractType;
	}

	/**
	 * @dev returns the contract seal status
	 * @return isSealed
	 * @param isSealed returns the contract seal status : true or false
	 */
	function getContractSeal() external view returns (bool isSealed) {
		return LibMainStorage.getStorage().ld._contractSealed;
	}
}
