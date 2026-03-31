import pg from 'pg';
const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || 'postgres://st8ck:st8ckpass@localhost:5432/st8ck';
export const pool = new Pool({ connectionString: databaseUrl });
export async function query(text, params){ return await pool.query(text, params); }
export async function withTransaction(fn){
  const client = await pool.connect();
  try{ await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch(e){ await client.query('ROLLBACK'); throw e; }
  finally{ client.release(); }
}
