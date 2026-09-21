const express = require("express");
const { all } = require("../db/helpers");

const router = express.Router();

function rowToEvent(r) {
  return {
    id: r.id,
    taskId: r.task_id,
    pocId: r.poc_id,
    eventType: r.event_type,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    title: r.title,
    createdAt: r.created_at,
  };
}

// GET /api/task-events?pocId=&fromMs=&toMs=
router.get("/", (req, res) => {
  const clauses = [];
  const params = [];

  if (req.query.pocId != null && req.query.pocId !== "") {
    clauses.push("poc_id = ?");
    params.push(Number(req.query.pocId));
  }
  if (req.query.fromMs != null && req.query.fromMs !== "") {
    clauses.push("created_at >= ?");
    params.push(Number(req.query.fromMs));
  }
  if (req.query.toMs != null && req.query.toMs !== "") {
    clauses.push("created_at <= ?");
    params.push(Number(req.query.toMs));
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 2000;
  limit = Math.min(Math.floor(limit), 5000);
  const rows = all(
    `SELECT * FROM task_events ${where} ORDER BY created_at ASC, id ASC LIMIT ?`,
    ...params,
    limit
  );
  res.json(rows.map(rowToEvent));
});

module.exports = router;
