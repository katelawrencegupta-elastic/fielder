const express = require("express");
const fs = require("fs");
const path = require("path");
const { all, get, run, now } = require("../db/helpers");
const { attachTaskExtras } = require("../db/serializers");
const { writeSnapshot, listSnapshots, SNAPSHOT_DIR } = require("../services/snapshot");
const { DB_PATH } = require("../db/client");

const router = express.Router();

// ── Export / Import full task list (portable JSON, mirrors fieldwork's format) ──
router.get("/export", (req, res) => {
  const rows = all("SELECT * FROM tasks ORDER BY created_at ASC");
  const tasks = attachTaskExtras(rows);
  res.setHeader("Content-Disposition", `attachment; filename="fielder-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(tasks);
});

router.post("/import", (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const ts = now();
  let added = 0;
  items.forEach((t) => {
    if (!t.title && !t.text) return;
    const maxPos = get(
      "SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE stage_key = ?",
      t.stage || "backlog"
    ).maxPos;
    const info = run(
      `INSERT INTO tasks (title, description, account_key, stage_key, due_date, position, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.title || t.text,
      t.description ?? null,
      t.account || "other",
      t.stage || (t.done ? "done" : "backlog"),
      t.dueDate ?? t.due_date ?? null,
      maxPos + 1,
      t.source || "import",
      ts,
      ts
    );
    (t.labels || []).forEach((l) => run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", info.lastInsertRowid, l));
    added++;
  });
  res.status(201).json({ ok: true, added });
});

// ── Snapshots ────────────────────────────────────────────────────────────────
router.get("/snapshots", (req, res) => {
  res.json(listSnapshots());
});

router.post("/snapshots/now", (req, res) => {
  writeSnapshot();
  res.json({ ok: true });
});

router.post("/snapshots/restore/:name", (req, res) => {
  const name = req.params.name;
  if (!name.startsWith("fielder-") || !name.endsWith(".db") || name.includes("/")) {
    return res.status(400).json({ error: "Invalid snapshot name" });
  }
  const file = path.join(SNAPSHOT_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Snapshot not found" });
  try {
    fs.copyFileSync(file, DB_PATH);
    res.json({ ok: true, restored: name, note: "Restart the server to load the restored database." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
