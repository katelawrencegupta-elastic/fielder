const express = require("express");
const { all, get, run, now } = require("../db/helpers");
const { attachTaskExtras } = require("../db/serializers");
const { recordEvent, diffAndRecord, fromRow } = require("../services/taskEvents");

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
  const stage = b.stage || "backlog";
  const title = b.title.trim();
  const pocId = b.pocId ?? null;
  const info = run(
    `INSERT INTO tasks (title, description, account_key, epic_id, poc_id, stage_key, category, start_date, due_date, position, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    title,
    b.description ?? null,
    b.account || "other",
    b.epicId ?? null,
    pocId,
    stage,
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
  recordEvent({
    taskId: id,
    pocId: pocId == null ? null : Number(pocId),
    eventType: "created",
    field: "stage",
    newValue: stage,
    title,
    at: ts,
  });
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
  const before = fromRow(existing);
  const after = {
    id,
    title: b.title ?? existing.title,
    description: "description" in b ? b.description : existing.description,
    account: b.account ?? existing.account_key,
    pocId: "pocId" in b ? b.pocId : existing.poc_id,
    stage: b.stage ?? existing.stage_key,
    category: nextCategory,
    startDate: "startDate" in b ? b.startDate : existing.start_date,
    dueDate: "dueDate" in b ? b.dueDate : existing.due_date,
  };
  const ts = now();
  run(
    `UPDATE tasks SET title=?, description=?, account_key=?, epic_id=?, poc_id=?, stage_key=?, category=?, start_date=?, due_date=?, position=?, updated_at=? WHERE id=?`,
    after.title,
    after.description,
    after.account,
    "epicId" in b ? b.epicId : existing.epic_id,
    after.pocId == null ? null : Number(after.pocId),
    after.stage,
    after.category,
    after.startDate,
    after.dueDate,
    "position" in b ? b.position : existing.position,
    ts,
    id
  );
  diffAndRecord(before, after, ts);
  res.json(fetchTaskFull(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  recordEvent({
    taskId: id,
    pocId: existing.poc_id,
    eventType: "deleted",
    title: existing.title,
  });
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
    const existing = get("SELECT * FROM tasks WHERE id = ?", u.id);
    if (!existing) return;

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

    const after = {
      id: existing.id,
      title: existing.title,
      description: existing.description,
      account: "account" in u ? u.account : existing.account_key,
      pocId: "pocId" in u ? (u.pocId == null ? null : Number(u.pocId)) : existing.poc_id,
      stage: u.stage,
      category: existing.category || "general",
      startDate: existing.start_date,
      dueDate: existing.due_date,
    };
    // Only stage / account / poc — ignore pure position shuffles.
    diffAndRecord(fromRow(existing), after, ts);
  });
  res.json({ ok: true });
});

// ── Subtasks (nested under a task) ─────────────────────────────────────────
router.post("/:id/subtasks", (req, res) => {
  const taskId = Number(req.params.id);
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return res.status(404).json({ error: "Not found" });
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const maxPos = get("SELECT COALESCE(MAX(position), -1) as maxPos FROM subtasks WHERE task_id = ?", taskId).maxPos;
  const ts = now();
  run(
    "INSERT INTO subtasks (task_id, text, done, position, created_at) VALUES (?, ?, 0, ?, ?)",
    taskId,
    text,
    maxPos + 1,
    ts
  );
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", ts, taskId);
  recordEvent({
    taskId,
    pocId: task.poc_id,
    eventType: "subtask_added",
    field: "subtask",
    newValue: text,
    title: task.title,
    at: ts,
  });
  res.status(201).json(fetchTaskFull(taskId));
});

router.patch("/:id/subtasks/:subId", (req, res) => {
  const taskId = Number(req.params.id);
  const subId = Number(req.params.subId);
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return res.status(404).json({ error: "Not found" });
  const existing = get("SELECT * FROM subtasks WHERE id = ? AND task_id = ?", subId, taskId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  const nextText = b.text ?? existing.text;
  const nextDone = "done" in b ? (b.done ? 1 : 0) : existing.done;
  const ts = now();
  run(
    "UPDATE subtasks SET text=?, done=?, position=? WHERE id=?",
    nextText,
    nextDone,
    "position" in b ? b.position : existing.position,
    subId
  );
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", ts, taskId);
  const changed =
    String(nextText) !== String(existing.text) || Number(nextDone) !== Number(existing.done);
  if (changed) {
    recordEvent({
      taskId,
      pocId: task.poc_id,
      eventType: "subtask_updated",
      field: "subtask",
      oldValue: existing.text,
      newValue: nextDone ? `${nextText} (done)` : nextText,
      title: task.title,
      at: ts,
    });
  }
  res.json(fetchTaskFull(taskId));
});

router.delete("/:id/subtasks/:subId", (req, res) => {
  const taskId = Number(req.params.id);
  const subId = Number(req.params.subId);
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return res.status(404).json({ error: "Not found" });
  const existing = get("SELECT * FROM subtasks WHERE id = ? AND task_id = ?", subId, taskId);
  const ts = now();
  run("DELETE FROM subtasks WHERE id = ? AND task_id = ?", subId, taskId);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", ts, taskId);
  if (existing) {
    recordEvent({
      taskId,
      pocId: task.poc_id,
      eventType: "subtask_removed",
      field: "subtask",
      oldValue: existing.text,
      title: task.title,
      at: ts,
    });
  }
  res.json(fetchTaskFull(taskId));
});

// ── Labels (nested under a task) ───────────────────────────────────────────
router.post("/:id/labels", (req, res) => {
  const taskId = Number(req.params.id);
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return res.status(404).json({ error: "Not found" });
  const label = (req.body.label || "").trim();
  if (!label) return res.status(400).json({ error: "label is required" });
  const ts = now();
  run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", taskId, label);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", ts, taskId);
  recordEvent({
    taskId,
    pocId: task.poc_id,
    eventType: "label_added",
    field: "label",
    newValue: label,
    title: task.title,
    at: ts,
  });
  res.json(fetchTaskFull(taskId));
});

router.delete("/:id/labels/:label", (req, res) => {
  const taskId = Number(req.params.id);
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return res.status(404).json({ error: "Not found" });
  const label = req.params.label;
  const ts = now();
  run("DELETE FROM task_labels WHERE task_id = ? AND label = ?", taskId, label);
  run("UPDATE tasks SET updated_at = ? WHERE id = ?", ts, taskId);
  recordEvent({
    taskId,
    pocId: task.poc_id,
    eventType: "label_removed",
    field: "label",
    oldValue: label,
    title: task.title,
    at: ts,
  });
  res.json(fetchTaskFull(taskId));
});

module.exports = router;
