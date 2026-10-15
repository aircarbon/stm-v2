# Awesome Project Build with TypeORM

Steps to run this project:

1. Run `npm i` command
2. Run `docker-compose up` command
3. Run `npm start` command

## Deployment and settings database

The deployment and settings query API uses MSSQL by default. Set `db_type=postgres` to use the PostgreSQL adapter.
The adapter translates the T-SQL subset used by these queries; it does not migrate a database or change the TypeORM
migration configuration.

Both backends use `sql_server`, `sql_port`, `sql_user`, `sql_password`, and `sql_database` from the process environment.
For PostgreSQL, set the port explicitly (normally 5432), and use `sql_schema` to change the default `dbo` schema.
The database and tables must already exist with the column names used by the queries, including mixed-case `txHash`.

PostgreSQL connections use TLS with certificate verification by default. For a private certificate authority, provide
its trust chain with Node.js `NODE_EXTRA_CA_CERTS`. Use `sql_ssl=false` only for a trusted local development server.

With Node.js 18 or later, run `npm run test:postgres` from `orm/` to build the package and check deployment/settings
queries on embedded PostgreSQL (PGlite). The test uses synthetic data and no server, credentials, or blockchain.
It checks SQL compatibility, not production schema provisioning or PostgreSQL wire/TLS configuration.
