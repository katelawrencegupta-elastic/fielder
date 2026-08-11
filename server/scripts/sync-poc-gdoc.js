#!/usr/bin/env node
/**
 * Sync GE Vernova Observability POC Kanban cards → Google Doc, then keep a
 * Drive revision forever (named version / versioning).
 *
 * Doc: https://docs.google.com/document/d/1YgE2fsHJyU-fTbRiroBisCIPhyuKAZ_x6Orex578McE/edit
 *
 * Auth (pick one):
 *   1) OAuth (recommended): put client_secret_*.json in server/auth/, then
 *        node server/scripts/google-oauth-login.js
 *      (saves server/auth/token.json; add redirect URI http://127.0.0.1:8765/oauth2callback)
 *   2) export GOOGLE_ACCESS_TOKEN="ya29...."
 *   3) export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
 *      (SA must have edit access on the Doc)
 *
 * Usage:
 *   node server/scripts/sync-poc-gdoc.js
 *   node server/scripts/sync-poc-gdoc.js --poc-id=3 --doc-id=1YgE2fsHJyU-fTbRiroBisCIPhyuKAZ_x6Orex578McE
 *
 * Without credentials, writes the export to server/data/ and exits 2.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { writeSnapshot } = require("../services/snapshot");
const { getAccessToken } = require("./google-auth");

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
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    versioning: true,
    lastLocalExportAt: payload.stamp,
  };
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2) + "\n");
  return out;
}

async function syncToGoogleDoc(docId, text, token) {
  const getRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) throw new Error(`docs.get failed: ${getRes.status} ${await getRes.text()}`);
  const doc = await getRes.json();
  const revisionId = doc.revisionId;
  const endIndex = doc.body?.content?.at(-1)?.endIndex ?? 1;

  const requests = [];
  // Clear existing body (leave the final newline structural index)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }
  requests.push({
    insertText: {
      location: { index: 1 },
      text,
    },
  });

  const batchRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests,
      writeControl: { targetRevisionId: revisionId },
    }),
  });
  if (!batchRes.ok) throw new Error(`docs.batchUpdate failed: ${batchRes.status} ${await batchRes.text()}`);

  // Enable / keep a permanent revision (versioning)
  const revList = await fetch(
    `https://www.googleapis.com/drive/v3/files/${docId}/revisions?fields=revisions(id,keepForever,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!revList.ok) throw new Error(`revisions.list failed: ${revList.status} ${await revList.text()}`);
  const { revisions = [] } = await revList.json();
  const latest = revisions.at(-1);
  if (latest?.id) {
    const keep = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/revisions/${latest.id}?fields=id,keepForever`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keepForever: true }),
      }
    );
    if (!keep.ok) {
      console.warn(`Could not keepForever revision: ${keep.status} ${await keep.text()}`);
    } else {
      console.log(`Versioning: revision ${latest.id} keepForever=true`);
    }
  }

  return { revisionId, latestRevisionId: latest?.id };
}

async function main() {
  const pocId = Number(arg("poc-id", DEFAULT_POC_ID));
  const docId = arg("doc-id", linkedDocId(pocId, DEFAULT_DOC_ID));

  console.log("Saving Fielder DB snapshot (local versioning)…");
  writeSnapshot();

  const payload = buildStatusText(pocId);
  const outPath = saveLocal(pocId, docId, payload);
  console.log(`Local export: ${outPath}`);

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error("Auth error:", e.message);
  }

  if (!token) {
    console.error(`
No Google credentials available.
Run:  node server/scripts/google-oauth-login.js
  (needs client_secret_*.json in server/auth/ + redirect URI registered)
Or set GOOGLE_ACCESS_TOKEN / GOOGLE_APPLICATION_CREDENTIALS.
The status text is ready at:
  ${outPath}
Doc:
  https://docs.google.com/document/d/${docId}/edit
`);
    process.exit(2);
  }

  console.log(`Pushing to Google Doc ${docId}…`);
  const result = await syncToGoogleDoc(docId, payload.text, token);
  console.log("Synced.", result);

  const links = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8"));
  links[String(pocId)].lastRemoteSyncAt = new Date().toISOString();
  links[String(pocId)].lastKeptRevisionId = result.latestRevisionId || null;
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
