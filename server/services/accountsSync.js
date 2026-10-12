// Syncs Fielder accounts from a Google Sheet and/or local CSV.
//
// Sources (first that works wins):
//   1. Live CSV export of the sheet (ACCOUNTS_SHEET_ID / _URL / _CSV_URL)
//   2. Local drop: server/data/accounts-sheet.csv (or ACCOUNTS_SHEET_CSV)
//   3. Legacy fieldwork.db accounts_cache when FIELDWORK_DB_PATH is set
//
// Additive/non-destructive for rows:
//   - existing accounts are never removed
//   - new sheet accounts are inserted
//   - AE is updated from the sheet when present (sheet is source of truth for AE)
//   - colors only fill blanks
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { all, run } = require("../db/helpers");
const { normalizeAccountKey } = require("../db/accountAliases");

const SPREADSHEET_ID = String(process.env.ACCOUNTS_SHEET_ID || "").trim();
const ACCOUNTS_SHEET_URL =
  String(process.env.ACCOUNTS_SHEET_URL || "").trim() ||
  (SPREADSHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing`
    : "");
const ACCOUNTS_SHEET_CSV_URL =
  String(process.env.ACCOUNTS_SHEET_CSV_URL || "").trim() ||
  (SPREADSHEET_ID
    ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv`
    : "");
const LOCAL_SHEET_CSV = String(process.env.ACCOUNTS_SHEET_CSV || "").trim();
const LOCAL_SHEET_CSV_FALLBACK = path.join(__dirname, "..", "data", "accounts-sheet.csv");
/** Optional path to a legacy fieldwork.db — no machine-specific default. */
const FIELDWORK_DB_PATH = String(process.env.FIELDWORK_DB_PATH || "").trim();

/** Accounts removed from Fielder — never re-add via sync. */
const RETIRED_ACCOUNT_KEYS = new Set([
  "bentley",
  "fitch",
  "geoquant",
  "frosty",
  "semplicity",
]);

const AE_PALETTE = [
  { bg: "#1a2e1a", color: "#7acf9a" },
  { bg: "#2a1a2e", color: "#c87adf" },
  { bg: "#2a2218", color: "#dfb87a" },
  { bg: "#1a2a3a", color: "#7ab8e8" },
  { bg: "#2a1818", color: "#e87a7a" },
  { bg: "#1a2a28", color: "#7ae8df" },
];

const ACCT_PALETTE = [
  { bg: "#0d2a45", color: "#5db8f5" },
  { bg: "#0d2e1a", color: "#4dc87a" },
  { bg: "#2e1f08", color: "#e8a44a" },
  { bg: "#2e0d0d", color: "#e87070" },
  { bg: "#0b2e22", color: "#3dcfa0" },
  { bg: "#2e1020", color: "#e07aab" },
  { bg: "#1e1e18", color: "#c8c090" },
  { bg: "#1a1540", color: "#9b8ff5" },
  { bg: "#182828", color: "#7adfd8" },
  { bg: "#281820", color: "#df8ab8" },
];

const LABEL_OVERRIDES = {
  "The Travelers Indemnity Company": "Travelers",
  "InsuraMatch LLC": "InsuraMatch",
  "The Depository Trust & Clearing Corporation": "DTCC",
  "Moody's Analytics, Inc.": "Moody's",
  "Finance of America Holdings LLC": "FoA",
  BlackStone: "Blackstone",
  "Goldman Sachs": "Goldman Sachs",
  "Merck & Co., Inc.": "Merck",
  "Johnson & Johnson": "J&J",
  "Bloomberg Finance L.P.": "Bloomberg",
  "Hilton Grand Vacations Company": "Hilton",
  "WorkForce Software": "WorkForce",
  "Colgate-Palmolive": "Colgate",
  "Regulatory Data Corporation": "Reg. Data Corp",
};

const KEY_OVERRIDES = {
  "The Travelers Indemnity Company": "travelers",
  "The Depository Trust & Clearing Corporation": "dtcc",
  "Finance of America Holdings LLC": "foa",
  "Goldman Sachs": "gs",
  BlackStone: "blackstone",
  "Moody's Analytics, Inc.": "moodys",
  "Merck & Co., Inc.": "merck",
  "Johnson & Johnson": "jj",
  "Bloomberg Finance L.P.": "bloomberg",
  "Hilton Grand Vacations Company": "hilton",
  "WorkForce Software": "workforce",
  "Colgate-Palmolive": "colgate",
  "Regulatory Data Corporation": "regulatory_data",
  "GE Vernova": "ge_vernova",
  "GE Aerospace": "ge_aerospace",
  "GE Healthcare": "ge_healthcare",
  "InsuraMatch LLC": "insuramatch",
  "Bristol Myers Squibb": "bms",
  "Abiomed, Inc.": "abiomed",
  "Abraxis Biosciences Inc.": "abraxis",
  "Agouron Pharmaceuticals, Inc.": "agouron",
  "Array BioPharma Inc.": "array_biopharma",
  "Biosense Webster Inc.": "biosense_webster",
  "Celgene Corporation": "celgene",
  "Cmp I Owner-T, LLC": "cmp_i_owner_t",
  "Merck & Co., Inc": "merck",
  "Merck & Co., Inc.": "merck",
  "Pfizer, Inc.": "pfizer",
  GlaxoSmithKline: "gsk",
  "GlaxoSmithKline ": "gsk",
  Genentech: "genentech",
  "Genentech Inc": "genentech",
  "Flatiron Health": "flatiron",
  "EMD Holding Corp.": "emd_holding",
  "J&J Innovative Medicines": "jj_innovative",
  "J&J MedTech": "jj_medtech",
  "Johnson & Johnson VIsion Care": "jj_vision",
  "Johnson & Johnson Vision Care": "jj_vision",
};

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function normalizeLongName(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function slugKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 20)
    .replace(/_+$/, "");
}

/** Parse sheet CSV (Account, AE, …) into account objects. */
function parseSheetCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const rows = lines.map(parseCsvLine);
  const header = rows[0].map((h) => h.toLowerCase());
  const looksLikeHeader =
    header.some((h) => /account|company|name/.test(h)) &&
    header.some((h) => /ae|owner|rep/.test(h));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  let nameIdx = 0;
  let aeIdx = 1;
  if (looksLikeHeader) {
    nameIdx = Math.max(
      0,
      header.findIndex((h) => /account|company|name/.test(h))
    );
    const aeFound = header.findIndex((h) => /^(ae|owner|rep)\b/.test(h) || h === "ae");
    aeIdx = aeFound >= 0 ? aeFound : nameIdx === 0 ? 1 : 0;
  }

  const parsed = [];
  for (const row of dataRows) {
    const name = (row[nameIdx] || "").trim();
    if (!name) continue;
    if (/^account$/i.test(name) || name === ":-:" || name.includes(":-")) continue;
    let ae = (row[aeIdx] || "").trim() || null;
    let active = true;
    if (ae && /^inactive$/i.test(ae)) {
      // Sheet marks account retired — hide from filters, clear AE
      active = false;
      ae = null;
    } else if (ae && /^(tbd|n\/?a|none|-)$/i.test(ae)) {
      ae = null;
    }
    parsed.push([name, ae, active]);
  }

  const aeNames = [...new Set(parsed.map(([, ae]) => ae).filter(Boolean))].sort();
  const aeColors = {};
  aeNames.forEach((ae, i) => {
    aeColors[ae] = AE_PALETTE[i % AE_PALETTE.length];
  });

  return parsed.map(([name, ae, active]) => {
    const key = normalizeAccountKey(KEY_OVERRIDES[name] || slugKey(name));
    const label =
      LABEL_OVERRIDES[name] || (name.length > 18 ? `${name.slice(0, 16)}…` : name);
    const palette = ACCT_PALETTE[hashStr(key) % ACCT_PALETTE.length];
    return {
      key,
      label,
      long: name,
      bg: palette.bg,
      color: palette.color,
      ae,
      aeBg: ae && aeColors[ae] ? aeColors[ae].bg : null,
      aeColor: ae && aeColors[ae] ? aeColors[ae].color : null,
      active,
    };
  });
}

function readFieldworkAccountsCache(dbPath = FIELDWORK_DB_PATH) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const src = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = src
      .prepare("SELECT data, fetched_at FROM accounts_cache WHERE key = 'accounts' LIMIT 1")
      .get();
    if (!row) return null;
    return { accounts: JSON.parse(row.data), fetchedAt: row.fetched_at, source: "fieldwork.db" };
  } finally {
    src.close();
  }
}

function readLocalSheetCsv(filePath) {
  const candidates = [filePath, LOCAL_SHEET_CSV, LOCAL_SHEET_CSV_FALLBACK].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    if (!text.trim() || text.trimStart().startsWith("<!DOCTYPE")) continue;
    const accounts = parseSheetCsv(text);
    if (!accounts.length) continue;
    const st = fs.statSync(candidate);
    return {
      accounts,
      fetchedAt: st.mtimeMs,
      source: "local-csv",
      path: candidate,
    };
  }
  return null;
}

async function fetchSheetCsv(url = ACCOUNTS_SHEET_CSV_URL) {
  if (!url) {
    return {
      ok: false,
      reason:
        "No accounts sheet configured. Set ACCOUNTS_SHEET_ID (or ACCOUNTS_SHEET_CSV_URL), or place a CSV at server/data/accounts-sheet.csv",
    };
  }
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Fielder/0.1 (accounts-sync)" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      reason:
        res.status === 401 || res.status === 403
          ? `Sheet is not publicly readable (${res.status}). Set sharing to "Anyone with the link can view", or download CSV to server/data/accounts-sheet.csv`
          : `Sheet fetch failed (${res.status})`,
    };
  }
  if (!text.trim() || text.trimStart().startsWith("<!DOCTYPE") || text.includes("Sign in")) {
    return {
      ok: false,
      status: res.status,
      reason:
        'Sheet returned a login page. Set sharing to "Anyone with the link can view", or download CSV to server/data/accounts-sheet.csv',
    };
  }
  const accounts = parseSheetCsv(text);
  if (!accounts.length) {
    return { ok: false, status: res.status, reason: "Sheet CSV had no account rows" };
  }
  return { ok: true, accounts, fetchedAt: Date.now(), source: "google-sheet", url };
}

function applyAccounts(accounts, { fetchedAt, source } = {}) {
  const existing = all("SELECT * FROM accounts");
  const byKey = new Map(existing.map((a) => [a.key, a]));
  const byLongName = new Map(existing.map((a) => [normalizeLongName(a.long_name), a]));
  const maxSort = existing.reduce((m, a) => Math.max(m, a.sort_order), -1);

  const added = [];
  const updated = [];
  let nextSort = maxSort + 1;

  for (const a of accounts) {
    const key = normalizeAccountKey(a.key);
    if (RETIRED_ACCOUNT_KEYS.has(key)) continue;
    const existingByKey = byKey.get(key);
    const existingByName = byLongName.get(normalizeLongName(a.long || a.label || ""));
    const match = existingByKey || existingByName;

    const sheetActive = a.active !== false ? 1 : 0;
    const sheetAe = sheetActive ? a.ae || null : null;

    if (!match) {
      if (!sheetActive) continue; // don't create brand-new inactive accounts
      run(
        `INSERT INTO accounts (key, label, long_name, ae, bg, color, ae_bg, ae_color, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        key,
        a.label || key,
        a.long || a.label || key,
        sheetAe,
        a.bg ?? null,
        a.color ?? null,
        a.aeBg ?? null,
        a.aeColor ?? null,
        nextSort++
      );
      byKey.set(key, { key });
      added.push({ key, label: a.label });
      continue;
    }

    const patch = {};
    if (Number(match.active ?? 1) !== sheetActive) patch.active = sheetActive;
    if (sheetAe !== (match.ae || null)) {
      patch.ae = sheetAe;
      patch.ae_bg = sheetAe ? a.aeBg ?? null : null;
      patch.ae_color = sheetAe ? a.aeColor ?? null : null;
    }
    if (!match.bg && a.bg) patch.bg = a.bg;
    if (!match.color && a.color) patch.color = a.color;
    if (Object.keys(patch).length > 0) {
      const cols = Object.keys(patch);
      run(
        `UPDATE accounts SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE key = ?`,
        ...cols.map((c) => patch[c]),
        match.key
      );
      updated.push({ key: match.key, filled: cols });
    }
  }

  return {
    ok: true,
    fetchedAt,
    source,
    sourceCount: accounts.length,
    sheetUrl: ACCOUNTS_SHEET_URL,
    added,
    updated,
  };
}

/** Prefer local CSV (KLG export) → live sheet → fieldwork cache. */
async function syncAccounts() {
  const local = readLocalSheetCsv();
  if (local) return applyAccounts(local.accounts, local);

  const remote = await fetchSheetCsv().catch((err) => ({
    ok: false,
    reason: err.message || "Sheet fetch failed",
  }));
  if (remote.ok) return applyAccounts(remote.accounts, remote);

  const cache = readFieldworkAccountsCache();
  if (cache) return applyAccounts(cache.accounts, cache);

  return {
    ok: false,
    reason:
      remote.reason ||
      "Could not read accounts CSV. Set ACCOUNTS_SHEET_ID, or place a CSV at server/data/accounts-sheet.csv.",
    sheetUrl: ACCOUNTS_SHEET_URL || null,
    added: [],
    updated: [],
  };
}

/** @deprecated use syncAccounts */
function syncFromFieldwork(dbPath) {
  const cache = readFieldworkAccountsCache(dbPath);
  if (!cache) {
    return {
      ok: false,
      reason: "fieldwork.db not found or has no accounts_cache yet",
      sheetUrl: ACCOUNTS_SHEET_URL,
      added: [],
      updated: [],
    };
  }
  return applyAccounts(cache.accounts, cache);
}

module.exports = {
  syncAccounts,
  syncFromFieldwork,
  readFieldworkAccountsCache,
  parseSheetCsv,
  fetchSheetCsv,
  ACCOUNTS_SHEET_URL,
  ACCOUNTS_SHEET_CSV_URL,
};
