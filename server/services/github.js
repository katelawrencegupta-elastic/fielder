const { get, run, now } = require("../db/helpers");

const OWNER = process.env.POC_REPO_OWNER || "katelawrencegupta-elastic";
const REPO = process.env.POC_REPO_NAME || "poc";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

function authHeaders() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "fielder-app" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghFetch(url) {
  let res;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    const cause = err.cause?.message || err.cause?.code || err.message;
    throw new Error(
      `Network error reaching GitHub (${cause}). Check connectivity` +
        (process.env.HTTPS_PROXY || process.env.HTTP_PROXY
          ? " / proxy settings"
          : "") +
        "."
    );
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub API ${res.status} for ${url}${remaining === "0" ? " (rate limited — set GITHUB_TOKEN in .env)" : ""}: ${body.slice(0, 300)}`
    );
  }
  return res.json();
}

async function listPocFolders() {
  const contents = await ghFetch(`${API_BASE}/contents`);
  if (!contents) return [];
  return contents
    .filter((item) => item.type === "dir" && !item.name.startsWith("."))
    .map((item) => item.name);
}

async function fetchManifest(folderName) {
  const item = await ghFetch(`${API_BASE}/contents/${encodeURIComponent(folderName)}/poc.json`);
  if (!item || !item.content) return null;
  try {
    const decoded = Buffer.from(item.content, item.encoding || "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (err) {
    console.error(`Failed to parse poc.json for ${folderName}:`, err.message);
    return null;
  }
}

async function fetchCommits(folderName, perPage = 50) {
  const commits = await ghFetch(
    `${API_BASE}/commits?path=${encodeURIComponent(folderName)}&per_page=${perPage}`
  );
  if (!commits) return [];
  return commits.map((c) => ({
    sha: c.sha,
    message: (c.commit?.message || "").split("\n")[0],
    author: c.commit?.author?.name || c.author?.login || "unknown",
    committedAt: c.commit?.author?.date ? Date.parse(c.commit.author.date) : Date.now(),
    url: c.html_url,
  }));
}

function upsertPoc(folderName, manifest) {
  const existing = get("SELECT * FROM pocs WHERE folder_name = ?", folderName);
  const ts = now();
  const repoUrl = `https://github.com/${OWNER}/${REPO}/tree/main/${folderName}`;
  if (existing) {
    run(
      `UPDATE pocs SET account_key=?, title=?, status=?, start_date=?, target_demo_date=?, owner=?, repo_url=?, manifest_synced_at=?, updated_at=? WHERE id=?`,
      manifest?.account ?? existing.account_key,
      manifest?.title ?? existing.title ?? folderName,
      manifest?.status ?? existing.status,
      manifest?.startDate ?? existing.start_date,
      manifest?.targetDemoDate ?? existing.target_demo_date,
      manifest?.owner ?? existing.owner,
      repoUrl,
      manifest ? ts : existing.manifest_synced_at,
      ts,
      existing.id
    );
    return existing.id;
  }
  const info = run(
    `INSERT INTO pocs (folder_name, account_key, title, status, start_date, target_demo_date, owner, repo_url, manifest_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    folderName,
    manifest?.account ?? null,
    manifest?.title ?? folderName,
    manifest?.status ?? "planning",
    manifest?.startDate ?? null,
    manifest?.targetDemoDate ?? null,
    manifest?.owner ?? null,
    repoUrl,
    manifest ? ts : null,
    ts,
    ts
  );
  return info.lastInsertRowid;
}

function upsertCommits(pocId, commits) {
  commits.forEach((c) => {
    run(
      `INSERT INTO poc_commits (sha, poc_id, message, author, committed_at, url)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sha, poc_id) DO UPDATE SET message=excluded.message, author=excluded.author, committed_at=excluded.committed_at, url=excluded.url`,
      c.sha,
      pocId,
      c.message,
      c.author,
      c.committedAt,
      c.url
    );
  });
}

async function syncAll() {
  const folders = await listPocFolders();
  const results = [];
  for (const folderName of folders) {
    const manifest = await fetchManifest(folderName);
    const pocId = upsertPoc(folderName, manifest);
    const commits = await fetchCommits(folderName);
    upsertCommits(pocId, commits);
    results.push({ folderName, pocId, commitCount: commits.length, hasManifest: !!manifest });
  }
  return results;
}

module.exports = { syncAll, listPocFolders, fetchManifest, fetchCommits };
