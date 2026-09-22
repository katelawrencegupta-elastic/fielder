// Idempotent seed: safe to run multiple times (INSERT OR IGNORE keeps any
// edits made later through the app). New seed rows are inserted; curated
// meeting-folder accounts also refresh label/long/ae so Scrappy folders stay named.
const client = require("./client");
const { ACCOUNTS, STAGES } = require("./seedData");

const MEETING_FOLDER_KEYS = new Set([
  "1-1-with-tim",
  "corey-s-pod",
  "iko-1-1",
  "pete-1-1",
]);

function seed() {
  const db = client.db;
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (key, label, long_name, ae, bg, color, ae_bg, ae_color, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const updateMeetingFolder = db.prepare(`
    UPDATE accounts
    SET label = ?, long_name = ?, ae = ?, bg = ?, color = ?, ae_bg = ?, ae_color = ?, active = 1
    WHERE key = ?
  `);
  const insertStage = db.prepare(`
    INSERT OR IGNORE INTO stages (key, label, sort_order) VALUES (?, ?, ?)
  `);

  const txn = db.transaction(() => {
    ACCOUNTS.forEach((a, i) => {
      insertAccount.run(
        a.key,
        a.label,
        a.long,
        a.ae ?? null,
        a.bg ?? null,
        a.color ?? null,
        a.aeBg ?? null,
        a.aeColor ?? null,
        i
      );
      if (MEETING_FOLDER_KEYS.has(a.key)) {
        updateMeetingFolder.run(
          a.label,
          a.long,
          a.ae ?? null,
          a.bg ?? null,
          a.color ?? null,
          a.aeBg ?? null,
          a.aeColor ?? null,
          a.key
        );
      }
    });
    STAGES.forEach((s) => {
      insertStage.run(s.key, s.label, s.order);
    });
  });
  txn();

  console.log(`Seeded ${ACCOUNTS.length} accounts and ${STAGES.length} stages.`);
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
