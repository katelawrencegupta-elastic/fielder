const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "..", "fielder.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

// Node's built-in node:sqlite (stable as of Node 22.5+/24+) avoids the
// native-module build headaches of better-sqlite3 on bleeding-edge Node
// versions, while still giving us a real file-backed, synchronous, ACID DB.
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

// Lightweight migrations for columns added after the initial schema (CREATE
// TABLE IF NOT EXISTS won't alter an existing table).
(function migrate() {
  const cols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!cols.includes("category")) {
    db.exec("ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'general'");
    // One-shot: tag existing tasks whose titles clearly refer to demos/workshops.
    db.prepare(
      `UPDATE tasks SET category = 'demo_workshop'
       WHERE category = 'general'
         AND (LOWER(title) LIKE '%demo%' OR LOWER(title) LIKE '%workshop%')`
    ).run();
  }
})();

// Thin transaction helper mirroring better-sqlite3's `db.transaction(fn)`.
db.transaction = function transaction(fn) {
  return (...args) => {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

module.exports = { db, DB_PATH };
