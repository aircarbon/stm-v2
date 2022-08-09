# SMART CONTRACT MIGRATION GUIDE (WIP)

## PRE-MIGRATION

1. Notify customers by email about system upgrade and down time.
2. Activate system upgrade message on WEB - 3 days in advance
3. Create "DEV_MNEMONIC.js" file from the example "DEV_MNEMONIC.example.js" file and replace the example with the right mnemonic.
4. Put the right node RPC endpoints in the "const.js" and "truffle-config.js" files. In "truffle-config.js" find the right network(s) you are planning to use and add the right http endpoint as a parameter of a "provider". In "const.js" file in function "getTestContextWeb3()", find the right network(s) you want to use, and add the correct wss and http node RPC endpoints.
5. In "truffle-config.js" file, put the right gas price for the network(s) you are planning to use. The gas price is stored in the variable on the top of the file starting with "GWEI_" plus the name of the network. You can check the current gas prices at block explorers and put a bit more than the current one to ensure faster faster migration.
6. Create environment file from the ".env.example" file and give it a name as ".env." plus the name of the environment you are making migration for. For example, if it is "DEMO_80001_AC", then the environment file should be called ".env.DEMO_80001_AC". In that file modify the right fields. For example, for "network_id" specify id of the blockchain to which you are going to make the migration (this can be checked on chainlist.org). Also, check that the database credentials are correct (check the latest credentials in the pinned messages on tech_dev slack channel).
7. Find address of the current STM smart contract (from the respective database, from "global_config" table, from "global_contractAddress" config field).
8. When putting addresses in the commands as parameters, remember to remove "0x" part in the beginning of the address.
9. If you are running the commands from the remote environment (like AWS servers), you may want to put " &" in the end of every command, so that it runs asynchronously and is not attached to your SSH sessions.

10. Backup Whitelisted Addresses from Source smart contract (replace "[SOURCE_CONTRACT_NETWORK]" with the source network name, as well as "[SOURCE_CONTRACT_ADDRESS]" with the source STM smart contract that you had to find in step 7. Also, replace "[INSTANCE]" with that instance that you specified earlier in your environment file)
   
        export INSTANCE_ID=[INSTANCE] && truffle exec contract_upgrade/backupWL.js -h=offchain -s=[SOURCE_CONTRACT_ADDRESS] --network=[SOURCE_CONTRACT_NETWORK] --compile

        // example: export INSTANCE_ID=DEMO_80001_AC && truffle exec contract_upgrade/backupWL.js -h=offchain -s='F85B1ED833eaFEa835F44fA8Ba56f2d65C550218' --network=matic_testnet --compile

11. Deploy target smart contract and save contract address. When the script is done, save address of the newly deployed STM contract.

        export INSTANCE_ID=[INSTANCE] && export RESTORE_CONTRACT=YES && node process_sol_js && truffle compile && truffle migrate --network=[TARGET_CONTRACT_NETWORK] -f 2 --to 2
        
        // example: export INSTANCE_ID=PROD_137_AC && node process_sol_js && truffle compile && truffle migrate --network matic_mainnet -f 2 --to 2
12. Restore WL (+ additional addresses if any) to Target smart contract (replace "[TARGET_CONTRACT_ADDRESS]" with the address of the newly deployed STM smart contract from the previous step)
   
        export INSTANCE_ID=[INSTANCE] && truffle exec contract_upgrade/restoreWL.js -s=[SOURCE_CONTRACT_ADDRESS] -t=[TARGET_CONTRACT_ADDRESS] -h=offchain --network=[TARGET_CONTRACT_NETWORK]

        // example: export INSTANCE_ID=DEMO_80001_AC && truffle exec contract_upgrade/restoreWL.js -s='F85B1ED833eaFEa835F44fA8Ba56f2d65C550218' -t='08449A09322E41EAe08a1134FC9A432856089829' -h=offchain --network=matic_testnet
13. Make sure only SOURCE and TARGET SC are on SQL DB table **contract**

## MIGRATION

1. Disable Dashboard & set reason message

        UPDATE [dbo].[global_config]
        SET
            [config_value] = 1
        WHERE [config_key] = 'web_settings_disableDashboard'
        GO

        UPDATE [dbo].[global_config]
        SET
            [config_value] = 'ACX is currently carrying out a scheduled system upgrade from 12pm to 5pm (Singapore time). '
        WHERE [config_key] = 'web_settings_disableDashboardMsg'
2. Close Market on HX
   ![Close market on HX](./assets/hx-close-market.png)
3. Set smart contract to read-only from ADMIN
   ![Set smart contract to read-only from ADMIN](./assets/admin-set-sc-read-only.png)
   
4. Create full backup of source smart contract (in this step you may need to change the mnemonics to the one, which was used when deploying the source STM smart contract)

        export INSTANCE_ID=[INSTANCE] && truffle exec contract_upgrade/backup.js -h=offchain -s=[SOURCE_CONTRACT_ADDRESS] --network=[SOURCE_CONTRACT_NETWORK] --compile

        // example: export INSTANCE_ID=PROD_56_AC && truffle exec contract_upgrade/backup.js -h=offchain -s='8a2f899613797f6ae8f65e5831be39d8b9e4bfee' --network=bsc_mainnet_ac --compile

5. Backup Indexer/mongodb
        
        cd indexer/cli
        cp .env.example .env
        yarn dump

6. Export to CSV Unconsolidated Balance report from ADMIN.

7. Restore backup to target smart contract (will take 2-8 hours) (if you have changed the mnemonics in the previous step, you may need to change mnemonics back to the original one):

        export INSTANCE_ID=[INSTANCE] && truffle exec contract_upgrade/restore.js -s=[SOURCE_CONTRACT_ADDRESS] -t=[TARGET_CONTRACT_NETWORK] -h=offchain --network=[TARGET_CONTRACT_NETWORK]

        // example: export INSTANCE_ID=PROD_137_AC && truffle exec contract_upgrade/restore.js -s='8a2f899613797f6ae8f65e5831be39d8b9e4bfee' -t='3D47037A40d01e7BB902b9E49D9249145b542b10' -h=offchain --network=matic_mainnet --compile

8. After Restore check:
     1. If restore script prints the same hashes for source and target smart contracts (will be written in the end of the script).
      2. Connect local ADMIN to target smart contract:
        - Make sure Ledger Hashcode is displayed
        - Generate Unconsolidated Balance report and compare with source report. Must be exact same numbers for all accounts.


9.  Update network/contract address on the respective database (put the newly deployed STM address as a new value).
   
        BEGIN
        UPDATE [dbo].[global_config]
        SET
        [config_value] = '0x3D47037A40d01e7BB902b9E49D9249145b542b10'
        WHERE [config_key] = 'global_contractAddress'

10. Reset Indexer
    
        curl --location --request GET 'https://indx.aircarbon.co/reset-sync' --header 'x-api-key: 53d22de76bdec67c530a50751a0721ae4af4f0961cba098e1d0f0c9d93967647'

11.  Check GasPrice and GasLimit values on DB
12.  Test internal corporate transactions (see Indexer list them)
13.  Mint TEST, and trade.
14.  Disable TEST token type
15. OPEN MARKET - enableDashboard, open on HX
