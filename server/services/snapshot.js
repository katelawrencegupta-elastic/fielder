const fs = require("fs");
const path = require("path");
const client = require("../db/client");

const SNAPSHOT_DIR = process.env.FIELDER_SNAPSHOT_DIR || path.join(__dirname, "..", "snapshots");
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SNAPSHOT_KEEP = 144; // 24h worth at 10-min intervals

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function writeSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(SNAPSHOT_DIR, `fielder-${ts}.db`);
    const tmp = `${dest}.tmp`;
    try {
      fs.unlinkSync(tmp);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    // VACUUM INTO writes a consistent standalone copy without truncating the live WAL.
    client.db.exec(`VACUUM INTO ${sqlString(tmp)}`);
    fs.renameSync(tmp, dest);

    const files = fs
      .readdirSync(SNAPSHOT_DIR)
      .filter((f) => f.startsWith("fielder-") && f.endsWith(".db"))
      .sort();
    const toDelete = files.slice(0, Math.max(0, files.length - SNAPSHOT_KEEP));
    toDelete.forEach((f) => fs.unlinkSync(path.join(SNAPSHOT_DIR, f)));

    console.log(`Snapshot saved: ${path.basename(dest)} (${files.length - toDelete.length} kept)`);
    return path.basename(dest);
  } catch (err) {
    console.error("Snapshot failed:", err.message);
    throw err;
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

function restoreSnapshot(name) {
  if (
    !name ||
    !name.startsWith("fielder-") ||
    !name.endsWith(".db") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..")
  ) {
    const err = new Error("Invalid snapshot name");
    err.code = "INVALID_SNAPSHOT";
    throw err;
  }
  const file = path.join(SNAPSHOT_DIR, name);
  if (!fs.existsSync(file)) {
    const err = new Error("Snapshot not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  client.restoreFromFile(file);
  return name;
}

let snapshotTimer = null;

function startSnapshotInterval() {
  try {
    writeSnapshot();
  } catch {
    /* logged inside writeSnapshot */
  }
  if (snapshotTimer) clearInterval(snapshotTimer);
  snapshotTimer = setInterval(() => {
    try {
      writeSnapshot();
    } catch {
      /* logged inside writeSnapshot */
    }
  }, SNAPSHOT_INTERVAL_MS);
}

function stopSnapshotInterval() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}

module.exports = {
  startSnapshotInterval,
  stopSnapshotInterval,
  writeSnapshot,
  restoreSnapshot,
  listSnapshots,
  SNAPSHOT_DIR,
};
