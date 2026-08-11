-- Fielder schema
-- Conventions: timestamps are epoch milliseconds (INTEGER); dates are ISO "YYYY-MM-DD" strings.

CREATE TABLE IF NOT EXISTS accounts (
  key       TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  long_name TEXT NOT NULL,
  ae        TEXT,
  bg        TEXT,
  color     TEXT,
  ae_bg     TEXT,
  ae_color  TEXT,
  active    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stages (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS epics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  account_key TEXT NOT NULL DEFAULT 'other' REFERENCES accounts(key),
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pocs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_name        TEXT NOT NULL UNIQUE,
  account_key        TEXT REFERENCES accounts(key),
  title              TEXT,
  status             TEXT NOT NULL DEFAULT 'planning',
  start_date         TEXT,
  target_demo_date   TEXT,
  owner              TEXT,
  repo_url           TEXT,
  notes_url          TEXT,
  manifest_synced_at INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- A single commit can touch more than one POC folder's path (e.g. a repo-wide
-- commit), so it may legitimately need a row per POC — hence the composite key.
CREATE TABLE IF NOT EXISTS poc_commits (
  sha          TEXT NOT NULL,
  poc_id       INTEGER NOT NULL REFERENCES pocs(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  author       TEXT,
  committed_at INTEGER NOT NULL,
  url          TEXT,
  PRIMARY KEY (sha, poc_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  account_key TEXT NOT NULL DEFAULT 'other' REFERENCES accounts(key),
  epic_id     INTEGER REFERENCES epics(id) ON DELETE SET NULL,
  poc_id      INTEGER REFERENCES pocs(id) ON DELETE SET NULL,
  stage_key   TEXT NOT NULL DEFAULT 'backlog' REFERENCES stages(key),
  -- general | demo_workshop — demos/workshops surface on the calendar view
  category    TEXT NOT NULL DEFAULT 'general',
  -- POC board swimlane: ws1 | ws2 | ws3 | misc
  workstream  TEXT NOT NULL DEFAULT 'misc',
  start_date  TEXT,
  due_date    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_labels (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label   TEXT NOT NULL,
  PRIMARY KEY (task_id, label)
);

-- Activity log for POC daily/weekly reports (written on task mutations).
CREATE TABLE IF NOT EXISTS task_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  poc_id     INTEGER REFERENCES pocs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  field      TEXT,
  old_value  TEXT,
  new_value  TEXT,
  title      TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_account   ON tasks(account_key);
CREATE INDEX IF NOT EXISTS idx_tasks_epic      ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_poc       ON tasks(poc_id);
CREATE INDEX IF NOT EXISTS idx_tasks_stage     ON tasks(stage_key);
CREATE INDEX IF NOT EXISTS idx_subtasks_task   ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_poc_commits_poc ON poc_commits(poc_id);
CREATE INDEX IF NOT EXISTS idx_epics_account   ON epics(account_key);
CREATE INDEX IF NOT EXISTS idx_task_events_poc_time ON task_events(poc_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_events_time ON task_events(created_at);
