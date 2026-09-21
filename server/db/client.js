const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.FIELDER_DB_PATH || path.join(__dirname, "..", "fielder.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db = null;

function attachTransaction(database) {
  // Thin transaction helper mirroring better-sqlite3's `db.transaction(fn)`.
  database.transaction = function transaction(fn) {
    return (...args) => {
      database.exec("BEGIN");
      try {
        const result = fn(...args);
        database.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          database.exec("ROLLBACK");
        } catch {
          /* ignore rollback failures */
        }
        throw err;
      }
    };
  };
  return database;
}

function migrate(database) {
  const cols = database.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!cols.includes("category")) {
    database.exec("ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'general'");
    database
      .prepare(
        `UPDATE tasks SET category = 'demo_workshop'
         WHERE category = 'general'
           AND (LOWER(title) LIKE '%demo%' OR LOWER(title) LIKE '%workshop%')`
      )
      .run();
  }
  if (!cols.includes("workstream")) {
    database.exec("ALTER TABLE tasks ADD COLUMN workstream TEXT NOT NULL DEFAULT 'misc'");
  }

  const pocCols = database.prepare("PRAGMA table_info(pocs)").all().map((c) => c.name);
  if (!pocCols.includes("notes_url")) {
    database.exec("ALTER TABLE pocs ADD COLUMN notes_url TEXT");
  }
}

function openDatabase() {
  const database = new DatabaseSync(DB_PATH);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  migrate(database);
  return attachTransaction(database);
}

function closeDatabase() {
  if (!db) return;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (err) {
    console.error("WAL checkpoint before close failed:", err.message);
  }
  try {
    db.close();
  } finally {
    db = null;
  }
}

function reopenDatabase() {
  closeDatabase();
  db = openDatabase();
  return db;
}

function unlinkIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Replace the live DB file with `snapshotPath` while this process holds the
 * connection. Closes first, copies via a sibling temp file, then reopens so
 * subsequent queries see the restored data without a process restart.
 */
function restoreFromFile(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    const err = new Error("Snapshot not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  closeDatabase();
  const tmp = `${DB_PATH}.restore-tmp`;
  try {
    unlinkIfExists(tmp);
    fs.copyFileSync(snapshotPath, tmp);
    unlinkIfExists(`${DB_PATH}-wal`);
    unlinkIfExists(`${DB_PATH}-shm`);
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    unlinkIfExists(tmp);
    reopenDatabase();
    throw err;
  }
  reopenDatabase();
}

db = openDatabase();

module.exports = {
  get db() {
    return db;
  },
  DB_PATH,
  closeDatabase,
  reopenDatabase,
  restoreFromFile,
};
