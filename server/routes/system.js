const express = require("express");
const helpers = require("../db/helpers");
const { all, get, run, now } = helpers;
const { attachTaskExtras } = require("../db/serializers");
const { writeSnapshot, listSnapshots, restoreSnapshot } = require("../services/snapshot");

const router = express.Router();

router.get("/health", (req, res) => {
  try {
    const row = get("SELECT 1 AS ok");
    res.json({ ok: true, db: Boolean(row?.ok) });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

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
  try {
    const added = helpers.db.transaction(() => {
      let n = 0;
      const maxByStage = {};
      items.forEach((t) => {
        if (!t.title && !t.text) return;
        const stage = t.stage || (t.done ? "done" : "backlog");
        if (maxByStage[stage] == null) {
          maxByStage[stage] = get(
            "SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE stage_key = ?",
            stage
          ).maxPos;
        }
        maxByStage[stage] += 1;
        const info = run(
          `INSERT INTO tasks (title, description, account_key, stage_key, due_date, position, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          t.title || t.text,
          t.description ?? null,
          t.account || "other",
          stage,
          t.dueDate ?? t.due_date ?? null,
          maxByStage[stage],
          t.source || "import",
          ts,
          ts
        );
        (t.labels || []).forEach((l) =>
          run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", info.lastInsertRowid, l)
        );
        n += 1;
      });
      return n;
    })();
    res.status(201).json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Snapshots ────────────────────────────────────────────────────────────────
router.get("/snapshots", (req, res) => {
  res.json(listSnapshots());
});

router.post("/snapshots/now", (req, res) => {
  try {
    const name = writeSnapshot();
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/snapshots/restore/:name", (req, res) => {
  try {
    const restored = restoreSnapshot(req.params.name);
    res.json({ ok: true, restored, reopened: true });
  } catch (err) {
    if (err.code === "INVALID_SNAPSHOT") return res.status(400).json({ error: err.message });
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
