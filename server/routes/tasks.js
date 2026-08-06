const express = require("express");
const { all, get, run, now } = require("../db/helpers");
const { attachTaskExtras, rowToTask } = require("../db/serializers");

const router = express.Router();

function fetchTaskFull(id) {
  const row = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!row) return null;
  return attachTaskExtras([row])[0];
}

// GET /api/tasks — full list; filtering/sorting happens client-side (small dataset,
// mirrors the existing fieldwork app's approach) except for the optional ?pocId filter
// used by the POC detail view.
router.get("/", (req, res) => {
  let rows = all("SELECT * FROM tasks ORDER BY position ASC, created_at ASC");
  if (req.query.pocId) rows = rows.filter((r) => String(r.poc_id) === String(req.query.pocId));
  res.json(attachTaskExtras(rows));
});

router.post("/", (req, res) => {
  const b = req.body;
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: "title is required" });
  const ts = now();
  const maxPos = get(
    "SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE stage_key = ?",
    b.stage || "backlog"
  ).maxPos;
  const category = b.category === "demo_workshop" ? "demo_workshop" : "general";
  const info = run(
    `INSERT INTO tasks (title, description, account_key, epic_id, poc_id, stage_key, category, start_date, due_date, position, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    b.title.trim(),
    b.description ?? null,
    b.account || "other",
    b.epicId ?? null,
    b.pocId ?? null,
    b.stage || "backlog",
    category,
    b.startDate ?? null,
    b.dueDate ?? null,
    maxPos + 1,
    b.source || "manual",
    ts,
    ts
  );
  const id = info.lastInsertRowid;
  (b.labels || []).forEach((l) => run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", id, l));
  (b.subtasks || []).forEach((text, i) =>
    run("INSERT INTO subtasks (task_id, text, done, position, created_at) VALUES (?, ?, 0, ?, ?)", id, text, i, ts)
  );
  res.status(201).json(fetchTaskFull(id));
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  const nextCategory =
    "category" in b
      ? b.category === "demo_workshop"
        ? "demo_workshop"
        : "general"
      : existing.category || "general";
  run(
    `UPDATE tasks SET title=?, description=?, account_key=?, epic_id=?, poc_id=?, stage_key=?, category=?, start_date=?, due_date=?, position=?, updated_at=? WHERE id=?`,
    b.title ?? existing.title,
    "description" in b ? b.description : existing.description,
    b.account ?? existing.account_key,
    "epicId" in b ? b.epicId : existing.epic_id,
    "pocId" in b ? b.pocId : existing.poc_id,
    b.stage ?? existing.stage_key,
    nextCategory,
    "startDate" in b ? b.startDate : existing.start_date,
    "dueDate" in b ? b.dueDate : existing.due_date,
    "position" in b ? b.position : existing.position,
    now(),
    id
  );
  res.json(fetchTaskFull(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  run("DELETE FROM tasks WHERE id = ?", id);
  res.json({ ok: true });
});

// POST /api/tasks/reorder — bulk-update stage + position after a drag-and-drop move.
// body: { updates: [{ id, stage, position, account?, pocId? }, ...] }
// `account` / `pocId` are optional — present when a card was dragged into a
// different account swimlane or POC sub-lane.
router.post("/reorder", (req, res) => {
  const updates = req.body.updates || [];
  const ts = now();
  updates.forEach((u) => {
    const sets = ["stage_key=?", "position=?", "updated_at=?"];
    const params = [u.stage, u.position, ts];
    if ("account" in u) {
      sets.push("account_key=?");
      params.push(u.account);
    }
    if ("pocId" in u) {
      sets.push("poc_id=?");
      params.push(u.pocId == null ? null : Number(u.pocId));
    }
    params.push(u.id);
    run(`UPDATE tasks SET ${sets.join(", ")} WHERE id=?`, ...params);
  });
  res.json({ ok: true });
});

// ── Subtasks (nested under a task) ─────────────────────────────────────────
router.post("/:id/subtasks", (req, res) => {
  const taskId = Number(req.params.id);
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const maxPos = get("SELECT COALESCE(MAX(position), -1) as maxPos FROM subtasks WHERE task_id = ?", taskId).maxPos;
  run(
    "INSERT INTO subtasks (task_id, text, done, position, created_at) VALUES (?, ?, 0, ?, ?)",
    taskId,
    text,
    maxPos + 1,
    now()
  );
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), taskId);
  res.status(201).json(fetchTaskFull(taskId));
});

router.patch("/:id/subtasks/:subId", (req, res) => {
  const taskId = Number(req.params.id);
  const subId = Number(req.params.subId);
  const existing = get("SELECT * FROM subtasks WHERE id = ? AND task_id = ?", subId, taskId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  run(
    "UPDATE subtasks SET text=?, done=?, position=? WHERE id=?",
    b.text ?? existing.text,
    "done" in b ? (b.done ? 1 : 0) : existing.done,
    "position" in b ? b.position : existing.position,
    subId
  );
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), taskId);
  res.json(fetchTaskFull(taskId));
});

router.delete("/:id/subtasks/:subId", (req, res) => {
  const taskId = Number(req.params.id);
  const subId = Number(req.params.subId);
  run("DELETE FROM subtasks WHERE id = ? AND task_id = ?", subId, taskId);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), taskId);
  res.json(fetchTaskFull(taskId));
});

// ── Labels (nested under a task) ───────────────────────────────────────────
router.post("/:id/labels", (req, res) => {
  const taskId = Number(req.params.id);
  const label = (req.body.label || "").trim();
  if (!label) return res.status(400).json({ error: "label is required" });
  run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", taskId, label);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), taskId);
  res.json(fetchTaskFull(taskId));
});

router.delete("/:id/labels/:label", (req, res) => {
  const taskId = Number(req.params.id);
  run("DELETE FROM task_labels WHERE task_id = ? AND label = ?", taskId, req.params.label);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", now(), taskId);
  res.json(fetchTaskFull(taskId));
});

module.exports = router;
