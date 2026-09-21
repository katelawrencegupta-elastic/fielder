const helpers = require("../db/helpers");
const { get, run, now } = helpers;

const OWNER = process.env.POC_REPO_OWNER || "katelawrencegupta-elastic";
const REPO = process.env.POC_REPO_NAME || "poc";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const GH_TIMEOUT_MS = 15000;
const GH_MAX_ATTEMPTS = 3;
const GH_CONCURRENCY = 3;

let syncInflight = null;

function authHeaders() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "fielder-app" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(res, attempt) {
  const retryAfter = Number(res?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function isRetryableStatus(res) {
  if (res.status === 429) return true;
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") return true;
  return res.status === 502 || res.status === 503 || res.status === 504;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, worker));
  return results;
}

async function ghFetch(url, { fetchFn = fetch, timeoutMs = GH_TIMEOUT_MS, maxAttempts = GH_MAX_ATTEMPTS } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res;
    try {
      res = await fetchFn(url, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err.name === "AbortError" || err.name === "TimeoutError";
      if (timedOut) {
        lastErr = new Error(`GitHub request timed out (${url})`);
      } else {
        const cause = err.cause?.message || err.cause?.code || err.message;
        lastErr = new Error(
          `Network error reaching GitHub (${cause}). Check connectivity` +
            (process.env.HTTPS_PROXY || process.env.HTTP_PROXY ? " / proxy settings" : "") +
            "."
        );
      }
      if (timedOut && attempt < maxAttempts) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      throw lastErr;
    }
    if (res.status === 404) return null;
    if (isRetryableStatus(res) && attempt < maxAttempts) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    if (!res.ok) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const body = await res.text().catch(() => "");
      throw new Error(
        `GitHub API ${res.status} for ${url}${remaining === "0" ? " (rate limited — set GITHUB_TOKEN in .env)" : ""}: ${body.slice(0, 300)}`
      );
    }
    return res.json();
  }
  throw lastErr || new Error(`GitHub request failed (${url})`);
}

async function listPocFolders(opts) {
  const contents = await ghFetch(`${API_BASE}/contents`, opts);
  if (!contents) return [];
  return contents
    .filter((item) => item.type === "dir" && !item.name.startsWith("."))
    .map((item) => item.name);
}

async function fetchManifest(folderName, opts) {
  const item = await ghFetch(
    `${API_BASE}/contents/${encodeURIComponent(folderName)}/poc.json`,
    opts
  );
  if (!item || !item.content) return null;
  try {
    const decoded = Buffer.from(item.content, item.encoding || "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (err) {
    console.error(`Failed to parse poc.json for ${folderName}:`, err.message);
    return null;
  }
}

async function fetchCommits(folderName, perPage = 50, opts) {
  const commits = await ghFetch(
    `${API_BASE}/commits?path=${encodeURIComponent(folderName)}&per_page=${perPage}`,
    opts
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

async function runSync(opts = {}) {
  const folders = await listPocFolders(opts);
  const fetched = await mapLimit(folders, opts.concurrency ?? GH_CONCURRENCY, async (folderName) => {
    const [manifest, commits] = await Promise.all([
      fetchManifest(folderName, opts),
      fetchCommits(folderName, 50, opts),
    ]);
    return { folderName, manifest, commits };
  });
  const persist = helpers.db.transaction(() =>
    fetched.map(({ folderName, manifest, commits }) => {
      const pocId = upsertPoc(folderName, manifest);
      upsertCommits(pocId, commits);
      return { folderName, pocId, commitCount: commits.length, hasManifest: !!manifest };
    })
  );
  return persist();
}

async function syncAll(opts = {}) {
  if (syncInflight) {
    const err = new Error("POC sync already in progress");
    err.code = "SYNC_IN_PROGRESS";
    throw err;
  }
  syncInflight = runSync(opts);
  try {
    return await syncInflight;
  } finally {
    syncInflight = null;
  }
}

module.exports = { syncAll, listPocFolders, fetchManifest, fetchCommits };
