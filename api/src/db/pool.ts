import pg from "pg";

let pool: pg.Pool | null = null;

/** The shared Postgres pool, created on first use from DATABASE_URL. */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}
