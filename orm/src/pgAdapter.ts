/**
 * PostgreSQL adapter presenting the same surface as the `mssql` package, so that
 * deployment.ts / setting.ts keep working unchanged against either database.
 *
 * Selected by `db_type=postgres` (see config.ts). With `db_type` unset or `mssql`,
 * none of this is loaded and behaviour is exactly as before.
 *
 * Mirrors only what this codebase actually uses:
 *   pool.request().input(name, type, value).query(text) -> { recordset, recordsets, rowsAffected }
 */

const { Pool } = require('pg');

/**
 * Translate the T-SQL dialect used in this package to PostgreSQL:
 *   [ident]       -> "ident"          (quoted: some columns are mixed-case, e.g. txHash)
 *   @param        -> $1, $2, ...      (in order of first appearance)
 *   SELECT TOP n  -> ... LIMIT n      (applied to the enclosing query or sub-query)
 *   GETUTCDATE()  -> (now() at time zone 'utc')
 */
export function translate(tsql: string, values: Record<string, any>): { text: string; params: any[] } {
  let text = tsql.replace(/GETUTCDATE\(\)/gi, "(now() at time zone 'utc')");
  text = text.replace(/\[([^\]]+)\]/g, '"$1"');

  // `SELECT TOP n` has no PostgreSQL equivalent in place, so strip it and append a
  // LIMIT to whatever scope the TOP belonged to -- the enclosing parenthesised
  // sub-query if there is one, otherwise the end of the statement.
  for (;;) {
    const top = /\bTOP\s+(\d+)\s+/i.exec(text);
    if (!top) break;
    const limit = top[1];
    text = text.slice(0, top.index) + text.slice(top.index + top[0].length);

    let depth = 0;
    let insertAt = text.length;
    for (let i = top.index; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        if (depth === 0) {
          insertAt = i;
          break;
        }
        depth -= 1;
      }
    }
    text = `${text.slice(0, insertAt)} LIMIT ${limit} ${text.slice(insertAt)}`;
  }

  // Named parameters -> positional placeholders.
  const params: any[] = [];
  const positions: Record<string, number> = {};
  text = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
    if (!(name in positions)) {
      params.push(values[name]);
      positions[name] = params.length;
    }
    return `$${positions[name]}`;
  });

  return { text, params };
}

class PgRequest {
  private values: Record<string, any> = {};

  constructor(private pool: any) {}

  /** `type` is accepted and ignored: PostgreSQL infers it from the column context. */
  input(name: string, typeOrValue: any, value?: any) {
    this.values[name] = arguments.length >= 3 ? value : typeOrValue;
    return this;
  }

  async query(tsql: string) {
    const { text, params } = translate(tsql, this.values);
    const res = await this.pool.query(text, params);
    const rows = res.rows ?? [];
    return {
      recordset: rows,
      recordsets: [rows],
      rowsAffected: [res.rowCount ?? 0],
      output: {},
    };
  }
}

export async function createPgPool(config: any) {
  // SQL Server keeps these tables under the `dbo` schema; the migrated PostgreSQL
  // database preserves that name, so put it on the search_path rather than
  // schema-qualifying every statement.
  const schema = process.env.sql_schema || 'dbo';
  const pool = new Pool({
    host: config.server,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.pool?.max ?? 10,
    idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config.connectionTimeout ?? 30000,
    // Azure Database for PostgreSQL requires TLS; set sql_ssl=false for a local server.
    ssl: process.env.sql_ssl === 'false' ? false : { rejectUnauthorized: false },
    // Set on the connection itself rather than via a 'connect' handler, which would
    // race with a query already in flight on that client.
    options: `-c search_path=${schema},public`,
  });

  return {
    request: () => new PgRequest(pool),
    close: () => pool.end(),
    connect: async (): Promise<void> => undefined,
  };
}

export default { createPgPool, translate };
