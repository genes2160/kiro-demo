import path from 'path';
import fs from 'fs';

let db: any = null;

function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  db = new Database(path.join(dataDir, 'queries.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS query_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_type TEXT NOT NULL,
      target TEXT NOT NULL,
      native_status TEXT,
      native_data TEXT,
      native_error TEXT,
      native_duration_ms INTEGER,
      native_items_count INTEGER DEFAULT 0,
      brightdata_status TEXT,
      brightdata_data TEXT,
      brightdata_error TEXT,
      brightdata_duration_ms INTEGER,
      brightdata_items_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      total_queries INTEGER DEFAULT 0,
      native_success INTEGER DEFAULT 0,
      native_blocked INTEGER DEFAULT 0,
      native_partial INTEGER DEFAULT 0,
      brightdata_success INTEGER DEFAULT 0,
      brightdata_blocked INTEGER DEFAULT 0,
      brightdata_partial INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export function saveQueryResult(result: {
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
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO query_results 
    (query_type, target, native_status, native_data, native_error, native_duration_ms, native_items_count,
     brightdata_status, brightdata_data, brightdata_error, brightdata_duration_ms, brightdata_items_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    result.query_type,
    result.target,
    result.native_status,
    JSON.stringify(result.native_data),
    result.native_error,
    result.native_duration_ms,
    result.native_data.length,
    result.brightdata_status,
    JSON.stringify(result.brightdata_data),
    result.brightdata_error,
    result.brightdata_duration_ms,
    result.brightdata_data.length
  );

  // Update stats
  updateStats(database, result.target, result.native_status, result.brightdata_status);
}

function updateStats(database: any, target: string, nativeStatus: string, brightdataStatus: string) {
  const existing = database.prepare('SELECT * FROM stats WHERE target = ?').get(target);

  if (!existing) {
    database.prepare(`
      INSERT INTO stats (target, total_queries, native_success, native_blocked, native_partial,
        brightdata_success, brightdata_blocked, brightdata_partial)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      target,
      nativeStatus === 'success' ? 1 : 0,
      nativeStatus === 'blocked' ? 1 : 0,
      nativeStatus === 'partial' ? 1 : 0,
      brightdataStatus === 'success' ? 1 : 0,
      brightdataStatus === 'blocked' ? 1 : 0,
      brightdataStatus === 'partial' ? 1 : 0
    );
  } else {
    database.prepare(`
      UPDATE stats SET
        total_queries = total_queries + 1,
        native_success = native_success + ?,
        native_blocked = native_blocked + ?,
        native_partial = native_partial + ?,
        brightdata_success = brightdata_success + ?,
        brightdata_blocked = brightdata_blocked + ?,
        brightdata_partial = brightdata_partial + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE target = ?
    `).run(
      nativeStatus === 'success' ? 1 : 0,
      nativeStatus === 'blocked' ? 1 : 0,
      nativeStatus === 'partial' ? 1 : 0,
      brightdataStatus === 'success' ? 1 : 0,
      brightdataStatus === 'blocked' ? 1 : 0,
      brightdataStatus === 'partial' ? 1 : 0,
      target
    );
  }
}

export function getRecentQueries(limit = 10) {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM query_results ORDER BY created_at DESC LIMIT ?
  `).all(limit);

  return rows.map((row: any) => ({
    ...row,
    native_data: safeJsonParse(row.native_data, []),
    brightdata_data: safeJsonParse(row.brightdata_data, []),
  }));
}

export function getStats() {
  const database = getDb();
  return database.prepare('SELECT * FROM stats ORDER BY total_queries DESC').all();
}

export function getAggregate() {
  const database = getDb();
  const totals = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(native_items_count) as native_total_items,
      SUM(brightdata_items_count) as brightdata_total_items,
      SUM(CASE WHEN native_status = 'success' THEN 1 ELSE 0 END) as native_success,
      SUM(CASE WHEN native_status = 'blocked' THEN 1 ELSE 0 END) as native_blocked,
      SUM(CASE WHEN brightdata_status = 'success' THEN 1 ELSE 0 END) as brightdata_success,
      AVG(native_duration_ms) as avg_native_ms,
      AVG(brightdata_duration_ms) as avg_brightdata_ms
    FROM query_results
  `).get();

  return totals;
}

function safeJsonParse(str: string, fallback: any) {
  try { return JSON.parse(str); } catch { return fallback; }
}
