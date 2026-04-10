import { Pool } from 'pg';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  console.log('[db] DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('[db] DATABASE_URL preview:', process.env.DATABASE_URL?.slice(0, 30));
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }

  pool = new Pool({
    connectionString,
    // Common for hosted Postgres providers on Vercel/Neon/Supabase/etc.
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  const db = getPool();

  console.log('[db] db:', db);
  schemaReady = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS query_results (
        id BIGSERIAL PRIMARY KEY,
        query_type TEXT NOT NULL,
        target TEXT NOT NULL,
        native_status TEXT,
        native_data JSONB,
        native_error TEXT,
        native_duration_ms INTEGER,
        native_items_count INTEGER DEFAULT 0,
        brightdata_status TEXT,
        brightdata_data JSONB,
        brightdata_error TEXT,
        brightdata_duration_ms INTEGER,
        brightdata_items_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS stats (
        id BIGSERIAL PRIMARY KEY,
        target TEXT NOT NULL UNIQUE,
        total_queries INTEGER DEFAULT 0,
        native_success INTEGER DEFAULT 0,
        native_blocked INTEGER DEFAULT 0,
        native_partial INTEGER DEFAULT 0,
        brightdata_success INTEGER DEFAULT 0,
        brightdata_blocked INTEGER DEFAULT 0,
        brightdata_partial INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  })();


  console.log('[db] schema ensured');  return schemaReady;
}

export async function saveQueryResult(result: {
  query_type: string;
  target: string;
  native_status: string;
  native_data: any[];
  native_error: string | null;
  native_duration_ms: number;
  brightdata_status: string;
  brightdata_data: any[];
  brightdata_error: string | null;
  brightdata_duration_ms: number;
}) {
  await ensureSchema();
  const db = getPool();

  await db.query(
    `
      INSERT INTO query_results (
        query_type,
        target,
        native_status,
        native_data,
        native_error,
        native_duration_ms,
        native_items_count,
        brightdata_status,
        brightdata_data,
        brightdata_error,
        brightdata_duration_ms,
        brightdata_items_count
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5, $6, $7,
        $8, $9::jsonb, $10, $11, $12
      )
    `,
    [
      result.query_type,
      result.target,
      result.native_status,
      JSON.stringify(result.native_data ?? []),
      result.native_error,
      result.native_duration_ms,
      result.native_data?.length ?? 0,
      result.brightdata_status,
      JSON.stringify(result.brightdata_data ?? []),
      result.brightdata_error,
      result.brightdata_duration_ms,
      result.brightdata_data?.length ?? 0,
    ]
  );


  console.log('[db] inserted target:', result.target);
  console.log('[db] inserted native items:', result.native_data.length);
  console.log('[db] inserted brightdata items:', result.brightdata_data.length);
  
  await updateStats(result.target, result.native_status, result.brightdata_status);
}

async function updateStats(target: string, nativeStatus: string, brightdataStatus: string) {
  await ensureSchema();
  const db = getPool();

  await db.query(
    `
      INSERT INTO stats (
        target,
        total_queries,
        native_success,
        native_blocked,
        native_partial,
        brightdata_success,
        brightdata_blocked,
        brightdata_partial,
        updated_at
      )
      VALUES (
        $1,
        1,
        $2, $3, $4,
        $5, $6, $7,
        NOW()
      )
      ON CONFLICT (target)
      DO UPDATE SET
        total_queries = stats.total_queries + 1,
        native_success = stats.native_success + EXCLUDED.native_success,
        native_blocked = stats.native_blocked + EXCLUDED.native_blocked,
        native_partial = stats.native_partial + EXCLUDED.native_partial,
        brightdata_success = stats.brightdata_success + EXCLUDED.brightdata_success,
        brightdata_blocked = stats.brightdata_blocked + EXCLUDED.brightdata_blocked,
        brightdata_partial = stats.brightdata_partial + EXCLUDED.brightdata_partial,
        updated_at = NOW()
    `,
    [
      target,
      nativeStatus === 'success' ? 1 : 0,
      nativeStatus === 'blocked' ? 1 : 0,
      nativeStatus === 'partial' ? 1 : 0,
      brightdataStatus === 'success' ? 1 : 0,
      brightdataStatus === 'blocked' ? 1 : 0,
      brightdataStatus === 'partial' ? 1 : 0,
    ]
  );
}

export async function getRecentQueries(limit = 10) {
  await ensureSchema();
  const db = getPool();

  const { rows } = await db.query(
    `
      SELECT *
      FROM query_results
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return rows.map((row: any) => ({
    ...row,
    native_data: row.native_data ?? [],
    brightdata_data: row.brightdata_data ?? [],
  }));
}

export async function getStats() {
  await ensureSchema();
  const db = getPool();

  const { rows } = await db.query(`
    SELECT *
    FROM stats
    ORDER BY total_queries DESC
  `);

  return rows;
}

export async function getAggregate() {
  await ensureSchema();
  const db = getPool();

  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int as total,
      COALESCE(SUM(native_items_count), 0)::int as native_total_items,
      COALESCE(SUM(brightdata_items_count), 0)::int as brightdata_total_items,
      COALESCE(SUM(CASE WHEN native_status = 'success' THEN 1 ELSE 0 END), 0)::int as native_success,
      COALESCE(SUM(CASE WHEN native_status = 'blocked' THEN 1 ELSE 0 END), 0)::int as native_blocked,
      COALESCE(SUM(CASE WHEN brightdata_status = 'success' THEN 1 ELSE 0 END), 0)::int as brightdata_success,
      COALESCE(AVG(native_duration_ms), 0)::float as avg_native_ms,
      COALESCE(AVG(brightdata_duration_ms), 0)::float as avg_brightdata_ms
    FROM query_results
  `);

  return rows[0];
}