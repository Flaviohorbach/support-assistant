import { customers, orders } from "@/data/seed";

/**
 * The only thing the app needs from a database: run SQL with parameters and
 * get rows back. Two implementations of the same Postgres:
 *  - production: Neon (serverless Postgres over HTTP) when DATABASE_URL is set;
 *  - local and tests: PGlite, a real Postgres compiled to WebAssembly that runs
 *    inside Node. No install, no Docker, same SQL.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    city TEXT NOT NULL,
    scenario TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    status TEXT NOT NULL,
    placed_days_ago INT NOT NULL,
    delivered_days_ago INT,
    expected_in_days INT,
    tracking TEXT,
    items JSONB NOT NULL
  );
  -- Long-term and episodic memory. Scoped by visitor and customer, so each
  -- visitor of the public demo has their own memory of each demo customer.
  CREATE TABLE IF NOT EXISTS memories (
    id SERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    kind TEXT NOT NULL CHECK (kind IN ('fact', 'episode')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS memories_owner ON memories (visitor_id, customer_id, kind, created_at DESC);
  CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    protocol TEXT NOT NULL UNIQUE,
    visitor_id TEXT NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    order_id TEXT NOT NULL REFERENCES orders(id),
    sku INT NOT NULL,
    reason TEXT NOT NULL,
    resolution TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function migrate(db: Db) {
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(statement);
  }
  for (const c of customers) {
    await db.query(
      "INSERT INTO customers (id, name, email, city, scenario) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
      [c.id, c.name, c.email, c.city, c.scenario],
    );
  }
  for (const o of orders) {
    await db.query(
      `INSERT INTO orders (id, customer_id, status, placed_days_ago, delivered_days_ago, expected_in_days, tracking, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [o.id, o.customerId, o.status, o.placedDaysAgo, o.deliveredDaysAgo, o.expectedInDays, o.tracking, JSON.stringify(o.items)],
    );
  }
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return { query: async (text, params = []) => (await sql.query(text, params)) as never };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  // Persisted under .data/ in development; in memory for tests. PGlite does not create parent folders.
  const dataDir = process.env.NODE_ENV === "test" ? undefined : "./.data/pglite";
  if (dataDir) (await import("node:fs")).mkdirSync("./.data", { recursive: true });
  const pg = new PGlite(dataDir);
  return { query: async (text, params) => (await pg.query(text, params)).rows as never };
}

// Kept on globalThis so hot reload in development does not open a second database.
const globalForDb = globalThis as unknown as { dbReady?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.dbReady ??= connect()
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((error) => {
      // Do not cache a failure: the next request tries again (e.g. Neon waking up from idle).
      globalForDb.dbReady = undefined;
      throw error;
    });
  return globalForDb.dbReady;
}

/** For tests: a fresh in-memory database with the schema and seed. */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db: Db = { query: async (text, params) => (await pg.query(text, params)).rows as never };
  await migrate(db);
  return db;
}
