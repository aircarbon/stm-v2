# Migration with entity data removal

There is already a workflow for migrating a smart contract. This one is the same, but it adjusts the data on the way:
it removes one entity and switches all addresses to a new mnemonic. It is used to separate an entity's data from an
existing contract — here, to remove the B3 data from the ACX contract. Data of all other entities stays.

Regular migration: 1) back up the whitelist of the source contract; 2) deploy a new contract; 3) restore the whitelist
into it; 4) back up the data of the source contract; 5) restore the data into the new contract.

A redeploy is needed anyway: the mnemonic and signers change, and the contract has no way to delete an entity or
unassign an account. So the entity is cleared on the old contract, then simply left out of the new one.

## Flow

1. **Clear the entity on the old contract** (old mnemonic): burn all its tokens, so the contract updates every total
   itself, and withdraw its currency balances. Both need the entity to exist, so this happens before the migration.
2. **Back up and verify** that the entity's accounts hold nothing and that nothing else changed.
3. **Adjust the backup offline:**
   - remove the entity from `entitiesWithFeeOwners`, with its slices of `ccyFees` and `tokenFees`
   - set its accounts to entity 0 in `accountEntities`, and remove them (same index) from `ledgerOwners`, `ledgers`
     and `ledgerOwnersFees` — `restore_v2` would otherwise put entity-0 ledgers into entity 1
   - keep the whitelist (so every address keeps its position), burned tokens, batches and global totals as history
   - swap every address to the new mnemonic (whitelist position i → address i), recalculate `wlHash` and `ledgerHash`
4. **Deploy and restore** with the existing scripts, unchanged.
5. **Compare** the old contract with the new one.

The entity's accounts end up whitelisted with entity 0: they can't mint, burn, transfer or fund until assigned again.

## Commands

Run from `sol/`. Addresses go without `0x`; `<src>` is the source address in lowercase. `<ADJUSTED>` is a made-up
40-hex name for the adjusted backup files (e.g. `b3b3000000000000000000000000000000000001`). `<ENTITY>` is the
entity ID to remove.

```sh
# --- Old contract, old mnemonic ---

# 1. Back up and keep a "before" copy (the next backup overwrites the file)
export INSTANCE_ID=<SRC_INSTANCE> && npx truffle exec contract_upgrade/backup.js -h=offchain -s='<SRC>' --network=<SRC_NETWORK> --compile
cp contract_upgrade/data/0x<src>.json contract_upgrade/data/before-0x<src>.json

# 2a. Analyze (offline, reads the backup): what burning and withdrawing involves, plus warnings.
#     Writes the exact operations to data/clear-plan-0x<src>-entity-<ENTITY>.json
node contract_upgrade/dataAdjustedRemoval/analyzeEntity.js -s='<SRC>' --entity=<ENTITY>

# 2b. Burn the entity's tokens and withdraw its currency, as listed in the plan. Safe to interrupt and re-run: it reads
#     the live state and continues where it stopped. Stops without sending if the chain differs from the plan
#     (then redo steps 1 and 2a). Log: data/clear-log-*.txt
# Run in analysis mode at first: compares the plan with the chain and lists what would be sent, sends nothing
export INSTANCE_ID=<SRC_INSTANCE> && npx truffle exec contract_upgrade/dataAdjustedRemoval/clearEntity.js -s='<SRC>' --entity=<ENTITY> --network=<SRC_NETWORK> --dry-run
# Then run for real: burns and withdraws
export INSTANCE_ID=<SRC_INSTANCE> && npx truffle exec contract_upgrade/dataAdjustedRemoval/clearEntity.js -s='<SRC>' --entity=<ENTITY> --network=<SRC_NETWORK>

# 3. Back up the whitelist and the data again. No other transactions on the old contract from here on.
export INSTANCE_ID=<SRC_INSTANCE> && npx truffle exec contract_upgrade/backupWL.js -h=offchain -s='<SRC>' --network=<SRC_NETWORK> --compile
export INSTANCE_ID=<SRC_INSTANCE> && npx truffle exec contract_upgrade/backup.js -h=offchain -s='<SRC>' --network=<SRC_NETWORK> --compile

# 4. Verify (offline, compares before-0x<src>.json with 0x<src>.json): entity holds zero tokens and currency, only its
#    holdings changed, totals moved by exactly the burned amount. Ends with PASS, NOT CLEARED or FAIL.
node contract_upgrade/dataAdjustedRemoval/verifyClear.js -s='<SRC>' --entity=<ENTITY>

# (optional) Generate a new random mnemonic and print its first 10 addresses: the signers of the new contract, top
#            them up with gas. The mnemonic is a secret: run it in your own terminal and store it safely.
node contract_upgrade/dataAdjustedRemoval/generateMnemonic.js

# --- Offline: put the NEW mnemonic into PROD_MNEMONIC.js (PROD instances) or DEV_MNEMONIC.js (all others) ---

# 5. Remove the entity and swap the addresses: reads WL-0x<src>.json and 0x<src>.json from step 3 (never modified),
#    writes WL-0x<ADJUSTED>.json and 0x<ADJUSTED>.json. Use the INSTANCE_ID of the new contract: it picks the mnemonic.
#    Stops if the entity still holds anything, or if the mnemonic file still has the old mnemonic.
export INSTANCE_ID=<INSTANCE> && node contract_upgrade/dataAdjustedRemoval/adjustBackup.js -s='<SRC>' -o='<ADJUSTED>' --entity=<ENTITY>

# --- New contract, new mnemonic ---

# 6. Deploy
export INSTANCE_ID=<INSTANCE> && export RESTORE_CONTRACT=YES && node process_sol_js && npx truffle compile && npx truffle migrate --network=<NETWORK> -f 2 --to 2

# 7. Restore the whitelist
export INSTANCE_ID=<INSTANCE> && npx truffle exec contract_upgrade/restoreWL.js -s='<ADJUSTED>' -t='<NEW>' -h=offchain --network=<NETWORK>

# 8. Restore the data (also writes a backup of the new contract to data/0x<new>.json)
export INSTANCE_ID=<INSTANCE> && npx truffle exec contract_upgrade/restore_v2.js -s='<ADJUSTED>' -t='<NEW>' -h=offchain --network=<NETWORK>

# 9. Compare the old contract (post-clear) with the new one, addresses mapped back
node contract_upgrade/dataAdjustedRemoval/compareMigration.js -s='<SRC>' -a='<ADJUSTED>' -t='<NEW>' --entity=<ENTITY>
```

## Cross-checks

| Step | Proves |
| --- | --- |
| 4 `verifyClear` | Entity holds nothing; only its tokens were burned and its currency withdrawn; totals moved by exactly that |
| 5 `adjustBackup` | Only the entity was removed and only addresses changed; every address mapped |
| 7–8 `restoreWL`, `restore_v2` | New contract matches the adjusted files (built-in hash checks) |
| 9 `compareMigration` | Other entities identical; entity gone; its accounts whitelisted with entity 0 |

## Scripts

| Script | Status |
| --- | --- |
| `analyzeEntity.js` | done, run on UAT |
| `clearEntity.js` | done, run on UAT (entity 4: 224 tokens burned, 49 balances withdrawn) |
| `verifyClear.js` | done, run on UAT; tested offline on real and synthetic backups |
| `generateMnemonic.js` | done (optional helper) |
| `adjustBackup.js` | done, run on UAT (reuses the swap code from `contract_upgrade/swapAddresses.js`) |
| `compareMigration.js` | done, run on UAT (PASS); tested against tampered backups |
| `fundSigners.js` | temporary helper: tops up the new signers; the signer addresses are the UAT ones, change them first |
| `cancelPending.js` | temporary helper: replaces stuck pending transactions of signer 0 |

## Notes

- On production, B3 is not entity 4: the ACX production backup has entities 1, 2, 3, 1000 and 10588919. Confirm the ID.
- On UAT, tokens moved between entities: tokens the entity created but others hold stay; tokens it holds that others
  created get burned. On production there were no cross-entity transfers.
