const express = require("express");
const { all } = require("../db/helpers");
const { attachTaskExtras, rowToPoc, rowToCommit } = require("../db/serializers");

const router = express.Router();

// GET /api/timeline — aggregated payload for the Gantt/timeline view: dated
// tasks, POCs (with their date range), and cached GitHub commits as point
// markers. Kept as one call so the timeline view doesn't have to coordinate
// four separate requests + joins client-side.
router.get("/", (req, res) => {
  const taskRows = all(
    "SELECT * FROM tasks WHERE due_date IS NOT NULL OR start_date IS NOT NULL ORDER BY COALESCE(start_date, due_date) ASC"
  );
  const pocRows = all("SELECT * FROM pocs ORDER BY created_at ASC");
  const commitRows = all("SELECT * FROM poc_commits ORDER BY committed_at ASC");

  res.json({
    tasks: attachTaskExtras(taskRows),
    pocs: pocRows.map((r) => rowToPoc(r)),
    commits: commitRows.map(rowToCommit),
  });
});

module.exports = router;
