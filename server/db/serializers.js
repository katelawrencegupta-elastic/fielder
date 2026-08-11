const { all } = require("./helpers");

const WORKSTREAM_KEYS = new Set(["ws1", "ws2", "ws3", "misc"]);

function normalizeWorkstream(value) {
  const v = value == null || value === "" ? "misc" : String(value);
  return WORKSTREAM_KEYS.has(v) ? v : "misc";
}

// Batch-attach subtasks + labels to a list of task rows (avoids N+1 queries).
function attachTaskExtras(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const subtaskRows = all(
    `SELECT * FROM subtasks WHERE task_id IN (${placeholders}) ORDER BY position ASC, id ASC`,
    ...ids
  );
  const labelRows = all(
    `SELECT * FROM task_labels WHERE task_id IN (${placeholders}) ORDER BY label ASC`,
    ...ids
  );

  const subtasksByTask = {};
  subtaskRows.forEach((s) => {
    (subtasksByTask[s.task_id] ??= []).push({
      id: s.id,
      text: s.text,
      done: s.done === 1,
      position: s.position,
      createdAt: s.created_at,
    });
  });
  const labelsByTask = {};
  labelRows.forEach((l) => {
    (labelsByTask[l.task_id] ??= []).push(l.label);
  });

  return rows.map((r) => rowToTask(r, subtasksByTask[r.id] || [], labelsByTask[r.id] || []));
}

function rowToTask(row, subtasks = [], labels = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    account: row.account_key,
    epicId: row.epic_id,
    pocId: row.poc_id,
    stage: row.stage_key,
    category: row.category || "general",
    workstream: normalizeWorkstream(row.workstream),
    startDate: row.start_date,
    dueDate: row.due_date,
    position: row.position,
    source: row.source,
    subtasks,
    labels,
    subtaskProgress: {
      done: subtasks.filter((s) => s.done).length,
      total: subtasks.length,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEpic(row, taskStats = { total: 0, done: 0 }) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    account: row.account_key,
    status: row.status,
    taskCount: taskStats.total,
    doneCount: taskStats.done,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPoc(row, commitCount = 0, lastCommitAt = null) {
  return {
    id: row.id,
    folderName: row.folder_name,
    account: row.account_key,
    title: row.title,
    status: row.status,
    startDate: row.start_date,
    targetDemoDate: row.target_demo_date,
    owner: row.owner,
    repoUrl: row.repo_url,
    notesUrl: row.notes_url || null,
    manifestSyncedAt: row.manifest_synced_at,
    commitCount,
    lastCommitAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCommit(row) {
  return {
    sha: row.sha,
    pocId: row.poc_id,
    message: row.message,
    author: row.author,
    committedAt: row.committed_at,
    url: row.url,
  };
}

function rowToAccount(row) {
  return {
    key: row.key,
    label: row.label,
    long: row.long_name,
    ae: row.ae,
    bg: row.bg,
    color: row.color,
    aeBg: row.ae_bg,
    aeColor: row.ae_color,
    active: row.active === 1,
  };
}

module.exports = {
  attachTaskExtras,
  rowToTask,
  normalizeWorkstream,
  WORKSTREAM_KEYS,
  rowToEpic,
  rowToPoc,
  rowToCommit,
  rowToAccount,
};
