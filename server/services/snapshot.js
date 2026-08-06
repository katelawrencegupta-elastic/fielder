const fs = require("fs");
const path = require("path");
const { db, DB_PATH } = require("../db/client");

const SNAPSHOT_DIR = path.join(__dirname, "..", "snapshots");
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SNAPSHOT_KEEP = 144; // 24h worth at 10-min intervals

function writeSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    // Flush WAL into the main DB file so the copy below is a complete, consistent snapshot.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(SNAPSHOT_DIR, `fielder-${ts}.db`);
    fs.copyFileSync(DB_PATH, dest);

    const files = fs
      .readdirSync(SNAPSHOT_DIR)
      .filter((f) => f.startsWith("fielder-") && f.endsWith(".db"))
      .sort();
    const toDelete = files.slice(0, Math.max(0, files.length - SNAPSHOT_KEEP));
    toDelete.forEach((f) => fs.unlinkSync(path.join(SNAPSHOT_DIR, f)));

    console.log(`Snapshot saved: ${path.basename(dest)} (${files.length - toDelete.length} kept)`);
  } catch (err) {
    console.error("Snapshot failed:", err.message);
  }
}

function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs
    .readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith("fielder-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map((f) => ({
      name: f,
      ts: f.replace("fielder-", "").replace(".db", ""),
      size: fs.statSync(path.join(SNAPSHOT_DIR, f)).size,
    }));
}

function startSnapshotInterval() {
  writeSnapshot();
  setInterval(writeSnapshot, SNAPSHOT_INTERVAL_MS);
}

module.exports = { startSnapshotInterval, writeSnapshot, listSnapshots, SNAPSHOT_DIR };
