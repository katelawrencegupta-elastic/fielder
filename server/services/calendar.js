const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const { extractMeetUrl, parseIcs } = require("./ics");
const { loadSparkEvents, sparkEnabled } = require("./sparkCalendar");

const SKIP_CALENDARS = new Set(["Birthdays", "US Holidays", "Siri Suggestions"]);
const DEFAULT_JSON_PATH = path.join(__dirname, "..", "..", "calendar.json");
const MAX_CALENDAR_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const CALENDAR_CACHE_TTL_MS = 45_000;
const calendarCache = new Map();
const calendarInflight = new Map();

function icsUrls() {
  const raw = [
    process.env.CALENDAR_ICS_URL,
    process.env.CALENDAR_ICS_URLS,
  ]
    .filter(Boolean)
    .join("\n");
  return raw
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => u.replace(/^webcal:/i, "https:"));
}

function icsPaths() {
  return String(process.env.CALENDAR_ICS_PATH || "")
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function calendarJsonPaths() {
  const fromEnv = String(process.env.CALENDAR_JSON_PATH || "")
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const defaults = [DEFAULT_JSON_PATH];
  return [...new Set([...fromEnv, ...defaults])];
}

function macosAllowed() {
  const raw = String(process.env.CALENDAR_ALLOW_MACOS || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function configured() {
  return (
    sparkEnabled() ||
    icsUrls().length > 0 ||
    icsPaths().length > 0 ||
    calendarJsonPaths().some((p) => fs.existsSync(p)) ||
    macosAllowed()
  );
}

function normalizeNeedle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareAccountNeedles(accounts = []) {
  return (accounts || []).map((a) => ({
    key: a.key,
    needles: [a.key, a.label, a.long]
      .filter(Boolean)
      .map((v) => normalizeNeedle(String(v).replace(/_/g, " ")))
      .filter((v) => v.length >= 3),
  }));
}

function matchPrepared(text, prepared = []) {
  const hay = normalizeNeedle(text);
  if (!hay) return "";
  let bestKey = "";
  let bestLen = 0;
  for (const a of prepared) {
    for (const n of a.needles) {
      if (hay.includes(n) && n.length > bestLen) {
        bestKey = a.key;
        bestLen = n.length;
      }
    }
  }
  return bestKey;
}

function matchAccount(text, accounts = []) {
  return matchPrepared(text, prepareAccountNeedles(accounts));
}

function toEvent(ev, prepared, source) {
  const account =
    matchPrepared(ev.accountHint || "", prepared) ||
    matchPrepared([ev.title, ev.location, ev.notes].join("\n"), prepared);
  return {
    id: ev.id,
    title: ev.title,
    start: new Date(ev.startMs).toISOString(),
    end: new Date(ev.endMs).toISOString(),
    startMs: ev.startMs,
    endMs: ev.endMs,
    allDay: Boolean(ev.allDay),
    location: ev.location || "",
    notes: ev.notes || "",
    url: ev.url || "",
    meetUrl: ev.meetUrl || extractMeetUrl([ev.url, ev.location, ev.notes].join("\n")),
    calendar: ev.calendar || source,
    account,
    source,
  };
}

/** Map fieldwork-style calendar.json rows into the internal event shape. */
function eventsFromCalendarJson(rows, fromMs, toMs) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const startMs = Date.parse(row.start);
    const endMs = Date.parse(row.end || row.start);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    // Include events that overlap the window (not only those that start in it).
    if (endMs <= fromMs || startMs >= toMs) continue;
    const join = String(row.joinLink || row.meetUrl || "").trim();
    const cal = String(row.calLink || row.url || "").trim();
    out.push({
      id: String(row.id || `json:${startMs}:${row.title || ""}`),
      title: String(row.title || "(No title)"),
      startMs,
      endMs,
      allDay: Boolean(row.allDay),
      location: String(row.location || ""),
      notes: String(row.notes || row.description || ""),
      url: cal,
      meetUrl: join || extractMeetUrl([join, cal, row.location, row.notes].filter(Boolean).join("\n")),
      calendar: "calendar.json",
      accountHint: String(row.account || ""),
    });
  }
  return out;
}

async function loadCalendarJsonFile(filePath, fromMs, toMs) {
  const text = await fsp.readFile(filePath, "utf8");
  const parsed = JSON.parse(text);
  return eventsFromCalendarJson(parsed, fromMs, toMs);
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "Fielder/0.1 (calendar)" },
  });
  if (!res.ok) throw new Error(`Calendar fetch ${res.status}`);
  return res.text();
}

function loadMacosCalendar(fromMs, toMs) {
  if (process.platform !== "darwin") return Promise.resolve([]);
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const script = `
function pad(n) { return String(n).padStart(2, "0"); }
function iso(d) { return new Date(d).toISOString(); }
function safe(fn) { try { return fn(); } catch (e) { return ""; } }
const app = Application("Calendar");
const skip = new Set(${JSON.stringify([...SKIP_CALENDARS])});
const start = new Date(${JSON.stringify(fromIso)});
const end = new Date(${JSON.stringify(toIso)});
const out = [];
for (const cal of app.calendars()) {
  const name = cal.name();
  if (skip.has(name)) continue;
  const events = cal.events.whose({
    _and: [
      { startDate: { _greaterThanEquals: start } },
      { startDate: { _lessThan: end } }
    ]
  })();
  for (const e of events) {
    out.push({
      id: "macos:" + name + ":" + iso(e.startDate()) + ":" + String(e.summary()),
      title: e.summary() || "(No title)",
      startMs: new Date(e.startDate()).getTime(),
      endMs: new Date(e.endDate()).getTime(),
      allDay: !!e.alldayEvent(),
      location: safe(() => e.location()) || "",
      notes: safe(() => e.description()) || "",
      url: safe(() => String(e.url() || "")),
      calendar: name,
      meetUrl: ""
    });
  }
}
JSON.stringify(out);
`;
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-l", "JavaScript"], { timeout: 8000 });
    let stdout = "";
    let done = false;
    const finish = (events) => {
      if (done) return;
      done = true;
      resolve(events);
    };
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("error", () => finish([]));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout);
        finish(Array.isArray(parsed) ? parsed : []);
      } catch {
        finish([]);
      }
    });
    child.stdin.end(script);
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish([]);
    }, 8000);
  });
}

function assertCalendarRange(fromMs, toMs) {
  const from = Number(fromMs);
  const to = Number(toMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    const err = new Error("from and to ISO timestamps are required");
    err.code = "BAD_RANGE";
    throw err;
  }
  if (to - from > MAX_CALENDAR_RANGE_MS) {
    const err = new Error("from/to range cannot exceed 90 days");
    err.code = "RANGE_TOO_LARGE";
    throw err;
  }
  return { from, to };
}

function cacheKey(fromMs, toMs, accounts) {
  const keys = (accounts || []).map((a) => a.key).join(",");
  return `${fromMs}|${toMs}|${keys}`;
}

async function loadCalendarEventsUncached({ fromMs, toMs, accounts = [] }) {
  const from = Number(fromMs);
  const to = Number(toMs);
  const collected = [];
  const errors = [];
  const sources = [];
  const prepared = prepareAccountNeedles(accounts);

  // Prefer Spark Desktop CLI when available (live calendar via Spark IPC).
  let sparkAvailable = false;
  try {
    const spark = await loadSparkEvents(from, to);
    if (spark.available && (spark.events || []).length > 0) {
      sparkAvailable = true;
      collected.push(...spark.events);
      sources.push("spark");
    } else {
      if (spark.error) errors.push(spark.error);
      // Dump raw Spark stdout whenever present (including unparseable / available:false).
      if (spark.raw) {
        try {
          const logDir = path.join(__dirname, "..", "..", "logs");
          await fsp.mkdir(logDir, { recursive: true });
          await fsp.writeFile(
            path.join(logDir, "spark-events-last.txt"),
            String(spark.raw).slice(0, 200_000),
            "utf8"
          );
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    errors.push(err.message || String(err));
  }

  let icsLoaded = false;
  if (!sparkAvailable) {
    for (const filePath of icsPaths()) {
      try {
        const text = await fsp.readFile(filePath, "utf8");
        collected.push(...parseIcs(text, from, to).map((e) => ({ ...e, calendar: e.calendar || filePath })));
        sources.push("ics-file");
        icsLoaded = true;
      } catch (err) {
        errors.push(err.message || String(err));
      }
    }

    for (const url of icsUrls()) {
      try {
        const text = await fetchUrl(url);
        collected.push(...parseIcs(text, from, to));
        sources.push("ics");
        icsLoaded = true;
      } catch (err) {
        errors.push(err.message || String(err));
      }
    }
  }

  // Stale fieldwork dump only when no live source (Spark / ICS) succeeded.
  if (!sparkAvailable && !icsLoaded) {
    for (const jsonPath of calendarJsonPaths()) {
      try {
        await fsp.access(jsonPath);
      } catch {
        continue;
      }
      try {
        const rows = await loadCalendarJsonFile(jsonPath, from, to);
        collected.push(...rows);
        sources.push("calendar.json");
      } catch (err) {
        errors.push(err.message || String(err));
      }
    }
  }

  // macOS Calendar scrape is opt-in (CALENDAR_ALLOW_MACOS=1) — off by default.
  if (
    macosAllowed() &&
    !sources.includes("spark") &&
    !sources.includes("ics") &&
    !sources.includes("ics-file") &&
    !sources.includes("calendar.json")
  ) {
    try {
      const mac = await loadMacosCalendar(from, to);
      if (mac.length) sources.push("macos");
      collected.push(...mac);
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }

  const seen = new Set();
  const events = [];
  for (const ev of collected) {
    const key = `${ev.startMs}|${(ev.title || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(toEvent(ev, prepared, ev.calendar || "calendar"));
  }
  events.sort((a, b) => a.startMs - b.startMs || a.title.localeCompare(b.title));

  return {
    events,
    configured:
      configured() ||
      sources.includes("macos") ||
      sources.includes("calendar.json") ||
      sources.includes("spark"),
    sources,
    errors,
  };
}

async function listCalendarEvents({ fromMs, toMs, accounts = [], skipCache = false } = {}) {
  const { from, to } = assertCalendarRange(fromMs, toMs);
  const key = cacheKey(from, to, accounts);
  if (!skipCache) {
    const cached = calendarCache.get(key);
    if (cached && Date.now() - cached.at < CALENDAR_CACHE_TTL_MS) {
      return { ...cached.result, cached: true };
    }
    if (calendarInflight.has(key)) return calendarInflight.get(key);
  }

  const pending = loadCalendarEventsUncached({ fromMs: from, toMs: to, accounts }).then(
    (result) => {
      calendarCache.set(key, { at: Date.now(), result });
      calendarInflight.delete(key);
      return result;
    },
    (err) => {
      calendarInflight.delete(key);
      throw err;
    }
  );
  if (!skipCache) calendarInflight.set(key, pending);
  return pending;
}

module.exports = {
  configured,
  listCalendarEvents,
  matchAccount,
  assertCalendarRange,
  icsUrls,
  eventsFromCalendarJson,
  DEFAULT_JSON_PATH,
  MAX_CALENDAR_RANGE_MS,
};
