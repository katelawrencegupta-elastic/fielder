const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fielder-gh-"));
process.env.FIELDER_DB_PATH = path.join(tmpRoot, "fielder.db");

const client = require("../db/client");
const helpers = require("../db/helpers");
const github = require("../services/github");

const OWNER = process.env.POC_REPO_OWNER || "katelawrencegupta-elastic";
const REPO = process.env.POC_REPO_NAME || "poc";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers[String(name).toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("github sync", () => {
  before(() => {
    helpers.run(
      `INSERT OR IGNORE INTO accounts (key, label, long_name, active, sort_order) VALUES (?, ?, ?, 1, 0)`,
      "other",
      "Other",
      "Other"
    );
  });

  after(() => {
    try {
      client.closeDatabase();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("times out hung GitHub requests", async () => {
    await assert.rejects(
      () =>
        github.listPocFolders({
          timeoutMs: 30,
          maxAttempts: 1,
          fetchFn: (_url, init) =>
            new Promise((_, reject) => {
              init.signal.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "TimeoutError";
                reject(err);
              });
            }),
        }),
      /timed out/
    );
  });

  it("rejects overlapping syncs", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const fetchFn = async () => {
      await gate;
      return jsonResponse([]);
    };
    const first = github.syncAll({ fetchFn, timeoutMs: 10_000, maxAttempts: 1 });
    await Promise.resolve();
    await assert.rejects(() => github.syncAll({ fetchFn }), (err) => err.code === "SYNC_IN_PROGRESS");
    release();
    await first;
  });

  it("retries 429 using Retry-After then upserts in one pass", async () => {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      if (url === `${API_BASE}/contents` && calls.filter((u) => u === url).length === 1) {
        return jsonResponse({ message: "slow down" }, {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      if (url === `${API_BASE}/contents`) {
        return jsonResponse([{ type: "dir", name: "demo-poc" }]);
      }
      if (url.includes("/poc.json")) {
        return jsonResponse({
          content: Buffer.from(
            JSON.stringify({ title: "Demo", account: "other", status: "active" })
          ).toString("base64"),
          encoding: "base64",
        });
      }
      if (url.includes("/commits?")) {
        return jsonResponse([
          {
            sha: "abc123",
            html_url: "https://github.com/example/poc/commit/abc123",
            commit: { message: "init", author: { name: "Ada", date: "2026-09-18T12:00:00Z" } },
            author: { login: "ada" },
          },
        ]);
      }
      return jsonResponse(null, { status: 404 });
    };

    const results = await github.syncAll({ fetchFn, timeoutMs: 2000, maxAttempts: 3, concurrency: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0].folderName, "demo-poc");
    assert.equal(results[0].commitCount, 1);
    assert.equal(results[0].hasManifest, true);

    const poc = helpers.get("SELECT * FROM pocs WHERE folder_name = ?", "demo-poc");
    assert.equal(poc.title, "Demo");
    const commits = helpers.all("SELECT * FROM poc_commits WHERE poc_id = ?", poc.id);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].sha, "abc123");
  });
});
