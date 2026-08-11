// Pulls the account list fieldwork has synced live from its Google Sheet
// (server/accounts_cache table) and reconciles it into fielder's accounts
// table. Fielder has no direct sheet access of its own (401 when fetched
// directly), so fieldwork's cache — refreshed whenever someone runs its
// "↺ Accounts" sync — is the closest thing to a live source of truth.
//
// This is intentionally additive/non-destructive:
//   - existing accounts are never removed or renamed
//   - a cached account only becomes a NEW row if it doesn't already match an
//     existing account by key (after alias normalization) or by long name
//   - if it does match an existing account, we only fill in blanks (color,
//     ae, etc.) — we never overwrite a value that's already set
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { all, get, run } = require("../db/helpers");
const { normalizeAccountKey } = require("../db/accountAliases");

const FIELDWORK_DB_PATH =
  process.env.FIELDWORK_DB_PATH ||
  "/Users/klg/Documents/GItHub/fieldwork/fieldwork/0.1.0/server/fieldwork.db";

/** Accounts removed from Fielder — never re-add via sync. */
const RETIRED_ACCOUNT_KEYS = new Set([
  "bentley",
  "fitch",
  "geoquant",
  "frosty",
  "semplicity",
]);

function readFieldworkAccountsCache(dbPath = FIELDWORK_DB_PATH) {
  if (!fs.existsSync(dbPath)) return null;
  const src = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = src.prepare("SELECT data, fetched_at FROM accounts_cache WHERE key = 'accounts' LIMIT 1").get();
    if (!row) return null;
    return { accounts: JSON.parse(row.data), fetchedAt: row.fetched_at };
  } finally {
    src.close();
  }
}

function normalizeLongName(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function syncFromFieldwork(dbPath) {
  const cache = readFieldworkAccountsCache(dbPath);
  if (!cache) {
    return { ok: false, reason: "fieldwork.db not found or has no accounts_cache yet", added: [], updated: [] };
  }

  const existing = all("SELECT * FROM accounts");
  const byKey = new Map(existing.map((a) => [a.key, a]));
  const byLongName = new Map(existing.map((a) => [normalizeLongName(a.long_name), a]));
  const maxSort = existing.reduce((m, a) => Math.max(m, a.sort_order), -1);

  const added = [];
  const updated = [];
  let nextSort = maxSort + 1;

  cache.accounts.forEach((a) => {
    const key = normalizeAccountKey(a.key);
    if (RETIRED_ACCOUNT_KEYS.has(key)) return;
    const existingByKey = byKey.get(key);
    const existingByName = byLongName.get(normalizeLongName(a.long || a.label || ""));
    const match = existingByKey || existingByName;

    if (!match) {
      run(
        `INSERT INTO accounts (key, label, long_name, ae, bg, color, ae_bg, ae_color, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        key,
        a.label || key,
        a.long || a.label || key,
        a.ae ?? null,
        a.bg ?? null,
        a.color ?? null,
        a.aeBg ?? null,
        a.aeColor ?? null,
        nextSort++
      );
      byKey.set(key, { key });
      added.push({ key, label: a.label });
      return;
    }

    // Fill in any blanks on the existing row without overwriting anything set.
    const patch = {};
    if (!match.ae && a.ae) patch.ae = a.ae;
    if (!match.bg && a.bg) patch.bg = a.bg;
    if (!match.color && a.color) patch.color = a.color;
    if (!match.ae_bg && a.aeBg) patch.ae_bg = a.aeBg;
    if (!match.ae_color && a.aeColor) patch.ae_color = a.aeColor;
    if (Object.keys(patch).length > 0) {
      const cols = Object.keys(patch);
      run(
        `UPDATE accounts SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE key = ?`,
        ...cols.map((c) => patch[c]),
        match.key
      );
      updated.push({ key: match.key, filled: cols });
    }
  });

  return { ok: true, fetchedAt: cache.fetchedAt, sourceCount: cache.accounts.length, added, updated };
}

module.exports = { syncFromFieldwork, readFieldworkAccountsCache };
