# Contract data migration tools

These scripts back up and restore contract state. They intentionally contain no client endpoints, credentials, production addresses, deployment snapshots, or operational runbooks.

Supply all configuration at runtime through an ignored `.env.<instance>` file or environment variables. At minimum, remote work requires `RPC_URL`, `NETWORK_ID`, `MNEMONIC`, and the SQL configuration keys shown in `../.env.example`.

Example shape:

```sh
INSTANCE_ID=<instance> truffle exec contract_upgrade/backup.js \
  -h=offchain -s=<source-contract-address> --network=remote --compile

INSTANCE_ID=<instance> RESTORE_CONTRACT=YES truffle migrate \
  --network=remote -f 2 --to 2

INSTANCE_ID=<instance> truffle exec contract_upgrade/restore.js \
  -s=<backup-set> -t=<target-contract-address> -h=offchain \
  --network=remote --compile
```

Before any production use, validate the procedure in an isolated environment and obtain approval for the exact source, target, backup, rollback, and reconciliation steps.
