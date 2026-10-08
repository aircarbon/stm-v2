// Deliberately independent of Truffle, const.js, credentials and network clients.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');

const ZERO = `0x${'0'.repeat(40)}`;
const INT64_MAX = (1n << 63n) - 1n;
const ADDRESS_TEXT = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const address = (value) => {
  assert.equal(typeof value, 'string', 'address must be a string');
  assert.match(value, /^0x[0-9a-fA-F]{40}$/, 'invalid address');
  return value.toLowerCase();
};
const uint = (value) => {
  assert(
    typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)),
    'integer must be a decimal string or safe number',
  );
  assert.match(String(value), /^(0|[1-9][0-9]*)$/, 'invalid unsigned decimal');
  return BigInt(value);
};
const unique = (values) => {
  assert.equal(new Set(values).size, values.length, 'duplicate value');
  return values;
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  // Web3 decoders can represent small integers as numbers or decimal strings.
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
};
const equal = (actual, expected, label) =>
  assert.deepEqual(canonical(actual), canonical(expected), label);

function inspect(backup, evidence, digest) {
  assert.equal(evidence.environment, 'rehearsal', 'rehearsal evidence only');
  const scopeEntity = uint(evidence.entityId).toString();
  assert(scopeEntity !== '0', 'an assigned entity is required');
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.backupSha256, digest, 'backup byte hash mismatch');
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert(uint(evidence.chainId) > 0n);
  assert(uint(evidence.block.number) > 0n);
  assert.match(evidence.block.hash, /^0x[0-9a-fA-F]{64}$/);
  assert.equal(evidence.network, backup.info.network, 'network label mismatch');
  assert.equal(address(evidence.contractAddress), address(backup.info.contractAddress));
  assert.equal(uint(backup.info.contractType), 0n, 'commodity contracts only');
  const data = backup.data;
  const whitelist = unique(data.whitelistAddresses.map(address));
  const owners = unique(data.ledgerOwners.map(address));
  assert(!whitelist.includes(ZERO), 'zero address cannot be whitelisted');
  assert.equal(data.accountEntities.length, whitelist.length);
  assert.equal(data.ledgers.length, owners.length);
  assert.equal(data.ledgerOwnersFees.length, owners.length);
  const entities = data.accountEntities.map((id) => uint(id).toString());
  const scope = unique(evidence.scopeAccounts.map(address)).sort();
  assert(scope.length > 0, 'empty scope requires separate investigation');
  equal(
    scope,
    whitelist.filter((_, i) => entities[i] === scopeEntity).sort(),
    'entity scope mismatch',
  );
  for (const owner of owners)
    assert(whitelist.includes(owner), 'ledger owner missing from whitelist');
  assert.equal(
    data.transferedFullSecTokensEvents.length,
    0,
    'legacy transfer events need separate review',
  );
  const currencyIds = unique(data.ccyTypes.map((ccy) => uint(ccy.id).toString())).sort();
  const entityIds = unique(data.entitiesWithFeeOwners.map((entity) => uint(entity.id).toString()));
  assert(entityIds.includes(scopeEntity), 'selected entity missing');
  for (const id of entities) assert(id === '0' || entityIds.includes(id), 'unknown entity');
  const checkFees = (fees, count) => {
    assert(Array.isArray(fees), 'fee schedule missing');
    assert.equal(fees.length, count, 'incomplete fee schedule');
    for (const fee of fees) {
      for (const key of ['fee_fixed', 'fee_percBips', 'fee_min', 'fee_max', 'ccy_perMillion'])
        uint(fee[key]);
      assert.equal(typeof fee.ccy_mirrorFee, 'boolean', 'invalid mirror fee');
    }
  };
  checkFees(data.ccyFees, entityIds.length * currencyIds.length);
  checkFees(data.tokenFees, entityIds.length * data.tokenTypes.length);
  for (const fees of data.ledgerOwnersFees) {
    checkFees(fees.currencies, currencyIds.length);
    checkFees(fees.tokens, data.tokenTypes.length);
  }
  /** @type {Map<string, any>} */
  const types = new Map(data.tokenTypes.map((type) => [uint(type.id).toString(), type]));
  assert.equal(types.size, data.tokenTypes.length);
  for (const type of data.tokenTypes) {
    assert.equal(uint(type.settlementType), 1n, 'futures are outside this rehearsal');
    assert.equal(address(type.cashflowBaseAddr), ZERO, 'cashflow contracts need separate review');
  }
  /** @type {Map<string, any>} */
  const batches = new Map(data.batches.map((batch) => [uint(batch.id).toString(), batch]));
  assert.equal(batches.size, data.batches.length);
  const seen = new Set();
  const remainingByBatch = new Map();
  let total = 0n;
  const operations = [];
  const recordToken = (token, owner) => {
    const stId = uint(token.stId).toString();
    assert(
      uint(stId) > 0n && uint(stId) <= uint(data.secTokenMintedCount),
      'token ID outside counters',
    );
    assert(!seen.has(stId), 'duplicate token ID');
    seen.add(stId);
    assert(types.has(uint(token.tokTypeId).toString()), 'unknown token type');
    const batchId = uint(token.batchId).toString();
    const batch = batches.get(batchId);
    assert(batch, 'unknown batch');
    assert.equal(uint(batch.tokTypeId), uint(token.tokTypeId), 'batch type mismatch');
    const qty = uint(token.currentQty);
    assert(qty <= INT64_MAX && qty <= uint(token.mintedQty), 'invalid token quantity');
    if (owner === ZERO) assert.equal(qty, 0n, 'unowned token has a balance');
    remainingByBatch.set(batchId, (remainingByBatch.get(batchId) || 0n) + qty);
    total += qty;
    if (scope.includes(owner) && qty > 0n) {
      const operation = {
        account: owner,
        stId,
        batchId,
        tokTypeId: uint(token.tokTypeId).toString(),
        quantity: qty.toString(),
      };
      operations.push({
        id: sha256(
          JSON.stringify([
            evidence.chainId,
            address(evidence.contractAddress),
            evidence.block.hash,
            digest,
            operation,
          ]),
        ),
        ...operation,
      });
    }
  };
  data.ledgers.forEach((ledger, i) => {
    for (const token of ledger.tokens) recordToken(token, owners[i]);
    equal(
      uint(ledger.spot_sumQty).toString(),
      ledger.tokens.reduce((sum, token) => sum + uint(token.currentQty), 0n).toString(),
      'ledger quantity mismatch',
    );
    uint(ledger.spot_sumQtyMinted);
    uint(ledger.spot_sumQtyBurned);
    equal(
      unique(ledger.ccys.map((ccy) => uint(ccy.ccyTypeId).toString())).sort(),
      currencyIds,
      'missing ledger currency',
    );
    if (scope.includes(owners[i])) {
      for (const ccy of ledger.ccys) {
        assert.equal(uint(ccy.balance), 0n, 'scoped currency must be zero before token burns');
        assert.equal(uint(ccy.reserved), 0n, 'scoped reserve must be zero before token burns');
      }
    }
  });
  for (const token of data.globalSecTokens) recordToken(token, ZERO);
  assert.equal(BigInt(seen.size), uint(data.secTokenMintedCount), 'incomplete token inventory');
  for (const [id, batch] of batches) {
    checkFees([batch.origTokFee], 1);
    uint(batch.origCcyFee_percBips_ExFee);
    assert.equal(
      uint(batch.mintedQty) - uint(batch.burnedQty),
      remainingByBatch.get(id) || 0n,
      'batch quantity mismatch',
    );
  }
  assert.equal(
    uint(data.secTokenMintedQty) - uint(data.secTokenBurnedQty),
    total,
    'global quantity mismatch',
  );
  uint(data.secTokenBaseId);
  return operations.sort(
    (a, b) => a.account.localeCompare(b.account) || (BigInt(a.stId) < BigInt(b.stId) ? -1 : 1),
  );
}

function plan(backup, evidence, digest) {
  return {
    schemaVersion: 1,
    kind: 'offline-burn-proposal-not-authorization',
    source: evidence,
    operations: inspect(backup, evidence, digest),
  };
}

// Verify only exact whole-token burns. A missing token alone is not proof of a burn.
function verify(before, beforeEvidence, beforeDigest, after, afterEvidence, afterDigest) {
  const operations = inspect(before, beforeEvidence, beforeDigest);
  inspect(after, afterEvidence, afterDigest);
  assert.equal(
    uint(afterEvidence.entityId),
    uint(beforeEvidence.entityId),
    'selected entity changed',
  );
  equal(
    afterEvidence.scopeAccounts.map(address).sort(),
    beforeEvidence.scopeAccounts.map(address).sort(),
    'scope changed',
  );
  assert.equal(uint(afterEvidence.chainId), uint(beforeEvidence.chainId), 'chain changed');
  assert.equal(
    address(afterEvidence.contractAddress),
    address(beforeEvidence.contractAddress),
    'contract changed',
  );
  assert(
    uint(afterEvidence.block.number) >= uint(beforeEvidence.block.number),
    'block moved backwards',
  );
  if (uint(afterEvidence.block.number) === uint(beforeEvidence.block.number)) {
    assert.equal(
      afterEvidence.block.hash,
      beforeEvidence.block.hash,
      'same-height block hash changed',
    );
    assert.equal(afterDigest, beforeDigest, 'state changed within the pinned block');
  }
  const expected = structuredClone(before);
  const completed = [];
  const pending = [];
  for (const operation of operations) {
    const ownerIndex = before.data.ledgerOwners.map(address).indexOf(operation.account);
    const afterIndex = after.data.ledgerOwners.map(address).indexOf(operation.account);
    assert(afterIndex >= 0, 'ledger owner disappeared');
    const stillOwned = after.data.ledgers[afterIndex].tokens.find(
      (token) => uint(token.stId).toString() === operation.stId,
    );
    if (stillOwned) {
      assert.equal(
        uint(stillOwned.currentQty).toString(),
        operation.quantity,
        'partial quantity change: stop, do not retry',
      );
      pending.push(operation.id);
      continue;
    }
    const ledger = expected.data.ledgers[ownerIndex];
    const tokenIndex = ledger.tokens.findIndex(
      (token) => uint(token.stId).toString() === operation.stId,
    );
    const [token] = ledger.tokens.splice(tokenIndex, 1);
    token.currentQty = '0';
    expected.data.globalSecTokens.push(token);
    ledger.spot_sumQty = (uint(ledger.spot_sumQty) - uint(operation.quantity)).toString();
    ledger.spot_sumQtyBurned = (
      uint(ledger.spot_sumQtyBurned) + uint(operation.quantity)
    ).toString();
    expected.data.secTokenBurnedQty = (
      uint(expected.data.secTokenBurnedQty) + uint(operation.quantity)
    ).toString();
    const batch = expected.data.batches.find(
      (item) => uint(item.id).toString() === operation.batchId,
    );
    batch.burnedQty = (uint(batch.burnedQty) + uint(operation.quantity)).toString();
    completed.push(operation.id);
  }
  const normalizeTokenOrder = (backup) => {
    const result = structuredClone(backup);
    for (const tokens of [
      result.data.globalSecTokens,
      ...result.data.ledgers.map((ledger) => ledger.tokens),
    ]) {
      tokens.sort((a, b) => (uint(a.stId) < uint(b.stId) ? -1 : 1));
    }
    // The native ledger hash changes; byte hashes remain in both evidence files.
    delete result.ledgerHash;
    return result;
  };
  equal(
    normalizeTokenOrder(after),
    normalizeTokenOrder(expected),
    'unexpected state change outside exact planned burns',
  );
  return {
    kind: 'offline-progress-not-receipt-validation',
    complete: pending.length === 0,
    completed,
    pending,
    beforeSha256: beforeDigest,
    afterSha256: afterDigest,
  };
}

function remap(backup, evidence, digest, mapping) {
  assert.equal(inspect(backup, evidence, digest).length, 0, 'scoped tokens remain');
  assert.equal(mapping.schemaVersion, 1);
  assert.equal(mapping.backupSha256, digest, 'mapping bound to another backup');
  assert.match(mapping.path, /^m\/44'\/[0-9]+'\/0'\/0$/, 'unsupported derivation path');
  assert(
    Number.isSafeInteger(mapping.addressCount) && mapping.addressCount > 0,
    'positive address count required',
  );
  assert.equal(mapping.entries.length, mapping.addressCount);
  const entries = [...mapping.entries].sort((a, b) => a.index - b.index);
  const replacements = new Map();
  entries.forEach((entry, i) => {
    assert.equal(entry.index, i, 'missing or duplicate derivation index');
    replacements.set(address(entry.oldAddress), address(entry.newAddress));
  });
  assert.equal(replacements.size, entries.length, 'duplicate old address');
  unique([...replacements.values()]);
  const newAddresses = new Set(replacements.values());
  const preserved = unique(mapping.preservedAddresses.map(address));
  assert(!preserved.includes(ZERO), 'zero address is implicit');
  for (const [old, next] of replacements) {
    assert(old !== ZERO && next !== ZERO, 'zero address cannot be mapped');
    assert(!replacements.has(next) && !preserved.includes(next), 'new address collision');
    assert(!preserved.includes(old), 'address cannot be both preserved and mapped');
    assert(
      next !== address(backup.info.contractAddress),
      'new address collides with source contract',
    );
  }
  const result = structuredClone(backup);
  delete result.ledgerHash;
  // Classify source references before a destination can make them appear approved.
  for (const match of JSON.stringify(result).matchAll(ADDRESS_TEXT)) {
    const found = address(match[0]);
    assert(!newAddresses.has(found), 'new address already appears in source content');
    assert(
      found === ZERO ||
        found === address(backup.info.contractAddress) ||
        replacements.has(found) ||
        preserved.includes(found),
      'unclassified source address',
    );
  }
  const changes = [];
  const replace = (container, key, path) => {
    const old = address(container[key]);
    if (old === ZERO) return;
    const next = replacements.get(old);
    assert(next || preserved.includes(old), `unclassified account field: ${path}`);
    if (next) {
      container[key] = next;
      changes.push({ path, oldAddress: old, newAddress: next });
    }
  };
  result.info.owners.forEach((_, i) => replace(result.info.owners, i, `info.owners.${i}`));
  replace(result.info, 'deploymentOwner', 'info.deploymentOwner');
  for (const key of ['whitelistAddresses', 'ledgerOwners']) {
    result.data[key].forEach((_, i) => replace(result.data[key], i, `data.${key}.${i}`));
  }
  result.data.entitiesWithFeeOwners.forEach((row, i) =>
    replace(row, 'addr', `data.entitiesWithFeeOwners.${i}.addr`),
  );
  result.data.batches.forEach((row, i) =>
    replace(row, 'originator', `data.batches.${i}.originator`),
  );
  result.data.globalSecTokens.forEach((row, i) =>
    replace(row, 'ft_ledgerOwner', `data.globalSecTokens.${i}.ft_ledgerOwner`),
  );
  result.data.ledgers.forEach((ledger, i) =>
    ledger.tokens.forEach((row, j) =>
      replace(row, 'ft_ledgerOwner', `data.ledgers.${i}.tokens.${j}.ft_ledgerOwner`),
    ),
  );
  // Fail closed on metadata/unknown fields rather than replacing arbitrary text.
  const scan = (value, path) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(ADDRESS_TEXT)) {
        const found = address(match[0]);
        assert(!replacements.has(found), `old address remains at ${path}`);
        assert(
          found === ZERO ||
            found === address(backup.info.contractAddress) ||
            preserved.includes(found) ||
            newAddresses.has(found),
          `unclassified address at ${path}`,
        );
      }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        scan(key, `${path} object key`);
        scan(child, `${path}.${key}`);
      }
    }
  };
  scan(result, 'backup');
  const inverse = structuredClone(result);
  for (const change of changes) {
    const parts = change.path.split('.');
    const key = parts.pop();
    let container = inverse;
    for (const part of parts) container = container[part];
    container[key] = change.oldAddress;
  }
  const original = structuredClone(backup);
  delete original.ledgerHash;
  // Address casing is not state; compare all other fields exactly.
  equal(
    JSON.parse(JSON.stringify(inverse).replace(ADDRESS_TEXT, (a) => a.toLowerCase())),
    JSON.parse(JSON.stringify(original).replace(ADDRESS_TEXT, (a) => a.toLowerCase())),
    'non-address state changed',
  );
  return {
    kind: 'offline-remap-review-only-not-a-restore-file',
    sourceSha256: digest,
    mappingSha256: sha256(JSON.stringify(canonical(mapping))),
    candidateSha256: sha256(JSON.stringify(canonical(result))),
    changes,
    candidate: result,
  };
}

/** @returns {[any, any, string]} */
function load(backupPath, evidencePath) {
  const bytes = readFileSync(backupPath);
  return [
    JSON.parse(bytes.toString()),
    JSON.parse(readFileSync(evidencePath, 'utf8')),
    sha256(bytes),
  ];
}

if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  assert(
    ['plan', 'verify', 'remap'].includes(mode),
    'usage: rehearsal.cjs plan|verify|remap (see README.md)',
  );
  assert.equal(args.length, { plan: 3, verify: 5, remap: 4 }[mode], 'wrong number of arguments');
  const before = load(args[0], args[1]);
  let result;
  if (mode === 'plan') result = plan(...before);
  if (mode === 'verify') result = verify(...before, ...load(args[2], args[3]));
  if (mode === 'remap') result = remap(...before, JSON.parse(readFileSync(args[2], 'utf8')));
  const output = args.at(-1);
  assert(output, 'output path required');
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

module.exports = { plan, verify, remap, sha256 };
