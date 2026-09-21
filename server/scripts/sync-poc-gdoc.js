#!/usr/bin/env node
/**
 * Export a POC's Kanban cards to a local status text file and record the
 * linked notes Doc id (no Google API auth / remote push).
 *
 * Usage:
 *   node server/scripts/sync-poc-gdoc.js
 *   node server/scripts/sync-poc-gdoc.js --poc-id=5 --doc-id=1ihjsdsvSj_dyPTM8CzMu0M6A_esBGOeeOMmS_vfLN_I
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { writeSnapshot } = require("../services/snapshot");

const DEFAULT_POC_ID = 3;
const DEFAULT_DOC_ID = "1YgE2fsHJyU-fTbRiroBisCIPhyuKAZ_x6Orex578McE";
const DB_PATH = path.join(__dirname, "..", "fielder.db");
const DATA_DIR = path.join(__dirname, "..", "data");
const LINKS_PATH = path.join(DATA_DIR, "poc-doc-links.json");

function arg(name, fallback) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
}

function linkedDocId(pocId, fallback) {
  try {
    if (!fs.existsSync(LINKS_PATH)) return fallback;
    const links = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8"));
    return links[String(pocId)]?.docId || fallback;
  } catch {
    return fallback;
  }
}

function buildStatusText(pocId) {
  const db = new DatabaseSync(DB_PATH);
  try {
    const stages = Object.fromEntries(
      db.prepare("SELECT key, label, sort_order FROM stages").all().map((r) => [r.key, r])
    );
    const poc = db.prepare("SELECT * FROM pocs WHERE id = ?").get(pocId);
    if (!poc) throw new Error(`POC ${pocId} not found`);
    const tasks = db
      .prepare(
        `SELECT * FROM tasks WHERE poc_id = ? AND stage_key != 'archive'
         ORDER BY (SELECT sort_order FROM stages WHERE key = stage_key), position, id`
      )
      .all(pocId);
    const by = {};
    for (const t of tasks) (by[t.stage_key] ||= []).push(t);
    const order = Object.keys(by).sort(
      (a, b) => (stages[a]?.sort_order ?? 99) - (stages[b]?.sort_order ?? 99)
    );
    const stamp = new Date().toISOString();
    let md = "";
    md += `${poc.title || poc.folder_name} — Fielder Kanban status\n`;
    md += `Synced: ${stamp} (from Fielder)\n`;
    md += `POC id: ${poc.id}\n\n`;
    for (const key of order) {
      const label = stages[key]?.label || key;
      md += `${label.toUpperCase()} (${by[key].length})\n`;
      for (const t of by[key]) {
        const due = t.due_date ? `  [due ${t.due_date}]` : "";
        md += `- ${t.title}${due}\n`;
      }
      md += "\n";
    }
    const archived = db
      .prepare("SELECT COUNT(*) as n FROM tasks WHERE poc_id = ? AND stage_key = 'archive'")
      .get(pocId).n;
    md += `Archived cards: ${archived} (omitted)\n`;
    return { text: md, poc, stamp };
  } finally {
    db.close();
  }
}

function saveLocal(pocId, docId, payload) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = path.join(DATA_DIR, `poc-${pocId}-status-sync.txt`);
  fs.writeFileSync(out, payload.text);
  let links = {};
  if (fs.existsSync(LINKS_PATH)) {
    try {
      links = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8"));
    } catch {
      links = {};
    }
  }
  links[String(pocId)] = {
    pocId,
    title: payload.poc.title || payload.poc.folder_name,
    docId,
    docUrl: docId ? `https://docs.google.com/document/d/${docId}/edit` : null,
    versioning: false,
    lastLocalExportAt: payload.stamp,
  };
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2) + "\n");
  return out;
}

function main() {
  const pocId = Number(arg("poc-id", DEFAULT_POC_ID));
  const docId = arg("doc-id", linkedDocId(pocId, DEFAULT_DOC_ID));

  console.log("Saving Fielder DB snapshot (local versioning)…");
  writeSnapshot();

  const payload = buildStatusText(pocId);
  const outPath = saveLocal(pocId, docId, payload);
  console.log(`Local export: ${outPath}`);
  if (docId) {
    console.log(`Linked notes Doc: https://docs.google.com/document/d/${docId}/edit`);
  }
}

main();
