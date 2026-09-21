const express = require("express");
const { all } = require("../db/helpers");
const { attachTaskExtras, rowToPoc, rowToCommit } = require("../db/serializers");

const router = express.Router();

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COMMIT_LIMIT = 2000;

// GET /api/timeline — aggregated payload for the Gantt/timeline view: dated
// tasks, POCs (with their date range), and cached GitHub commits as point
// markers. Kept as one call so the timeline view doesn't have to coordinate
// four separate requests + joins client-side.
router.get("/", (req, res) => {
  const now = Date.now();
  let fromMs = Number(req.query.fromMs);
  let toMs = Number(req.query.toMs);
  if (!Number.isFinite(fromMs)) fromMs = now - TWO_YEARS_MS;
  if (!Number.isFinite(toMs)) toMs = now + MONTH_MS;
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = MAX_COMMIT_LIMIT;
  limit = Math.min(Math.floor(limit), MAX_COMMIT_LIMIT);

  const taskRows = all(
    "SELECT * FROM tasks WHERE due_date IS NOT NULL OR start_date IS NOT NULL ORDER BY COALESCE(start_date, due_date) ASC"
  );
  const pocRows = all("SELECT * FROM pocs ORDER BY created_at ASC");
  const commitRows = all(
    "SELECT * FROM poc_commits WHERE committed_at >= ? AND committed_at <= ? ORDER BY committed_at ASC LIMIT ?",
    fromMs,
    toMs,
    limit
  );

  res.json({
    tasks: attachTaskExtras(taskRows),
    pocs: pocRows.map((r) => rowToPoc(r)),
    commits: commitRows.map(rowToCommit),
  });
});

module.exports = router;
