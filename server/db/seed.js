// Idempotent seed: safe to run multiple times (INSERT OR IGNORE keeps any
// edits made later through the app).
const { db } = require("./client");
const { ACCOUNTS, STAGES } = require("./seedData");

function seed() {
  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (key, label, long_name, ae, bg, color, ae_bg, ae_color, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
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
