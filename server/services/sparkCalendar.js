const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { extractMeetUrl } = require("./ics");

const DEFAULT_TIMEOUT_MS = 12000;

function sparkBin() {
  const fromEnv = String(process.env.SPARK_CLI_PATH || "").trim();
  if (fromEnv) return fromEnv;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    "/usr/local/bin/spark",
    "/opt/homebrew/bin/spark",
    home ? path.join(home, ".local", "bin", "spark") : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return "spark";
}

function sparkEnabled() {
  const raw = String(process.env.CALENDAR_SPARK || "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function sparkCalendarFilter() {
  return String(process.env.SPARK_CALENDAR || process.env.CALENDAR_SPARK_IN || "").trim();
}

function ymdLocal(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLooseDate(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return direct;
  // "2026-09-18 08:30" / "18/09/2026 08:30" / "Sep 18, 2026 8:30 AM"
  const normalized = text
    .replace(/\bat\b/gi, " ")
    .replace(/(\d)(am|pm)\b/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const again = Date.parse(normalized);
  return Number.isFinite(again) ? again : NaN;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] != null && String(obj[key]).trim() !== "") return obj[key];
  }
  return "";
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(pick(raw, ["title", "Title", "summary", "Summary", "name", "Name"]) || "").trim();
  const startRaw = pick(raw, ["start", "Start", "starts", "Starts", "startAt", "start_at", "begin", "Begin"]);
  const endRaw = pick(raw, ["end", "End", "ends", "Ends", "endAt", "end_at", "finish", "Finish"]);
  let startMs = parseLooseDate(startRaw);
  let endMs = parseLooseDate(endRaw);
  if (!Number.isFinite(startMs) && raw.date) {
    const day = String(raw.date).trim();
    startMs = parseLooseDate(`${day} ${raw.startTime || raw.StartTime || "00:00"}`);
    endMs = parseLooseDate(`${day} ${raw.endTime || raw.EndTime || raw.startTime || "00:00"}`);
  }
  if (!Number.isFinite(startMs)) return null;
  if (!Number.isFinite(endMs) || endMs < startMs) endMs = startMs;
  const location = String(pick(raw, ["location", "Location", "where", "Where"]) || "").trim();
  const notes = String(
    pick(raw, ["description", "Description", "notes", "Notes", "body", "Body"]) || ""
  ).trim();
  const url = String(pick(raw, ["url", "Url", "URL", "link", "Link", "calendarLink", "calLink"]) || "").trim();
  const meet =
    String(
      pick(raw, [
        "meetUrl",
        "meet_url",
        "conference",
        "Conference",
        "videoConference",
        "video",
        "Video",
        "joinLink",
        "join",
        "Join",
      ]) || ""
    ).trim() || extractMeetUrl([url, location, notes].filter(Boolean).join("\n"));
  const calendar = String(
    pick(raw, ["calendar", "Calendar", "account", "Account", "in"]) || ""
  ).trim();
  const id = String(pick(raw, ["id", "ID", "Id", "uid", "UID"]) || "").trim();
  const allDay = Boolean(raw.allDay || raw.all_day || raw["All-day"] || raw["All Day"]);
  return {
    id: id || `spark:${startMs}:${title}`,
    title: title || "(No title)",
    startMs,
    endMs,
    allDay,
    location,
    notes,
    url,
    meetUrl: meet,
    calendar: calendar || "spark",
    accountHint: calendar,
  };
}

function recordsFromJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.events)) return parsed.events;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    /* not JSON */
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => l.startsWith("{") || l.startsWith("["))) {
    const out = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (Array.isArray(row)) out.push(...row);
        else out.push(row);
      } catch {
        return null;
      }
    }
    return out;
  }
  return null;
}

function recordsFromKeyValueBlocks(text) {
  const blocks = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const obj = {};
    let keyed = 0;
    for (const line of lines) {
      const m = line.match(/^([A-Za-z][A-Za-z0-9 _/-]*?)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      obj[key] = m[2].trim();
      keyed += 1;
    }
    if (keyed >= 2 && (obj.Title || obj.title || obj.Summary || obj.Start || obj.start)) {
      out.push(obj);
    }
  }
  return out;
}

function splitTableRow(line) {
  const text = String(line || "").trim();
  if (!text) return [];
  if (text.includes("|")) {
    return text
      .split("|")
      .map((c) => c.trim())
      .filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
  }
  if (text.includes("\t")) {
    return text.split("\t").map((c) => c.trim());
  }
  // 2+ spaces as column separator
  return text.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
}

function recordsFromTable(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  let headerIdx = lines.findIndex((l) => /title/i.test(l) && /start/i.test(l));
  if (headerIdx < 0) headerIdx = lines.findIndex((l) => /^id\b/i.test(l.trim()) && /title/i.test(l));
  if (headerIdx < 0) return [];
  const headers = splitTableRow(lines[headerIdx]).map((h) => h.toLowerCase());
  if (headers.length < 2) return [];
  const out = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (/^[-+|=\s]+$/.test(line)) continue;
    const cells = splitTableRow(line);
    if (cells.length < 2) continue;
    const obj = {};
    for (let i = 0; i < headers.length && i < cells.length; i += 1) {
      obj[headers[i]] = cells[i];
    }
    out.push(obj);
  }
  return out;
}

const SPARK_LISTING_KEYS = new Set([
  "id",
  "calendar",
  "meeting",
  "location",
  "alerts",
  "going",
  "attendees",
  "notes",
  "url",
  "link",
]);

const SPARK_TIME_RE = /^(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s*$/;
// Spark day banners look like: "── Monday, Sep 21, 2026 ──────". Avoid matching
// note separators that are only dashes (those hang a naive .+? day regex).
const SPARK_DAY_RE =
  /^[─–—-]{2,}\s*([A-Za-z]{3,9},\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\s*[─–—-]{2,}\s*$/;
const SPARK_KEY_RE = /^([A-Za-z][A-Za-z0-9 _/-]*?)\s*:\s*(.*)$/;

function looksLikeSparkListing(text) {
  const sample = String(text || "").slice(0, 4000);
  if (/Calendar Events\b/i.test(sample)) return true;
  return sample.split("\n").some((line) => SPARK_DAY_RE.test(line.trim()));
}

function parseSparkDayLabel(label) {
  const text = String(label || "")
    .replace(/\s+/g, " ")
    .trim();
  // "Monday, Sep 21, 2026" / "Sep 21, 2026"
  const cleaned = text.replace(/^[A-Za-z]+,\s*/, "");
  const ms = Date.parse(cleaned);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    label: cleaned,
  };
}

function sparkLocalMs(day, hm) {
  if (!day) return NaN;
  const m = String(hm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const dt = new Date(day.y, day.m - 1, day.d, Number(m[1]), Number(m[2]), 0, 0);
  return dt.getTime();
}

/**
 * Parse Spark Desktop CLI `spark events` listing:
 *
 *   ── Monday, Sep 21, 2026 ──
 *     Title here
 *     ID: ...
 *     09:45 – 10:30
 *     Calendar: user@example.com
 *     Meeting: https://...
 */
function recordsFromSparkListing(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let day = null;
  let current = null;
  let pendingTitle = null;
  let inNotes = false;

  const flush = () => {
    if (current?.title) out.push(current);
    current = null;
    inNotes = false;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const indent = rawLine.length - rawLine.replace(/^ */, "").length;
    if (!trimmed) {
      // Blank line ends a Notes block so the next title is not swallowed.
      inNotes = false;
      continue;
    }
    if (/^Calendar Events\b/i.test(trimmed) || /^\d+\s+event\(s\)\s*$/i.test(trimmed)) {
      continue;
    }

    const dayMatch = trimmed.match(SPARK_DAY_RE);
    if (dayMatch) {
      flush();
      pendingTitle = null;
      day = parseSparkDayLabel(dayMatch[1]);
      continue;
    }

    // Notes body is indented deeper than event fields; leaving that indent ends notes.
    if (inNotes && current && indent >= 4) {
      current.notes = current.notes ? `${current.notes}\n${trimmed}` : trimmed;
      continue;
    }
    if (inNotes && indent < 4) inNotes = false;

    const keyMatch = trimmed.match(SPARK_KEY_RE);
    if (keyMatch) {
      const key = keyMatch[1].trim().toLowerCase();
      const value = keyMatch[2].trim();
      if (key === "id") {
        flush();
        current = {
          title: pendingTitle || "(No title)",
          id: value,
          calendar: "",
          notes: "",
          location: "",
          meetUrl: "",
          url: "",
          allDay: false,
        };
        pendingTitle = null;
        inNotes = false;
        continue;
      }
      if (current && SPARK_LISTING_KEYS.has(key)) {
        inNotes = key === "notes";
        if (key === "calendar") current.calendar = value;
        else if (key === "meeting" || key === "url" || key === "link") {
          current.meetUrl = current.meetUrl || value;
          current.url = current.url || value;
        } else if (key === "location") {
          current.location = value;
          if (!current.meetUrl) current.meetUrl = extractMeetUrl(value) || "";
        } else if (key === "notes") current.notes = value;
        else if (key === "attendees") current.attendees = value;
        else if (key === "going") current.going = value;
        else if (key === "alerts") current.alerts = value;
        continue;
      }
      // e.g. "Kate / Tim - Weekly 1:1" looks like Key:value because of "1:1".
    }

    if (/^all day$/i.test(trimmed)) {
      if (!current || !day) continue;
      current.allDay = true;
      const ymd = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
      current.startMsHint = new Date(day.y, day.m - 1, day.d, 0, 0, 0, 0).getTime();
      current.endMsHint = new Date(day.y, day.m - 1, day.d, 23, 59, 59, 0).getTime();
      current.start = `${ymd}T00:00:00`;
      current.end = `${ymd}T23:59:59`;
      continue;
    }

    const timeMatch = trimmed.match(SPARK_TIME_RE);
    if (timeMatch) {
      if (!current || !day) continue;
      const startMs = sparkLocalMs(day, timeMatch[1]);
      const endMs = sparkLocalMs(day, timeMatch[2]);
      if (Number.isFinite(startMs)) current.startMsHint = startMs;
      if (Number.isFinite(endMs)) current.endMsHint = endMs;
      continue;
    }

    // Title line sits above `ID:`; remember it until ID arrives.
    pendingTitle = trimmed;
  }
  flush();
  return out;
}

/** Parse `spark events` stdout into internal calendar event records. */
function parseSparkEventsOutput(text) {
  const jsonRows = recordsFromJson(text);
  const listingRows = jsonRows || !looksLikeSparkListing(text) ? [] : recordsFromSparkListing(text);
  const kvRows = jsonRows || listingRows.length ? [] : recordsFromKeyValueBlocks(text);
  const tableRows = jsonRows || listingRows.length || kvRows.length ? [] : recordsFromTable(text);
  const source = jsonRows || (listingRows.length ? listingRows : kvRows.length ? kvRows : tableRows);
  const out = [];
  for (const row of source) {
    // Prefer explicit local ms from Spark listing when ISO round-trip would shift TZ.
    if (Number.isFinite(row?.startMsHint) && Number.isFinite(row?.endMsHint)) {
      const meet =
        String(row.meetUrl || "").trim() ||
        extractMeetUrl([row.url, row.location, row.notes].filter(Boolean).join("\n"));
      out.push({
        id: String(row.id || "").trim() || `spark:${row.startMsHint}:${row.title}`,
        title: String(row.title || "(No title)").trim(),
        startMs: row.startMsHint,
        endMs: row.endMsHint >= row.startMsHint ? row.endMsHint : row.startMsHint,
        allDay: Boolean(row.allDay),
        location: String(row.location || "").trim(),
        notes: String(row.notes || "").trim(),
        url: String(row.url || "").trim(),
        meetUrl: meet,
        calendar: String(row.calendar || "spark").trim() || "spark",
        accountHint: String(row.calendar || "").trim(),
      });
      continue;
    }
    const ev = normalizeRecord(row);
    if (ev) out.push(ev);
  }
  return out;
}

function filterWindow(events, fromMs, toMs) {
  return (events || []).filter((ev) => {
    if (!ev || !Number.isFinite(ev.startMs) || !Number.isFinite(ev.endMs)) return false;
    return ev.endMs > fromMs && ev.startMs < toMs;
  });
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function isUnavailableError(err, stderr, code) {
  const msg = `${err?.message || ""} ${stderr || ""}`.toLowerCase();
  if (err?.code === "ENOENT") return true;
  if (code === 127) return true;
  if (/not found|no such file|enoent/.test(msg)) return true;
  if (/not running|isn't running|is not running|failed to connect|cannot connect|connection refused|no spark|spark desktop|ipc/.test(msg)) {
    return true;
  }
  if (/spark cli is not|cli (is )?not (set up|installed|configured|enabled)/.test(msg)) return true;
  return false;
}

const MAX_SPARK_OUTPUT_BYTES = 2 * 1024 * 1024;
const SPARK_CACHE_TTL_MS = 45_000;
let sparkCache = { key: null, at: 0, result: null };

function runSpark(args, { bin = sparkBin(), timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(bin, args, { env: process.env });
    } catch (err) {
      resolve({ ok: false, unavailable: true, error: err.message || String(err), stdout: "", stderr: "" });
      return;
    }
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;
    let timedOut = false;
    let tooLarge = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const killChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      killChild();
      finish({
        ok: false,
        unavailable: true,
        error: `spark timed out after ${timeoutMs}ms`,
        stdout,
        stderr,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdoutBytes += d.length;
      if (stdoutBytes > MAX_SPARK_OUTPUT_BYTES) {
        tooLarge = true;
        killChild();
        finish({
          ok: false,
          unavailable: false,
          error: "spark output too large",
          stdout,
          stderr,
        });
        return;
      }
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      finish({
        ok: false,
        unavailable: isUnavailableError(err, stderr, null),
        error: err.message || String(err),
        stdout,
        stderr,
      });
    });
    child.on("close", (code, signal) => {
      if (timedOut || tooLarge) return;
      if (code === 0) {
        finish({ ok: true, unavailable: false, code, stdout, stderr, signal });
        return;
      }
      const errMsg = (stderr || stdout || `spark exited ${code}${signal ? `/${signal}` : ""}`).trim();
      finish({
        ok: false,
        unavailable: isUnavailableError(null, errMsg, code),
        error: errMsg.slice(0, 500),
        code,
        stdout,
        stderr,
        signal,
      });
    });
  });
}

/**
 * Load events from Spark Desktop via `spark events`.
 * @returns {{ available: boolean, events: object[], error?: string }}
 */
async function loadSparkEvents(fromMs, toMs, opts = {}) {
  if (!sparkEnabled()) {
    return { available: false, events: [], error: "Spark calendar disabled (CALENDAR_SPARK=0)" };
  }
  const start = ymdLocal(fromMs);
  // Spark treats --end as exclusive (00:00 of that calendar day). Our API window is
  // already [fromMs, toMs), so pass toMs's local YMD directly — do not subtract a day
  // or Spark returns "2026-09-21 00:00 – 2026-09-21 00:00" / no events.
  const end = ymdLocal(toMs);
  const args = ["events", "--start", start, "--end", end];
  const cal = sparkCalendarFilter();
  if (cal) args.push("--in", cal);

  const cacheKey = `${start}|${end}|${cal}`;
  const useCache = !opts.spawnFn && !opts.skipCache;
  if (
    useCache &&
    sparkCache.key === cacheKey &&
    sparkCache.result?.available &&
    Date.now() - sparkCache.at < SPARK_CACHE_TTL_MS
  ) {
    return { ...sparkCache.result, cached: true };
  }

  const result = await runSpark(args, opts);
  if (!result.ok) {
    if (useCache && sparkCache.key === cacheKey && sparkCache.result?.available) {
      return {
        ...sparkCache.result,
        cached: true,
        stale: true,
        error: result.error || "Spark events failed",
      };
    }
    return {
      available: false,
      events: [],
      error: result.error || "Spark events failed",
      unavailable: result.unavailable !== false,
    };
  }
  const stripped = stripAnsi(result.stdout || "");
  const parsed = filterWindow(parseSparkEventsOutput(stripped), fromMs, toMs);
  if (!parsed.length) {
    // Successful CLI call but nothing usable — dump raw for parser debugging, then fall back.
    try {
      const logDir = path.join(__dirname, "..", "..", "logs");
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.join(logDir, "spark-events-last.txt"), stripped.slice(0, 200_000), "utf8");
    } catch {
      /* ignore */
    }
    return {
      available: false,
      events: [],
      error: stripped.trim()
        ? "Spark returned no parseable calendar events"
        : "Spark returned no calendar events",
      raw: stripped,
      unavailable: false,
    };
  }
  const loaded = { available: true, events: parsed, raw: stripped };
  if (useCache) sparkCache = { key: cacheKey, at: Date.now(), result: loaded };
  return loaded;
}

module.exports = {
  sparkBin,
  sparkEnabled,
  parseSparkEventsOutput,
  loadSparkEvents,
  normalizeRecord,
  ymdLocal,
};
