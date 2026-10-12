// One-time migration: pull the existing task history out of the fieldwork
// app's SQLite DB and load it into fielder's schema.
//
// Mapping:
//   fieldwork.tasks.text        -> fielder.tasks.title
//   fieldwork.tasks.account     -> fielder.tasks.account_key (keys already match — both apps
//                                  share the same account list)
//   fieldwork.tasks.done        -> fielder.tasks.stage_key ("done" if done, else "backlog")
//   fieldwork.tasks.due_date    -> fielder.tasks.due_date
//   fieldwork.tasks.source      -> fielder.tasks.source
//   fieldwork.task_labels       -> fielder.task_labels
//
// Usage: node server/scripts/import-fieldwork.js [path-to-fieldwork.db] [--force]
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { db, get, run, all, now } = require("../db/helpers");
const { seed } = require("../db/seed");
const { normalizeAccountKey } = require("../db/accountAliases");

seed(); // ensure accounts/stages exist even if this runs before the server has started

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const sourcePath =
    args.find((a) => !a.startsWith("--")) ||
    String(process.env.FIELDWORK_DB_PATH || "").trim();

  if (!sourcePath) {
    console.error(
      "Usage: node server/scripts/import-fieldwork.js <path-to-fieldwork.db> [--force]\n" +
        "   or: FIELDWORK_DB_PATH=/path/to/fieldwork.db node server/scripts/import-fieldwork.js"
    );
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source fieldwork.db not found at: ${sourcePath}`);
    process.exit(1);
  }

  const existingImported = get("SELECT COUNT(*) as cnt FROM tasks WHERE source LIKE 'fieldwork%'").cnt;
  if (existingImported > 0 && !force) {
    console.log(
      `Skipping import — ${existingImported} previously-imported tasks already exist. Re-run with --force to import anyway (may duplicate).`
    );
    return;
  }

  const src = new DatabaseSync(sourcePath, { readOnly: true });
  const sourceTasks = src.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all();
  const sourceLabels = src.prepare("SELECT * FROM task_labels").all();
  src.close();

  const labelsByTask = {};
  sourceLabels.forEach((l) => {
    (labelsByTask[l.task_id] ??= []).push(l.label);
  });

  const accountKeys = new Set(all("SELECT key FROM accounts").map((r) => r.key));

  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, account_key, stage_key, due_date, position, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLabel = db.prepare(`INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)`);
  const maxPosByStage = { backlog: -1, done: -1 };

  const txn = db.transaction(() => {
    let imported = 0;
    let skippedUnknownAccount = 0;
    sourceTasks.forEach((t) => {
      const normalized = normalizeAccountKey(t.account);
      const accountKey = accountKeys.has(normalized) ? normalized : "other";
      if (!accountKeys.has(normalized)) skippedUnknownAccount++;
      const stage = t.done === 1 ? "done" : "backlog";
      maxPosByStage[stage] += 1;
      const info = insertTask.run(
        t.text,
        null,
        accountKey,
        stage,
        t.due_date ?? null,
        maxPosByStage[stage],
        `fieldwork_${t.source || "manual"}`,
        t.created_at,
        t.updated_at
      );
      const newId = info.lastInsertRowid;
      (labelsByTask[t.id] || []).forEach((label) => insertLabel.run(newId, label));
      imported++;
    });
    return { imported, skippedUnknownAccount };
  });

  const { imported, skippedUnknownAccount } = txn();
  console.log(
    `Imported ${imported} tasks from fieldwork.db${
      skippedUnknownAccount ? ` (${skippedUnknownAccount} had an unrecognized account and were filed under "other")` : ""
    }.`
  );
}

if (require.main === module) {
  main();
}

module.exports = { main };
