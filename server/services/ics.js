/** Unfold and parse VEVENTs from an iCalendar document. */

const DAY_MS = 24 * 60 * 60 * 1000;
const BYDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unfold(ics) {
  return String(ics || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function unescape(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function splitLines(block) {
  return unfold(block)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
}

function parseLine(line) {
  const sep = line.indexOf(":");
  if (sep < 0) return null;
  const meta = line.slice(0, sep);
  const value = line.slice(sep + 1);
  const parts = meta.split(";");
  const name = parts[0].toUpperCase();
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name, params, value };
}

function zonedWallToUtcMs(y, mo, d, h, mi, s, timeZone) {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return utcGuess - (asIfUtc - utcGuess);
}

function parseDateValue(raw, params) {
  const value = String(raw || "").trim();
  const tzid = params.TZID;
  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const mo = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    return { ms: new Date(y, mo - 1, d).getTime(), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { ms: NaN, allDay: false };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  if (m[7] === "Z") {
    return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  }
  if (tzid) {
    return { ms: zonedWallToUtcMs(y, mo, d, h, mi, s, tzid), allDay: false };
  }
  return { ms: new Date(y, mo - 1, d, h, mi, s).getTime(), allDay: false };
}

function parseRRule(raw) {
  const out = { freq: "", interval: 1, until: null, count: null, byday: [] };
  for (const part of String(raw || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).toUpperCase();
    const v = part.slice(eq + 1);
    if (k === "FREQ") out.freq = v.toUpperCase();
    else if (k === "INTERVAL") out.interval = Math.max(1, Number(v) || 1);
    else if (k === "COUNT") out.count = Math.max(1, Number(v) || 1);
    else if (k === "UNTIL") {
      const parsed = parseDateValue(v, {});
      out.until = Number.isNaN(parsed.ms) ? null : parsed.ms;
    } else if (k === "BYDAY") {
      out.byday = v
        .split(",")
        .map((d) => BYDAY_MAP[d.replace(/^-?\d+/, "").toUpperCase()])
        .filter((n) => n != null);
    }
  }
  return out;
}

function localDayMs(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDaysLocal(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function extractMeetUrl(text) {
  const raw = String(text || "");
  const m = raw.match(
    /https?:\/\/(?:[a-z0-9-]+\.)*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)[^\s<>"']*/i
  );
  return m ? m[0].replace(/[).,;]+$/, "") : "";
}

function parseVEvent(block) {
  const props = {};
  for (const line of splitLines(block)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const prev = props[parsed.name];
    if (parsed.name === "EXDATE") {
      props.EXDATE = [...(prev || []), parsed];
    } else {
      props[parsed.name] = parsed;
    }
  }
  if (String(props.STATUS?.value || "").toUpperCase() === "CANCELLED") return null;
  const start = parseDateValue(props.DTSTART?.value, props.DTSTART?.params || {});
  if (Number.isNaN(start.ms)) return null;
  let end = props.DTEND
    ? parseDateValue(props.DTEND.value, props.DTEND.params || {})
    : { ms: start.ms + (start.allDay ? DAY_MS : 30 * 60 * 1000), allDay: start.allDay };
  if (Number.isNaN(end.ms)) end = { ms: start.ms + 30 * 60 * 1000, allDay: start.allDay };
  const title = unescape(props.SUMMARY?.value || "(No title)");
  const location = unescape(props.LOCATION?.value || "");
  const notes = unescape(props.DESCRIPTION?.value || "");
  const url = unescape(props.URL?.value || props["X-GOOGLE-CONFERENCE"]?.value || "");
  return {
    id: unescape(props.UID?.value || `${start.ms}:${title}`),
    title,
    startMs: start.ms,
    endMs: end.ms,
    allDay: start.allDay,
    location,
    notes,
    url,
    meetUrl: extractMeetUrl([url, location, notes].join("\n")),
    rrule: props.RRULE ? parseRRule(props.RRULE.value) : null,
    exdates: (props.EXDATE || [])
      .map((p) => parseDateValue(p.value.split(",")[0], p.params || {}).ms)
      .filter((ms) => !Number.isNaN(ms)),
  };
}

function eventOverlaps(ev, fromMs, toMs) {
  return ev.endMs > fromMs && ev.startMs < toMs;
}

function daysBetweenLocal(aMs, bMs) {
  return Math.round((localDayMs(bMs) - localDayMs(aMs)) / DAY_MS);
}

function instanceOnDay(ev, dayMs, duration) {
  const orig = new Date(ev.startMs);
  const inst = new Date(dayMs);
  inst.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
  const startMs = inst.getTime();
  return {
    ...ev,
    id: `${ev.id}:${startMs}`,
    startMs,
    endMs: startMs + duration,
    rrule: null,
    exdates: undefined,
  };
}

function expandEvent(ev, fromMs, toMs) {
  const duration = Math.max(0, ev.endMs - ev.startMs) || (ev.allDay ? DAY_MS : 0);
  if (!ev.rrule || !ev.rrule.freq) {
    return eventOverlaps(ev, fromMs, toMs) ? [{ ...ev, rrule: null, exdates: undefined }] : [];
  }
  const rule = ev.rrule;
  const ex = new Set((ev.exdates || []).map((ms) => localDayMs(ms)));
  const byday = rule.byday.length ? rule.byday : [new Date(ev.startMs).getDay()];
  const out = [];
  let occ = 0;
  let steps = 0;
  let day = localDayMs(ev.startMs);
  if (!rule.count && day < fromMs - 40 * DAY_MS) {
    day = localDayMs(fromMs - 40 * DAY_MS);
  }
  for (; day < toMs + DAY_MS && steps < 2500; day = addDaysLocal(day, 1), steps++) {
    if (rule.until != null && day > rule.until) break;
    const weekday = new Date(day).getDay();
    if (!byday.includes(weekday)) continue;
    if (rule.freq === "WEEKLY") {
      const weeks = Math.floor(daysBetweenLocal(ev.startMs, day) / 7);
      if (weeks < 0 || weeks % rule.interval !== 0) continue;
    } else if (rule.freq === "DAILY") {
      const days = daysBetweenLocal(ev.startMs, day);
      if (days < 0 || days % rule.interval !== 0) continue;
    } else if (rule.freq === "MONTHLY") {
      const orig = new Date(ev.startMs);
      const cur = new Date(day);
      if (cur.getDate() !== orig.getDate()) continue;
      const months = (cur.getFullYear() - orig.getFullYear()) * 12 + (cur.getMonth() - orig.getMonth());
      if (months < 0 || months % rule.interval !== 0) continue;
    } else {
      break;
    }
    occ += 1;
    if (rule.count && occ > rule.count) break;
    if (ex.has(day)) continue;
    const instance = instanceOnDay(ev, day, duration);
    if (instance.startMs < ev.startMs - 1000) continue;
    if (eventOverlaps(instance, fromMs, toMs)) out.push(instance);
  }
  return out;
}

function parseIcs(ics, fromMs, toMs) {
  const text = unfold(ics);
  const events = [];
  const re = /BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/g;
  let m;
  while ((m = re.exec(text))) {
    const parsed = parseVEvent(m[1]);
    if (!parsed) continue;
    events.push(...expandEvent(parsed, fromMs, toMs));
  }
  return events;
}

module.exports = {
  DAY_MS,
  extractMeetUrl,
  parseIcs,
  parseDateValue,
  zonedWallToUtcMs,
};
