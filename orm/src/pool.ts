import sqlConfig, { dbType } from './config';
import { createPgPool } from './pgAdapter';

const sql = require('mssql');

const pools: Record<string, any> = {};

// manage a set of pools by name (config will be required to create the pool)
// a pool will be removed when it is closed
export async function getPool(name: string): Promise<any> {
  if (!Object.prototype.hasOwnProperty.call(pools, name)) {
    const config = sqlConfig(name);

    if (dbType() === 'postgres') {
      const pgPool = await createPgPool(config);
      const closePg = pgPool.close.bind(pgPool);
      pgPool.close = () => {
        delete pools[name];
        return closePg();
      };
      pools[name] = pgPool;
      return pools[name];
    }

    const pool = new sql.ConnectionPool(config as any);
    const close = pool.close.bind(pool);
    pool.close = () => {
      delete pools[name];
      return close();
    };
    await pool.connect();
    pools[name] = pool;
  }
  return pools[name];
}

// close all pools
export function closeAll(): Promise<any> {
  return Promise.all(Object.values(pools).map((pool) => pool.close()));
}

export default { closeAll, getPool };
