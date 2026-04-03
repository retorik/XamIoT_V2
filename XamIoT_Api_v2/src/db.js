// src/db.js
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: config.databaseUrl });

export async function q(text, params) {
  return pool.query(text, params);
}
export { pool };
