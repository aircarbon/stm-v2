// SPDX-License-Identifier: AGPL-3.0-only - (c) AirCarbon Pte Ltd - see /LICENSE.md for Terms

// @ts-check
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
// keep -s/--entity as strings: an all-digit value would otherwise be parsed as a number
const argv = require('yargs-parser')(process.argv.slice(2), { string: ['s', 'entity'] });

const ZERO = '0x0000000000000000000000000000000000000000';
const INT64_MAX = (1n << 63n) - 1n; // burnTokens limit per call
const TOP = 10;

/**
 * Dry run for clearing an entity before migration. Reads a backup made by backup.js and reports what burning all the
 * entity's tokens and withdrawing all its currency involves. Changes nothing on chain.
 * The exact operations are written to data/clear-plan-0x<s>-entity-<entity>.json for the clearing step.
 *
 * Usage: `node contract_upgrade/dataAdjustedRemoval/analyzeEntity.js -s=SOURCE_ADDR --entity=ENTITY_ID`
 */
function main() {
  const sourceAddress = `0x${String(argv?.s ?? '').replace(/^0x/i, '')}`.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(sourceAddress)) {
    throw new Error(`Invalid source address: ${sourceAddress}`);
  }
  const entityId = String(argv?.entity ?? '');
  if (!/^[1-9][0-9]*$/.test(entityId)) {
    throw new Error(`Invalid entity ID: ${entityId}`);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const backupFile = path.join(dataDir, `${sourceAddress}.json`);
  const bytes = fs.readFileSync(backupFile);
  const { info, data } = JSON.parse(bytes.toString());

  const entities = data.entitiesWithFeeOwners.map((entity) => ({ id: String(entity.id), addr: entity.addr }));
  const entityIndex = entities.findIndex((entity) => entity.id === entityId);
  if (entityIndex < 0) {
    throw new Error(`Entity ${entityId} not found. Entities: ${entities.map((entity) => entity.id).join(', ')}`);
  }

  // accountEntities is positional: entry i is the entity of whitelist address i
  const entityOf = new Map(
    data.whitelistAddresses.map((addr, i) => [addr.toLowerCase(), String(data.accountEntities[i] ?? '0')]),
  );
  const entityOfAddress = (addr) => entityOf.get(addr.toLowerCase()) ?? 'not whitelisted';
  const positions = [];
  data.whitelistAddresses.forEach((addr, i) => {
    if (entityOfAddress(addr) === entityId) positions.push(i);
  });
  const isEntityAccount = (addr) => entityOfAddress(addr) === entityId;

  const ccyById = new Map(data.ccyTypes.map((ccy) => [String(ccy.id), ccy]));
  const batchById = new Map(data.batches.map((batch) => [String(batch.id), batch]));
  const batchEntity = (batchId) => entityOfAddress(batchById.get(String(batchId))?.originator ?? ZERO);

  // what the entity's accounts hold
  const burns = new Map(); // one burnTokens call per account and token type
  const withdrawals = [];
  const warnings = [];
  const byType = new Map();
  const byAccount = new Map();
  const touchedBatches = new Set();
  let ledgerCount = 0;
  let tokenCount = 0;
  let burnTotal = 0n;
  let foreignCount = 0;
  let foreignQty = 0n;
  data.ledgerOwners.forEach((owner, i) => {
    if (!isEntityAccount(owner)) return;
    ledgerCount++;
    const ledger = data.ledgers[i];
    for (const token of ledger.tokens) {
      const qty = BigInt(token.currentQty);
      if (qty <= 0n) {
        warnings.push(`Token ${token.stId} on ${owner} has quantity ${qty}; it is not burnable`);
        continue;
      }
      tokenCount++;
      burnTotal += qty;
      touchedBatches.add(String(token.batchId));
      if (batchEntity(token.batchId) !== entityId) {
        foreignCount++;
        foreignQty += qty;
      }

      const key = `${owner.toLowerCase()}|${token.tokTypeId}`;
      const burn = burns.get(key) ?? {
        account: owner,
        tokTypeId: String(token.tokTypeId),
        tokTypeName: token.tokTypeName,
        qty: 0n,
        tokens: [],
      };
      burn.qty += qty;
      burn.tokens.push({ stId: String(token.stId), qty: qty.toString() });
      burns.set(key, burn);

      const type = byType.get(token.tokTypeName) ?? { tokens: 0, qty: 0n };
      type.tokens++;
      type.qty += qty;
      byType.set(token.tokTypeName, type);
      const account = byAccount.get(owner) ?? { tokens: 0, qty: 0n };
      account.tokens++;
      account.qty += qty;
      byAccount.set(owner, account);
    }
    for (const ccy of ledger.ccys) {
      const balance = BigInt(ccy.balance);
      const reserved = BigInt(ccy.reserved);
      if (balance === 0n && reserved === 0n) continue;
      withdrawals.push({ account: owner, ccyTypeId: String(ccy.ccyTypeId), balance, reserved });
      if (reserved !== 0n) {
        warnings.push(`${owner} has ${formatCcy(reserved, ccyById.get(String(ccy.ccyTypeId)))} reserved; release it before withdrawing`);
      }
      if (balance < 0n) {
        warnings.push(`${owner} has a negative ${ccy.name} balance (${balance})`);
      }
    }
  });
  for (const burn of burns.values()) {
    if (burn.qty > INT64_MAX) warnings.push(`Burn for ${burn.account} type ${burn.tokTypeId} exceeds int64; split it`);
  }

  // the entity's own batches and where their tokens are now
  const ownBatches = data.batches.filter((batch) => isEntityAccount(batch.originator));
  const ownBatchIds = new Set(ownBatches.map((batch) => String(batch.id)));
  let heldByOthersCount = 0;
  let heldByOthersQty = 0n;
  data.ledgerOwners.forEach((owner, i) => {
    if (isEntityAccount(owner)) return;
    for (const token of data.ledgers[i].tokens) {
      if (ownBatchIds.has(String(token.batchId)) && BigInt(token.currentQty) > 0n) {
        heldByOthersCount++;
        heldByOthersQty += BigInt(token.currentQty);
      }
    }
  });

  // fee settings that the adjust step removes; fee lists are ordered type-major, one entry per entity
  const isSet = (fee) =>
    Boolean(fee) &&
    (Number(fee.fee_fixed) ||
      Number(fee.fee_percBips) ||
      Number(fee.fee_min) ||
      Number(fee.fee_max) ||
      Number(fee.ccy_perMillion) ||
      Boolean(fee.ccy_mirrorFee));
  const entityCcyFees = data.ccyTypes.filter((_, c) => isSet(data.ccyFees[c * entities.length + entityIndex])).length;
  const entityTokenFees = data.tokenTypes.filter((_, t) => isSet(data.tokenFees[t * entities.length + entityIndex])).length;
  let accountFees = 0;
  data.ledgerOwners.forEach((owner, i) => {
    if (!isEntityAccount(owner)) return;
    const fees = data.ledgerOwnersFees[i] ?? { currencies: [], tokens: [] };
    accountFees += [...fees.currencies, ...fees.tokens].filter(isSet).length;
  });

  // accounts with a role outside the entity
  for (const owner of [...info.owners, info.deploymentOwner]) {
    if (isEntityAccount(owner)) warnings.push(`Contract owner ${owner} belongs to entity ${entityId}`);
  }
  entities.forEach((entity) => {
    if (entity.id !== entityId && isEntityAccount(entity.addr)) {
      warnings.push(`Fee owner of entity ${entity.id} (${entity.addr}) belongs to entity ${entityId}`);
    }
  });

  const minted = BigInt(data.secTokenMintedQty);
  const burned = BigInt(data.secTokenBurnedQty);
  const unit = info.unit;

  console.log(`Entity ${entityId} on ${info.name} (${info.contractAddress}, ${info.network})`);
  console.log(`Backup: ${backupFile} (file modified ${fs.statSync(backupFile).mtime.toISOString()})`);
  console.log(`Entity fee owner: ${entities[entityIndex].addr} (entity ${entityOfAddress(entities[entityIndex].addr)})`);

  console.log('\nAccounts');
  console.log(`  assigned to entity:  ${positions.length} (whitelist positions ${positions[0] ?? '-'}–${positions.at(-1) ?? '-'})`);
  console.log(`  with ledger entry:   ${ledgerCount}`);
  console.log(`  holding tokens:      ${byAccount.size}`);
  console.log(`  holding currency:    ${new Set(withdrawals.map((w) => w.account)).size}`);

  console.log('\nTokens to burn');
  console.log(`  ${format(tokenCount)} tokens, ${format(burnTotal)} ${unit} in total, ${byType.size} token types, ${touchedBatches.size} batches`);
  console.log(`  ${burns.size} burnTokens transactions (one per account and token type)`);
  console.log(`  minted by other entities: ${format(foreignCount)} tokens, ${format(foreignQty)} ${unit}`);
  printTop('By token type', byType, (row) => ({ tokens: row.tokens, [`qty (${unit})`]: format(row.qty) }));
  printTop('By account', byAccount, (row) => ({ tokens: row.tokens, [`qty (${unit})`]: format(row.qty) }));

  console.log('\nCurrency to withdraw');
  const byCcy = new Map();
  for (const withdrawal of withdrawals) {
    const row = byCcy.get(withdrawal.ccyTypeId) ?? { accounts: 0, balance: 0n, reserved: 0n };
    row.accounts++;
    row.balance += withdrawal.balance;
    row.reserved += withdrawal.reserved;
    byCcy.set(withdrawal.ccyTypeId, row);
  }
  if (byCcy.size === 0) console.log('  none');
  else {
    console.log(`  ${withdrawals.length} fundOrWithdraw transactions (one per account and currency)`);
    console.table(
      Object.fromEntries(
        [...byCcy].map(([id, row]) => [
          ccyById.get(id).name,
          {
            accounts: row.accounts,
            balance: formatCcy(row.balance, ccyById.get(id)),
            reserved: formatCcy(row.reserved, ccyById.get(id)),
          },
        ]),
      ),
    );
  }

  console.log("\nEntity's own batches (kept as history)");
  console.log(`  ${ownBatches.length} batches, minted ${format(ownBatches.reduce((sum, b) => sum + BigInt(b.mintedQty), 0n))} ${unit}, already burned ${format(ownBatches.reduce((sum, b) => sum + BigInt(b.burnedQty), 0n))} ${unit}`);
  console.log(`  held by other entities (not burned): ${format(heldByOthersCount)} tokens, ${format(heldByOthersQty)} ${unit}`);

  console.log('\nGlobal totals after the burn');
  console.log(`  minted:   ${format(minted)} ${unit} (unchanged)`);
  console.log(`  burned:   ${format(burned)} → ${format(burned + burnTotal)} ${unit}`);
  console.log(`  in circulation: ${format(minted - burned)} → ${format(minted - burned - burnTotal)} ${unit}`);

  console.log('\nFee settings removed later (adjust step)');
  console.log(`  entity level: ${entityCcyFees} currency, ${entityTokenFees} token type; per account: ${accountFees}`);

  console.log('\nWarnings');
  if (warnings.length === 0) console.log('  none');
  for (const warning of warnings) console.log(`  - ${warning}`);

  const planFile = path.join(dataDir, `clear-plan-${sourceAddress}-entity-${entityId}.json`);
  const plan = {
    source: {
      file: path.basename(backupFile),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contractAddress: info.contractAddress,
      network: info.network,
      name: info.name,
    },
    entityId,
    burns: [...burns.values()].map((burn) => ({ ...burn, qty: burn.qty.toString() })),
    withdrawals: withdrawals.map((w) => ({
      account: w.account,
      ccyTypeId: w.ccyTypeId,
      ccyName: ccyById.get(w.ccyTypeId).name,
      amount: w.balance.toString(),
      reserved: w.reserved.toString(),
    })),
    totals: {
      tokens: tokenCount,
      burnQty: burnTotal.toString(),
      secTokenBurnedQtyBefore: burned.toString(),
      secTokenBurnedQtyAfter: (burned + burnTotal).toString(),
    },
  };
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
  console.log(`\nPlan written to ${planFile}`);
}

function format(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCcy(amount, ccy) {
  const decimals = Number(ccy.decimals);
  const digits = (amount < 0n ? -amount : amount).toString().padStart(decimals + 1, '0');
  const whole = format(digits.slice(0, digits.length - decimals));
  const fraction = decimals > 0 ? `.${digits.slice(-decimals)}` : '';
  return `${amount < 0n ? '-' : ''}${whole}${fraction} ${ccy.name}`;
}

function printTop(title, rows, toRow) {
  if (rows.size === 0) return;
  const sorted = [...rows].sort(([, a], [, b]) => (b.qty > a.qty ? 1 : b.qty < a.qty ? -1 : 0));
  console.log(`  ${title}${rows.size > TOP ? ` (top ${TOP} of ${rows.size})` : ''}:`);
  console.table(Object.fromEntries(sorted.slice(0, TOP).map(([key, row]) => [key, toRow(row)])));
}

try {
  main();
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
