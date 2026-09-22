/** Daily briefing helpers: meetings by account + To Do column tasks. */

import { displayAccountLabel } from "../helpers.js";

export const TODO_STAGE = "in_progress";

export function meetingAccountKey(hit) {
  if (hit?.account) return String(hit.account);
  const rel = String(hit?.rel_path || "");
  const first = rel.split("/").filter(Boolean)[0];
  return first || "";
}

export function meetingPocName(hit) {
  if (hit?.poc) return String(hit.poc);
  const parts = String(hit?.rel_path || "").split("/").filter(Boolean);
  return parts.length >= 2 ? parts[1] : "";
}

export function meetingYmd(hit) {
  const raw = String(hit?.started_at || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function meetingMs(hit) {
  const raw = hit?.started_at;
  if (raw == null || raw === "") return 0;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function isMeetingOnDay(hit, range) {
  const ymd = meetingYmd(hit);
  if (!ymd || !range) return false;
  return ymd >= range.startYmd && ymd <= range.endYmd;
}

export function formatMeetingStamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace("T", " ");
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMeetingTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function accountLabel(account, key) {
  return account?.label || account?.long || key || "Unaligned";
}

function sortByAccountLabel(a, b) {
  return accountLabel(a.account, a.key).localeCompare(accountLabel(b.account, b.key), undefined, {
    sensitivity: "base",
  });
}

export function compareMeetingsNewestFirst(a, b) {
  return meetingMs(b) - meetingMs(a) || (a?.rel_path || "").localeCompare(b?.rel_path || "");
}

export function sortMeetingsNewestFirst(meetings = []) {
  return [...(meetings || [])].sort(compareMeetingsNewestFirst);
}

export function formatMeetingDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMeetingDay(ymd) {
  if (!ymd || ymd === "unknown") return "Unknown date";
  const parsed = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

const SUMMARY_HEADING = /^(?:#{1,6}\s+)?(?:\*{1,2}|_{1,2})?\s*(summary|decisions?|follow[\s-]*ups?)\s*(?:\*{1,2}|_{1,2})?\s*$/i;
const SUMMARY_MAX = 900;

function clipSummary(text, max = SUMMARY_MAX) {
  const compact = String(text || "").trim();
  if (!compact) return "";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function notesWithoutExcerpt(notes) {
  const text = String(notes || "");
  const cut = text.search(/^## Transcript excerpt\s*$/im);
  return (cut >= 0 ? text.slice(0, cut) : text).trim();
}

/** Pull the Summary section from meeting notes; ignore transcript excerpts. */
export function extractNotesSummary(notes, { maxChars = SUMMARY_MAX } = {}) {
  const body = notesWithoutExcerpt(notes);
  if (!body) return "";
  const sections = [];
  let current = { kind: "notes", lines: [] };
  for (const line of body.split(/\r?\n/)) {
    const heading = SUMMARY_HEADING.exec(line.trim());
    if (heading) {
      sections.push(current);
      const key = heading[1].toLowerCase().replace(/[\s-]+/g, "");
      const kind = key.startsWith("summary")
        ? "summary"
        : key.startsWith("decision")
          ? "decisions"
          : "followups";
      current = { kind, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);
  const parsed = sections
    .map((section) => ({ kind: section.kind, body: section.lines.join("\n").trim() }))
    .filter((section) => section.body);
  const summary = parsed.find((section) => section.kind === "summary");
  if (summary) return clipSummary(summary.body, maxChars);
  const notesSection = parsed.find((section) => section.kind === "notes");
  return clipSummary(notesSection?.body || body, maxChars);
}

export function meetingCallSummary(hit, notes) {
  return extractNotesSummary(notes) || clipSummary(hit?.snippet || "", SUMMARY_MAX);
}

function clipTopic(text, maxChars = 88) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).replace(/\s+\S*$/, "").trimEnd()}…`;
}

/** First summary bullet as the catalog title; falls back to search `topic`. */
export function meetingTopic(hit, { maxChars = 88 } = {}) {
  const fromApi = String(hit?.topic || "").trim();
  if (fromApi) return clipTopic(fromApi, maxChars);
  const snippet = String(hit?.snippet || "").trim();
  if (!snippet) return "";
  const first = snippet
    .replace(/^[-*]\s+/, "")
    .split(/\s*(?:^|\s)\*\s+/)[0]
    .split(/(?<=[.!?])\s+/)[0]
    .replace(/^The attendees? are discussing (?:an? (?:issue|topic|problem) (?:with|of) )?/i, "")
    .trim();
  if (!first) return "";
  return clipTopic(first[0].toUpperCase() + first.slice(1), maxChars);
}

/** Metadata chips from notes (topic terms + decision/follow-up counts). */
export function meetingListLabels(hit) {
  if (!Array.isArray(hit?.labels)) return [];
  const seen = new Set();
  const labels = [];
  for (const raw of hit.labels) {
    const label = String(raw || "").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** Accounts (and unknown folders) that have at least one indexed meeting. */
export function accountsWithCalls(hits, accounts = [], ae = null) {
  return catalogMeetingsByAccount(hits, accounts).filter((group) => {
    if (!ae) return true;
    return group.account.ae === ae;
  });
}

/** Group every hit by account key, including folders that are not Fielder accounts. Newest first. */
export function catalogMeetingsByAccount(hits, accounts = []) {
  const byKey = new Map((accounts || []).map((a) => [a.key, a]));
  const buckets = new Map();
  for (const hit of hits || []) {
    const key = meetingAccountKey(hit) || "unaligned";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(hit);
  }
  return [...buckets.entries()]
    .map(([key, meetings]) => {
      const known = byKey.get(key);
      const label = displayAccountLabel(key, known);
      return {
        key,
        account: {
          ...(known || {}),
          key,
          label,
          long: known?.long || label,
        },
        meetings: sortMeetingsNewestFirst(meetings),
      };
    })
    .sort(
      (a, b) =>
        compareMeetingsNewestFirst(a.meetings[0], b.meetings[0]) || sortByAccountLabel(a, b)
    );
}

export function groupHitsByDay(meetings) {
  const buckets = new Map();
  for (const hit of meetings || []) {
    const ymd = meetingYmd(hit) || "unknown";
    if (!buckets.has(ymd)) buckets.set(ymd, []);
    buckets.get(ymd).push(hit);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b.localeCompare(a);
    })
    .map(([ymd, items]) => ({
      ymd,
      label: formatMeetingDay(ymd),
      meetings: sortMeetingsNewestFirst(items),
    }));
}

/** Group hits by Fielder account. Unknown keys land in `unaligned`. */
export function groupMeetingsByAccount(hits, accounts = []) {
  const byKey = new Map((accounts || []).map((a) => [a.key, a]));
  const buckets = new Map();
  const unaligned = [];

  for (const hit of hits || []) {
    const key = meetingAccountKey(hit);
    const account = key ? byKey.get(key) : null;
    if (!account) {
      unaligned.push(hit);
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(hit);
  }

  const groups = [...buckets.entries()]
    .map(([key, meetings]) => ({
      key,
      account: byKey.get(key),
      meetings: [...meetings].sort((a, b) => meetingMs(a) - meetingMs(b) || (a.rel_path || "").localeCompare(b.rel_path || "")),
    }))
    .sort(sortByAccountLabel);

  unaligned.sort((a, b) => meetingMs(a) - meetingMs(b) || (a.rel_path || "").localeCompare(b.rel_path || ""));

  return { groups, unaligned };
}

export function todoTasks(tasks = []) {
  return (tasks || []).filter((t) => t.stage === TODO_STAGE);
}

export function compareTodoTasks(a, b) {
  const ad = a.dueDate || "9999-99-99";
  const bd = b.dueDate || "9999-99-99";
  return (
    ad.localeCompare(bd) ||
    (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }) ||
    (a.id || 0) - (b.id || 0)
  );
}

export function groupTasksByAccount(tasks, accounts = []) {
  const byKey = new Map((accounts || []).map((a) => [a.key, a]));
  const buckets = new Map();
  const unaligned = [];

  for (const task of tasks || []) {
    const key = task.account || "";
    const account = key ? byKey.get(key) : null;
    if (!account) {
      unaligned.push(task);
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(task);
  }

  const groups = [...buckets.entries()]
    .map(([key, items]) => ({
      key,
      account: byKey.get(key),
      tasks: [...items].sort(compareTodoTasks),
    }))
    .sort(sortByAccountLabel);

  unaligned.sort(compareTodoTasks);
  return { groups, unaligned };
}

export function meetingsForDay(hits, range) {
  return (hits || [])
    .filter((hit) => isMeetingOnDay(hit, range))
    .sort((a, b) => meetingMs(a) - meetingMs(b) || (a.rel_path || "").localeCompare(b.rel_path || ""));
}

/** Default Daily agenda length: selected day + the following day (today + tomorrow). */
export const AGENDA_DAYS = 2;

/** Recorded meetings whose calendar day falls in the agenda window. */
export function meetingsInAgendaRange(hits, agendaRange) {
  if (!agendaRange) return [];
  const allowed = new Set(
    (agendaRange.days || [agendaRange.startYmd, agendaRange.nextYmd]).filter(
      (ymd) => ymd && ymd !== "unknown"
    )
  );
  return (hits || []).filter((hit) => allowed.has(meetingYmd(hit)));
}

function ymdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Selected local day 00:00 through +N calendar days (default today + tomorrow).
 * `days` lists each YMD in the window; `nextYmd` remains day+1 for labels.
 */
export function getAgendaRange(anchorDate = new Date(), dayCount = AGENDA_DAYS) {
  const n = Math.max(1, Number(dayCount) || AGENDA_DAYS);
  const start = new Date(anchorDate instanceof Date ? anchorDate : new Date(anchorDate));
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(ymdFromDate(d));
  }
  const end = new Date(start);
  end.setDate(end.getDate() + n);
  return {
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    startYmd: days[0],
    nextYmd: days[1] || days[0],
    endYmd: ymdFromDate(end),
    dayCount: n,
    days,
  };
}

export function eventYmd(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : ymdFromDate(d);
  }
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /T|Z|\+/.test(raw)) return ymdFromDate(parsed);
    return match[1];
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : ymdFromDate(parsed);
}

export function splitAgendaDays(events, range) {
  const ymds = range?.days?.length
    ? range.days
    : [range?.startYmd, range?.nextYmd].filter(Boolean);
  const byYmd = new Map(ymds.map((ymd) => [ymd, []]));
  for (const ev of events || []) {
    const ymd = eventYmd(ev.start || ev.startMs);
    const bucket = byYmd.get(ymd);
    if (bucket) bucket.push(ev);
  }
  const days = ymds.map((ymd) => ({ ymd, events: byYmd.get(ymd) || [] }));
  return {
    days,
    today: days[0]?.events || [],
    tomorrow: days[1]?.events || [],
  };
}

/** Best recorded notes hit for a calendar event (same account + local day, closest start). */
export function recordedHitForCalendarEvent(event, hits = []) {
  if (!event) return null;
  const ymd = eventYmd(event.start || event.startMs);
  const account = String(event.account || "");
  if (!ymd || !account) return null;
  const startMs = Number.isFinite(event.startMs) ? event.startMs : Date.parse(event.start);
  const candidates = (hits || []).filter(
    (hit) => meetingAccountKey(hit) === account && meetingYmd(hit) === ymd
  );
  if (!candidates.length) return null;
  if (!Number.isFinite(startMs)) return candidates[0];
  let best = candidates[0];
  let bestDelta = Math.abs(meetingMs(best) - startMs);
  for (const hit of candidates.slice(1)) {
    const delta = Math.abs(meetingMs(hit) - startMs);
    if (delta < bestDelta) {
      best = hit;
      bestDelta = delta;
    }
  }
  return best;
}

export function formatEventWhen(ev) {
  if (ev?.allDay) return "All day";
  const start = formatMeetingTime(ev?.start);
  const end = formatMeetingTime(ev?.end);
  if (start && end && start !== end) return `${start}–${end}`;
  return start || "";
}
