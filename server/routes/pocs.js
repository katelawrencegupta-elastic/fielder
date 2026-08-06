const express = require("express");
const { all, get, run, now } = require("../db/helpers");
const { rowToPoc, rowToCommit } = require("../db/serializers");
const github = require("../services/github");

const router = express.Router();

function commitStatsFor(pocIds) {
  if (pocIds.length === 0) return {};
  const placeholders = pocIds.map(() => "?").join(",");
  const rows = all(
    `SELECT poc_id, COUNT(*) as cnt, MAX(committed_at) as lastAt FROM poc_commits WHERE poc_id IN (${placeholders}) GROUP BY poc_id`,
    ...pocIds
  );
  const stats = {};
  rows.forEach((r) => (stats[r.poc_id] = { count: r.cnt, lastAt: r.lastAt }));
  return stats;
}

router.get("/", (req, res) => {
  const rows = all("SELECT * FROM pocs ORDER BY created_at DESC");
  const stats = commitStatsFor(rows.map((r) => r.id));
  res.json(
    rows.map((r) => rowToPoc(r, stats[r.id]?.count || 0, stats[r.id]?.lastAt || null))
  );
});

router.get("/:id/commits", (req, res) => {
  const id = Number(req.params.id);
  const rows = all("SELECT * FROM poc_commits WHERE poc_id = ? ORDER BY committed_at DESC", id);
  res.json(rows.map(rowToCommit));
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = get("SELECT * FROM pocs WHERE id = ?", id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  run(
    `UPDATE pocs SET account_key=?, title=?, status=?, start_date=?, target_demo_date=?, owner=?, updated_at=? WHERE id=?`,
    b.account ?? existing.account_key,
    b.title ?? existing.title,
    b.status ?? existing.status,
    "startDate" in b ? b.startDate : existing.start_date,
    "targetDemoDate" in b ? b.targetDemoDate : existing.target_demo_date,
    b.owner ?? existing.owner,
    now(),
    id
  );
  const row = get("SELECT * FROM pocs WHERE id = ?", id);
  const stats = commitStatsFor([id]);
  res.json(rowToPoc(row, stats[id]?.count || 0, stats[id]?.lastAt || null));
});

// POST /api/pocs/sync — pull POC folder list + poc.json manifests + commit history
// from GitHub. Safe to call repeatedly (upserts).
router.post("/sync", async (req, res) => {
  try {
    const results = await github.syncAll();
    res.json({ ok: true, synced: results.length, results });
  } catch (err) {
    console.error("POC sync failed:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

module.exports = router;
