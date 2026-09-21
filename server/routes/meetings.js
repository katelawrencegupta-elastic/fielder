const express = require("express");
const { appUrl, proxyGet, proxyJson, scrappyFetch, sendUnavailable } = require("../services/scrappy");

const router = express.Router();

function pick(query, keys) {
  const out = {};
  for (const key of keys) {
    if (query[key] == null || query[key] === "") continue;
    out[key] = Array.isArray(query[key]) ? query[key][0] : query[key];
  }
  return out;
}

function meetingPath(value) {
  const rel = String(value || "").trim();
  if (!rel || rel.startsWith("/") || rel.includes("..")) return "";
  return rel;
}

router.get("/health", async (_req, res) => {
  try {
    const { status } = await scrappyFetch("/api/filters", { timeoutMs: 1500 });
    if (status >= 200 && status < 300) {
      res.json({ ok: true, url: appUrl() });
      return;
    }
    sendUnavailable(res);
  } catch {
    sendUnavailable(res);
  }
});

router.get("/search", (req, res) => {
  proxyGet(
    res,
    "/api/search",
    pick(req.query, ["q", "account", "poc", "since", "k", "include_archived"])
  );
});

router.get("/followups", (req, res) => {
  proxyGet(
    res,
    "/api/followups",
    pick(req.query, ["account", "poc", "since", "include_archived"])
  );
});

router.get("/meeting", (req, res) => {
  const rel = meetingPath(
    Array.isArray(req.query.path) ? req.query.path[0] : req.query.path
  );
  if (!rel) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  proxyGet(res, "/api/meeting", { path: rel });
});

router.post("/archive", (req, res) => {
  const rel = meetingPath(req.body?.path);
  if (!rel) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  proxyJson(res, "/api/meeting/archive", {
    method: "POST",
    body: { path: rel },
  });
});

router.post("/unarchive", (req, res) => {
  const rel = meetingPath(req.body?.path);
  if (!rel) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  proxyJson(res, "/api/meeting/unarchive", {
    method: "POST",
    body: { path: rel },
  });
});

router.post("/delete", (req, res) => {
  const rel = meetingPath(req.body?.path);
  if (!rel) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  proxyJson(res, "/api/meeting/delete", {
    method: "POST",
    body: { path: rel },
  });
});

router.post("/move", (req, res) => {
  const rel = meetingPath(req.body?.path);
  const account = String(req.body?.account || "").trim();
  const poc = String(req.body?.poc || "").trim();
  if (!rel) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  if (!account) {
    res.status(400).json({ error: "account is required" });
    return;
  }
  proxyJson(res, "/api/meeting/move", {
    method: "POST",
    body: { path: rel, account, poc },
  });
});

module.exports = router;
