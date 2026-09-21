const express = require("express");
const { all, get, run, now } = require("../db/helpers");
const { rowToEpic } = require("../db/serializers");

const router = express.Router();

function taskStatsForEpics(epicIds) {
  if (epicIds.length === 0) return {};
  const placeholders = epicIds.map(() => "?").join(",");
  const rows = all(
    `SELECT epic_id, stage_key, COUNT(*) as cnt FROM tasks WHERE epic_id IN (${placeholders}) GROUP BY epic_id, stage_key`,
    ...epicIds
  );
  const stats = {};
  rows.forEach((r) => {
    const s = (stats[r.epic_id] ??= { total: 0, done: 0 });
    s.total += r.cnt;
    if (r.stage_key === "done" || r.stage_key === "archive") s.done += r.cnt;
  });
  return stats;
}

router.get("/", (req, res) => {
  const rows = req.query.account
    ? all("SELECT * FROM epics WHERE account_key = ? ORDER BY created_at DESC", req.query.account)
    : all("SELECT * FROM epics ORDER BY created_at DESC");
  const stats = taskStatsForEpics(rows.map((r) => r.id));
  res.json(rows.map((r) => rowToEpic(r, stats[r.id] || { total: 0, done: 0 })));
});

router.post("/", (req, res) => {
  const { title, description = null, account = "other", status = "active" } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });
  const ts = now();
  const info = run(
    `INSERT INTO epics (title, description, account_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    title.trim(),
    description,
    account,
    status,
    ts,
    ts
  );
  const row = get("SELECT * FROM epics WHERE id = ?", info.lastInsertRowid);
  res.status(201).json(rowToEpic(row));
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = get("SELECT * FROM epics WHERE id = ?", id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  run(
    `UPDATE epics SET title=?, description=?, account_key=?, status=?, updated_at=? WHERE id=?`,
    b.title ?? existing.title,
    "description" in b ? b.description : existing.description,
    b.account ?? existing.account_key,
    b.status ?? existing.status,
    now(),
    id
  );
  const row = get("SELECT * FROM epics WHERE id = ?", id);
  const stats = taskStatsForEpics([id]);
  res.json(rowToEpic(row, stats[id] || { total: 0, done: 0 }));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  run("UPDATE tasks SET epic_id = NULL WHERE epic_id = ?", id);
  run("DELETE FROM epics WHERE id = ?", id);
  res.json({ ok: true });
});

module.exports = router;
