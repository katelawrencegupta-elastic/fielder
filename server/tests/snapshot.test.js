const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fielder-snap-"));
process.env.FIELDER_DB_PATH = path.join(tmpRoot, "fielder.db");
process.env.FIELDER_SNAPSHOT_DIR = path.join(tmpRoot, "snapshots");

const client = require("../db/client");
const helpers = require("../db/helpers");
const { writeSnapshot, restoreSnapshot, listSnapshots } = require("../services/snapshot");

helpers.run(
  `INSERT OR IGNORE INTO accounts (key, label, long_name, active, sort_order) VALUES (?, ?, ?, 1, 0)`,
  "other",
  "Other",
  "Other"
);
helpers.run(`INSERT OR IGNORE INTO stages (key, label, sort_order) VALUES (?, ?, ?)`, "backlog", "Backlog", 0);

describe("snapshot restore", () => {
  before(() => {
    helpers.run(
      `INSERT INTO tasks (title, description, account_key, stage_key, position, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "before-snapshot",
      null,
      "other",
      "backlog",
      0,
      "test",
      Date.now(),
      Date.now()
    );
  });

  it("rejects traversal names", () => {
    assert.throws(() => restoreSnapshot("../fielder-x.db"), (err) => err.code === "INVALID_SNAPSHOT");
    assert.throws(() => restoreSnapshot("fielder-missing.db"), (err) => err.code === "NOT_FOUND");
  });

  it("reopens the live connection onto restored data", () => {
    const name = writeSnapshot();
    assert.match(name, /^fielder-.*\.db$/);
    assert.equal(listSnapshots()[0].name, name);

    helpers.run("UPDATE tasks SET title = ? WHERE title = ?", "after-snapshot", "before-snapshot");
    assert.equal(helpers.get("SELECT title FROM tasks WHERE title = ?", "after-snapshot").title, "after-snapshot");

    const restored = restoreSnapshot(name);
    assert.equal(restored, name);
    assert.equal(helpers.get("SELECT title FROM tasks WHERE title = ?", "before-snapshot").title, "before-snapshot");
    assert.equal(helpers.get("SELECT title FROM tasks WHERE title = ?", "after-snapshot"), undefined);
  });
});

describe("health and import", () => {
  it("reports sqlite health", async () => {
    const express = require("express");
    const http = require("http");
    const systemRouter = require("../routes/system");
    const app = express();
    app.use(express.json());
    app.use("/api", systemRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(Boolean(data.db), true);

      const imported = await fetch(`http://127.0.0.1:${port}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { title: "imported-one", account: "other", stage: "backlog" },
          { title: "imported-two", account: "other", stage: "backlog" },
        ]),
      });
      assert.equal(imported.status, 201);
      const body = await imported.json();
      assert.equal(body.added, 2);
      assert.equal(helpers.get("SELECT COUNT(*) AS n FROM tasks WHERE source = ?", "import").n, 2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

after(() => {
  try {
    client.closeDatabase();
  } catch {
    /* ignore */
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
