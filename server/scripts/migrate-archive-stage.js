// One-time migration: relabel stages ("In Progress" -> "To Do", "Done" -> "Finished"),
// add the new "archive" stage, and move all tasks that were sitting in "done" into it
// (an archive of everything that had already been finished before this stage existed).
// Safe to re-run: relabeling/inserting are idempotent, and the done->archive move only
// touches tasks still in stage_key="done".
const { db, all, run } = require("../db/helpers");
const { seed } = require("../db/seed");

seed(); // ensure the "archive" stage row exists

function main() {
  const txn = db.transaction(() => {
    run("UPDATE stages SET label = 'To Do' WHERE key = 'in_progress'");
    run("UPDATE stages SET label = 'Finished' WHERE key = 'done'");

    const doneTasks = all("SELECT id FROM tasks WHERE stage_key = 'done' ORDER BY position ASC");
    const maxPos = all("SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE stage_key = 'archive'")[0].maxPos;
    doneTasks.forEach((t, i) => {
      run("UPDATE tasks SET stage_key = 'archive', position = ? WHERE id = ?", maxPos + 1 + i, t.id);
    });
    return doneTasks.length;
  });

  const archived = txn();
  console.log(`Relabeled stages (In Progress -> To Do, Done -> Finished) and archived ${archived} previously-done tasks.`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
