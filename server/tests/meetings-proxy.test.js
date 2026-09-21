const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

describe("meetings proxy", () => {
  let scrappy;
  let fielder;
  let scrappyPort;
  let fielderPort;

  before(async () => {
    scrappy = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/api/filters") {
        res.end(JSON.stringify({ accounts: ["ge_vernova"], pocs: { ge_vernova: ["Demo"] } }));
        return;
      }
      if (url.pathname === "/api/search") {
        res.end(
          JSON.stringify({
            hits: [
              {
                rel_path: "ge_vernova/Demo/2026-09-08T10-00-00.txt",
                account: url.searchParams.get("account") || "",
                poc: url.searchParams.get("poc") || "",
                started_at: "2026-09-08T10:00:00",
                kind: "summary",
                snippet: "Newest vernova call.",
                score: 0,
              },
            ],
          })
        );
        return;
      }
      if (url.pathname === "/api/meeting") {
        const path = url.searchParams.get("path") || "";
        if (path.includes("..")) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Meeting not found" }));
          return;
        }
        res.end(JSON.stringify({ rel_path: path, notes: "Summary notes." }));
        return;
      }
      if (url.pathname === "/api/followups") {
        res.end(JSON.stringify({ items: [{ text: "Call Kate", rel_path: "x.txt" }] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not found" }));
    });
    await new Promise((resolve) => scrappy.listen(0, "127.0.0.1", resolve));
    scrappyPort = scrappy.address().port;
    process.env.SCRAPPY_URL = `http://127.0.0.1:${scrappyPort}`;
    delete require.cache[require.resolve("../services/scrappy")];
    delete require.cache[require.resolve("../routes/meetings")];
    const meetingsRouter = require("../routes/meetings");
    const app = express();
    app.use("/api/meetings", meetingsRouter);
    fielder = http.createServer(app);
    await new Promise((resolve) => fielder.listen(0, "127.0.0.1", resolve));
    fielderPort = fielder.address().port;
  });

  after(async () => {
    await new Promise((resolve) => fielder.close(resolve));
    await new Promise((resolve) => scrappy.close(resolve));
  });

  function get(path) {
    return fetch(`http://127.0.0.1:${fielderPort}${path}`).then(async (res) => ({
      status: res.status,
      data: await res.json(),
    }));
  }

  it("reports health and proxies search for a POC", async () => {
    const health = await get("/api/meetings/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.match(health.data.url, /127\.0\.0\.1/);

    const search = await get("/api/meetings/search?account=ge_vernova&poc=Demo");
    assert.equal(search.status, 200);
    assert.equal(search.data.hits[0].account, "ge_vernova");
    assert.equal(search.data.hits[0].poc, "Demo");
  });

  it("proxies meeting notes and follow-ups", async () => {
    const meeting = await get(
      "/api/meetings/meeting?path=ge_vernova%2FDemo%2F2026-09-08T10-00-00.txt"
    );
    assert.equal(meeting.status, 200);
    assert.match(meeting.data.notes, /Summary/);

    const followups = await get("/api/meetings/followups?account=ge_vernova&poc=Demo");
    assert.equal(followups.status, 200);
    assert.equal(followups.data.items[0].text, "Call Kate");
  });

  it("rejects path traversal on meeting lookup", async () => {
    const bad = await get("/api/meetings/meeting?path=../secret.txt");
    assert.equal(bad.status, 400);
  });

  it("returns 503 when Scrappy is down", async () => {
    const prev = process.env.SCRAPPY_URL;
    process.env.SCRAPPY_URL = "http://127.0.0.1:1";
    delete require.cache[require.resolve("../services/scrappy")];
    delete require.cache[require.resolve("../routes/meetings")];
    const meetingsRouter = require("../routes/meetings");
    const app = express();
    app.use("/api/meetings", meetingsRouter);
    const down = http.createServer(app);
    await new Promise((resolve) => down.listen(0, "127.0.0.1", resolve));
    try {
      const port = down.address().port;
      const res = await fetch(`http://127.0.0.1:${port}/api/meetings/health`);
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.ok, false);
    } finally {
      process.env.SCRAPPY_URL = prev;
      await new Promise((resolve) => down.close(resolve));
    }
  });
});
