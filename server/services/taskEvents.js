const { run, now } = require("../db/helpers");

function str(v) {
  if (v == null) return null;
  return String(v);
}

function same(a, b) {
  const sa = a == null || a === "" ? null : String(a);
  const sb = b == null || b === "" ? null : String(b);
  return sa === sb;
}

/**
 * @param {{
 *   taskId?: number|null,
 *   pocId?: number|null,
 *   eventType: string,
 *   field?: string|null,
 *   oldValue?: string|null,
 *   newValue?: string|null,
 *   title?: string|null,
 *   at?: number,
 * }} opts
 */
function recordEvent(opts) {
  const ts = opts.at ?? now();
  run(
    `INSERT INTO task_events (task_id, poc_id, event_type, field, old_value, new_value, title, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    opts.taskId ?? null,
    opts.pocId ?? null,
    opts.eventType,
    opts.field ?? null,
    opts.oldValue == null ? null : str(opts.oldValue),
    opts.newValue == null ? null : str(opts.newValue),
    opts.title ?? null,
    ts
  );
}

/** Map DB task row → comparable field bag. */
function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    account: row.account_key,
    pocId: row.poc_id,
    stage: row.stage_key,
    category: row.category || "general",
    workstream: row.workstream || "misc",
    startDate: row.start_date,
    dueDate: row.due_date,
  };
}

const TRACKED = [
  { field: "title", eventType: "title_changed", key: "title" },
  { field: "stage", eventType: "stage_changed", key: "stage" },
  { field: "due_date", eventType: "due_date_changed", key: "dueDate" },
  { field: "start_date", eventType: "start_date_changed", key: "startDate" },
  { field: "account", eventType: "account_changed", key: "account" },
  { field: "poc_id", eventType: "poc_changed", key: "pocId" },
  { field: "category", eventType: "category_changed", key: "category" },
  { field: "workstream", eventType: "workstream_changed", key: "workstream" },
  { field: "description", eventType: "description_changed", key: "description" },
];

/**
 * Record one event per changed tracked field.
 * `before` / `after` are plain objects with keys from fromRow().
 */
function diffAndRecord(before, after, at = now()) {
  if (!before || !after) return;
  const title = after.title || before.title || null;
  // Prefer after.pocId for filtering; fall back to before when unlinking.
  const pocId =
    after.pocId != null
      ? Number(after.pocId)
      : before.pocId != null
        ? Number(before.pocId)
        : null;

  for (const t of TRACKED) {
    const oldV = before[t.key];
    const newV = after[t.key];
    if (same(oldV, newV)) continue;
    recordEvent({
      taskId: after.id ?? before.id,
      pocId,
      eventType: t.eventType,
      field: t.field,
      oldValue: oldV,
      newValue: newV,
      title,
      at,
    });
  }
}

module.exports = {
  recordEvent,
  diffAndRecord,
  fromRow,
};
