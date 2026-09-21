const DEFAULT_URL = "http://127.0.0.1:8787";

function scrappyOrigin() {
  const raw = String(process.env.SCRAPPY_URL || DEFAULT_URL).trim() || DEFAULT_URL;
  return raw.replace(/\/+$/, "");
}

function appUrl() {
  return `${scrappyOrigin()}/`;
}

function isUnavailableError(err) {
  if (!err) return false;
  const name = err.name || "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const cause = err.cause && (err.cause.code || err.cause.message);
  const msg = [err.message, cause].filter(Boolean).join(" ");
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|aborted|timeout/i.test(msg);
}

async function scrappyFetch(
  path,
  { query, timeoutMs = 2000, method = "GET", body } = {}
) {
  const url = new URL(path, appUrl());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      const text = String(value);
      if (text === "") continue;
      url.searchParams.set(key, text);
    }
  }
  const init = {
    method,
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body != null) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  return { status: res.status, data };
}

function sendUnavailable(res) {
  res.status(503).json({
    ok: false,
    error: "Scrappy search app is not running",
    url: appUrl(),
  });
}

async function proxyGet(res, path, query, timeoutMs) {
  return proxyJson(res, path, { query, timeoutMs, method: "GET" });
}

async function proxyJson(res, path, { query, method = "GET", body, timeoutMs = 2000 } = {}) {
  try {
    const { status, data } = await scrappyFetch(path, {
      query,
      method,
      body,
      timeoutMs,
    });
    res.status(status).json(data ?? {});
  } catch (err) {
    if (isUnavailableError(err)) {
      sendUnavailable(res);
      return;
    }
    console.error("Scrappy proxy failed:", err);
    res.status(502).json({ error: err.message || String(err) });
  }
}

module.exports = {
  appUrl,
  isUnavailableError,
  proxyGet,
  proxyJson,
  scrappyFetch,
  scrappyOrigin,
  sendUnavailable,
};
