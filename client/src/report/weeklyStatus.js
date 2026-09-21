/** Week = Monday 00:00:00.000 → Sunday 23:59:59.999 local time.
 *  Day  = calendar day 00:00:00.000 → 23:59:59.999 local time.
 */

import { dueDateStatus, normalizeWorkstream, workstreamLabel } from "../helpers.js";

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Monday of the week containing `anchor`. */
function mondayOf(anchor) {
  const d = startOfDay(anchor instanceof Date ? anchor : new Date(anchor));
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function formatShortDate(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekRange(anchorDate = new Date()) {
  const start = mondayOf(anchorDate);
  const end = endOfDay(new Date(start));
  end.setDate(start.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  let label;
  if (sameMonth) {
    label = `${formatShortDate(start)}–${end.getDate()}, ${end.getFullYear()}`;
  } else if (sameYear) {
    label = `${formatShortDate(start)} – ${formatShortDate(end)}, ${end.getFullYear()}`;
  } else {
    label = `${formatShortDate(start)}, ${start.getFullYear()} – ${formatShortDate(end)}, ${end.getFullYear()}`;
  }

  return {
    granularity: "week",
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    startYmd: ymd(start),
    endYmd: ymd(end),
    label,
  };
}

export function shiftWeek(week, deltaWeeks) {
  const d = new Date(week.start);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return getWeekRange(d);
}

export function getDayRange(anchorDate = new Date()) {
  const start = startOfDay(anchorDate instanceof Date ? anchorDate : new Date(anchorDate));
  const end = endOfDay(start);
  return {
    granularity: "day",
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    startYmd: ymd(start),
    endYmd: ymd(end),
    label: formatLongDate(start),
  };
}

export function shiftDay(range, deltaDays) {
  const d = new Date(range.start);
  d.setDate(d.getDate() + deltaDays);
  return getDayRange(d);
}

/** Shift a range by one unit of its granularity. */
export function shiftRange(range, delta) {
  if (range.granularity === "day") return shiftDay(range, delta);
  return shiftWeek(range, delta);
}

function toMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const n = Number(value);
  if (!Number.isNaN(n) && String(value).trim() !== "" && /^\d+$/.test(String(value).trim())) {
    return n;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function inRangeMs(ms, range) {
  return ms != null && ms >= range.startMs && ms <= range.endMs;
}

function dateInRangeYmd(ymdStr, range) {
  if (!ymdStr) return false;
  return ymdStr >= range.startYmd && ymdStr <= range.endYmd;
}

function demoOverlapsRange(task, range) {
  const start = task.startDate || task.dueDate;
  const end = task.dueDate || task.startDate;
  if (!start && !end) return false;
  const a = start || end;
  const b = end || start;
  return a <= range.endYmd && b >= range.startYmd;
}

function formatDay(ymdStr) {
  if (!ymdStr) return "";
  const d = new Date(`${ymdStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymdStr;
  return formatShortDate(d);
}

function stageLabel(stages, key) {
  return stages.find((s) => s.key === key)?.label || key || "—";
}

function enrichCard(t, stages, pocById, period) {
  const due = dateInRangeYmd(t.dueDate, period);
  const createdMs = toMs(t.createdAt);
  const updatedMs = toMs(t.updatedAt);
  const isNew = inRangeMs(createdMs, period);
  const isUpdated = !isNew && inRangeMs(updatedMs, period);
  const overdue = dueDateStatus(t.dueDate) === "overdue" && t.stage !== "done" && t.stage !== "archive";
  const poc = t.pocId != null ? pocById[t.pocId] : null;
  const progress = t.subtaskProgress;
  return {
    id: t.id,
    title: t.title || "(untitled)",
    description: (t.description || "").trim() || null,
    stage: t.stage,
    stageLabel: stageLabel(stages, t.stage),
    account: t.account || "other",
    workstream: normalizeWorkstream(t.workstream),
    workstreamLabel: workstreamLabel(normalizeWorkstream(t.workstream)),
    labels: Array.isArray(t.labels) ? t.labels : [],
    pocId: t.pocId ?? null,
    pocTitle: poc ? poc.title || poc.folderName || `POC #${poc.id}` : null,
    startDate: t.startDate || null,
    startDateLabel: t.startDate ? formatDay(t.startDate) : null,
    dueDate: t.dueDate || null,
    dueDateLabel: t.dueDate ? formatDay(t.dueDate) : null,
    subtasksDone: progress?.done ?? 0,
    subtasksTotal: progress?.total ?? 0,
    flags: {
      due,
      isNew,
      isUpdated: isUpdated || (isNew && inRangeMs(updatedMs, period) && updatedMs !== createdMs),
      activity: isNew || isUpdated,
      overdue,
      blocked: t.stage === "blocked",
    },
  };
}

function ensureSection(map, key, accountMap, accounts) {
  if (map[key]) return map[key];
  const acct = accountMap[key] || accounts.find((a) => a.key === key);
  map[key] = {
    accountKey: key,
    accountLabel: acct?.label || acct?.long || key,
    ae: acct?.ae || "",
    cards: [],
    events: [],
    commits: [],
    demos: [],
    overdue: [],
    blocked: [],
  };
  return map[key];
}

/**
 * Build weekly/daily report sections grouped by account.
 * Omits accounts with no matching items.
 */
export function buildWeeklyReport({
  tasks = [],
  pocs = [],
  commits = [],
  events = [],
  accounts = [],
  accountMap = {},
  stages = [],
  week,
  range,
}) {
  const period = range || week;
  const pocById = {};
  for (const p of pocs) pocById[p.id] = p;
  const taskById = {};
  for (const t of tasks) taskById[t.id] = t;

  const sections = {};

  for (const t of tasks) {
    if (t.category === "demo_workshop") continue;
    if (t.stage === "archive") continue;

    const card = enrichCard(t, stages, pocById, period);
    const key = t.account || "other";

    if (card.flags.due || card.flags.activity) {
      ensureSection(sections, key, accountMap, accounts).cards.push(card);
    }
    if (card.flags.overdue) {
      ensureSection(sections, key, accountMap, accounts).overdue.push(card);
    }
    if (card.flags.blocked) {
      ensureSection(sections, key, accountMap, accounts).blocked.push(card);
    }
  }

  for (const t of tasks) {
    if (t.category !== "demo_workshop") continue;
    if (t.stage === "archive") continue;
    if (!demoOverlapsRange(t, period)) continue;

    const key = t.account || "other";
    const sec = ensureSection(sections, key, accountMap, accounts);
    const start = t.startDate || t.dueDate;
    const end = t.dueDate || t.startDate;
    let spanLabel = formatDay(start);
    if (start && end && start !== end) {
      spanLabel = `${formatDay(start)} – ${formatDay(end)}`;
    }
    sec.demos.push({
      id: t.id,
      title: t.title || "(untitled)",
      description: (t.description || "").trim() || null,
      stage: t.stage,
      stageLabel: stageLabel(stages, t.stage),
      account: t.account || "other",
      labels: Array.isArray(t.labels) ? t.labels : [],
      startDate: start || null,
      dueDate: end || null,
      spanLabel,
    });
  }

  for (const c of commits) {
    const ms = toMs(c.committedAt);
    if (!inRangeMs(ms, period)) continue;
    const poc = pocById[c.pocId];
    const key = poc?.account || "other";
    const sec = ensureSection(sections, key, accountMap, accounts);
    const when = ms != null ? formatShortDate(new Date(ms)) : "";
    sec.commits.push({
      sha: c.sha,
      shortSha: (c.sha || "").slice(0, 7),
      message: (c.message || "").split("\n")[0] || "(no message)",
      author: c.author || "",
      url: c.url || null,
      committedAt: c.committedAt,
      committedAtLabel: when,
      pocId: c.pocId,
      pocTitle: poc?.title || poc?.folderName || `POC #${c.pocId}`,
    });
  }

  for (const e of events) {
    if (!inRangeMs(toMs(e.createdAt), period)) continue;
    const task = e.taskId != null ? taskById[e.taskId] : null;
    const poc = e.pocId != null ? pocById[e.pocId] : null;
    const key = task?.account || poc?.account || "other";
    const sec = ensureSection(sections, key, accountMap, accounts);
    sec.events.push({
      ...e,
      line: formatEventLine(e, stages),
      createdAtLabel: formatShortDate(new Date(toMs(e.createdAt))),
      pocTitle: poc ? poc.title || poc.folderName : null,
    });
  }

  const orderKeys = accounts.map((a) => a.key);
  const keys = Object.keys(sections).sort((a, b) => {
    const ia = orderKeys.indexOf(a);
    const ib = orderKeys.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    const la = sections[a].accountLabel;
    const lb = sections[b].accountLabel;
    return la.localeCompare(lb);
  });

  for (const key of keys) {
    const s = sections[key];
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    s.cards.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || byTitle(a, b));
    s.overdue.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "") || byTitle(a, b));
    s.blocked.sort(byTitle);
    s.commits.sort((a, b) => (toMs(b.committedAt) || 0) - (toMs(a.committedAt) || 0));
    s.demos.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "") || byTitle(a, b));
    s.events.sort((a, b) => (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0));
  }

  return keys.map((k) => sections[k]);
}

function cardFlagText(flags, granularity = "week") {
  const parts = [];
  if (flags.overdue) parts.push("overdue");
  if (flags.blocked) parts.push("blocked");
  if (flags.due) parts.push(granularity === "day" ? "due today" : "due this week");
  if (flags.isNew) parts.push("new");
  else if (flags.activity) parts.push("updated");
  return parts.join(", ");
}

function appendDescription(lines, description) {
  if (!description) return;
  for (const line of description.split("\n")) {
    lines.push(line ? `  ${line}` : "  ");
  }
}

function cardDetailBits(c, granularity) {
  const bits = [c.stageLabel];
  if (c.workstreamLabel && c.workstream !== "misc") bits.push(c.workstreamLabel);
  if (c.pocTitle) bits.push(c.pocTitle);
  if (c.startDateLabel) bits.push(`start ${c.startDateLabel}`);
  if (c.dueDateLabel) bits.push(`due ${c.dueDateLabel}`);
  if (c.subtasksTotal > 0) bits.push(`subtasks ${c.subtasksDone}/${c.subtasksTotal}`);
  if (c.labels?.length) bits.push(`labels: ${c.labels.join(", ")}`);
  const flags = cardFlagText(c.flags, granularity);
  if (flags) bits.push(flags);
  return bits;
}

export function reportToMarkdown(sections, week, options = {}) {
  const granularity = options.granularity || week?.granularity || "week";
  const title =
    granularity === "day"
      ? `# Daily status — ${week.label}`
      : `# Weekly status — ${week.label}`;
  const lines = [title];
  if (options.ae) lines.push(`_Account exec: ${options.ae}_`);
  lines.push("");

  if (!sections.length) {
    lines.push("_No activity for this period._", "");
    return lines.join("\n");
  }

  for (const sec of sections) {
    const ae = sec.ae ? ` (${sec.ae})` : "";
    lines.push(`## ${sec.accountLabel}${ae}`, "");

    if (sec.overdue?.length) {
      lines.push("### Overdue");
      for (const c of sec.overdue) {
        lines.push(`- **${c.title}** — ${cardDetailBits(c, granularity).join(" · ")}`);
        appendDescription(lines, c.description);
      }
      lines.push("");
    }

    if (sec.blocked?.length) {
      lines.push("### Blocked");
      for (const c of sec.blocked) {
        lines.push(`- **${c.title}** — ${cardDetailBits(c, granularity).join(" · ")}`);
        appendDescription(lines, c.description);
      }
      lines.push("");
    }

    if (sec.cards.length) {
      lines.push("### Kanban activity");
      for (const c of sec.cards) {
        lines.push(`- **${c.title}** — ${cardDetailBits(c, granularity).join(" · ")}`);
        appendDescription(lines, c.description);
      }
      lines.push("");
    }

    if (sec.events?.length) {
      lines.push("### Card updates");
      for (const e of sec.events) {
        const when = e.createdAtLabel ? ` · ${e.createdAtLabel}` : "";
        const poc = e.pocTitle ? ` (${e.pocTitle})` : "";
        lines.push(`- ${e.line}${poc}${when}`);
      }
      lines.push("");
    }

    if (sec.commits.length) {
      lines.push("### POC commits");
      for (const c of sec.commits) {
        const author = c.author ? ` (${c.author})` : "";
        const when = c.committedAtLabel ? ` · ${c.committedAtLabel}` : "";
        lines.push(`- \`${c.shortSha}\` ${c.pocTitle} — ${c.message}${author}${when}`);
      }
      lines.push("");
    }

    if (sec.demos.length) {
      lines.push("### Demos / workshops");
      for (const d of sec.demos) {
        const labels = d.labels?.length ? ` · ${d.labels.join(", ")}` : "";
        lines.push(`- **${d.title}** — ${d.spanLabel}${d.stageLabel ? ` · ${d.stageLabel}` : ""}${labels}`);
        appendDescription(lines, d.description);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function quoteTitle(title) {
  const t = (title || "(untitled)").replace(/"/g, "'");
  return `"${t}"`;
}

/** Human-readable line for a task_events row. */
export function formatEventLine(event, stages = []) {
  const title = quoteTitle(event.title);
  const type = event.eventType;
  switch (type) {
    case "created":
      return `Created ${title} in ${stageLabel(stages, event.newValue || "backlog")}`;
    case "deleted":
      return `Deleted ${title}`;
    case "title_changed":
      return `Renamed ${quoteTitle(event.oldValue)} → ${quoteTitle(event.newValue)}`;
    case "stage_changed":
      return `Moved ${title} ${stageLabel(stages, event.oldValue)} → ${stageLabel(stages, event.newValue)}`;
    case "due_date_changed":
      if (!event.newValue) return `Cleared due date on ${title}`;
      if (!event.oldValue) return `Set due date on ${title} to ${event.newValue}`;
      return `Changed due date on ${title}: ${event.oldValue} → ${event.newValue}`;
    case "start_date_changed":
      if (!event.newValue) return `Cleared start date on ${title}`;
      if (!event.oldValue) return `Set start date on ${title} to ${event.newValue}`;
      return `Changed start date on ${title}: ${event.oldValue} → ${event.newValue}`;
    case "account_changed":
      return `Changed account on ${title}: ${event.oldValue || "—"} → ${event.newValue || "—"}`;
    case "poc_changed":
      return `Changed POC link on ${title}`;
    case "workstream_changed":
      return `Moved ${title} ${workstreamLabel(event.oldValue)} → ${workstreamLabel(event.newValue)}`;
    case "category_changed":
      return `Changed category on ${title}: ${event.oldValue || "—"} → ${event.newValue || "—"}`;
    case "description_changed":
      return `Updated description on ${title}`;
    case "subtask_added":
      return `Added subtask on ${title}: ${event.newValue || ""}`;
    case "subtask_updated":
      return `Updated subtask on ${title}: ${event.newValue || event.oldValue || ""}`;
    case "subtask_removed":
      return `Removed subtask on ${title}: ${event.oldValue || ""}`;
    case "label_added":
      return `Added label on ${title}: ${event.newValue || ""}`;
    case "label_removed":
      return `Removed label on ${title}: ${event.oldValue || ""}`;
    default:
      return `${type} ${title}`;
  }
}

function mapCommit(c, poc) {
  const ms = toMs(c.committedAt);
  const when = ms != null ? formatShortDate(new Date(ms)) : "";
  return {
    sha: c.sha,
    shortSha: (c.sha || "").slice(0, 7),
    message: (c.message || "").split("\n")[0] || "(no message)",
    author: c.author || "",
    url: c.url || null,
    committedAt: c.committedAt,
    committedAtLabel: when,
    pocId: c.pocId,
    pocTitle: poc?.title || poc?.folderName || `POC #${c.pocId}`,
  };
}

function dayBucketsForWeek(range) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(range.start);
    d.setDate(range.start.getDate() + i);
    days.push(getDayRange(d));
  }
  return days;
}

function snapshotCard(t) {
  return {
    id: t.id,
    title: t.title || "(untitled)",
    description: (t.description || "").trim() || null,
    workstreamLabel: workstreamLabel(normalizeWorkstream(t.workstream)),
    dueDateLabel: t.dueDate ? formatDay(t.dueDate) : null,
    labels: t.labels || [],
    subtasksDone: t.subtaskProgress?.done ?? 0,
    subtasksTotal: t.subtaskProgress?.total ?? 0,
    overdue: dueDateStatus(t.dueDate) === "overdue",
  };
}

function buildBoardSnapshot(pocTasks, stages) {
  const active = pocTasks.filter((t) => t.stage !== "archive" && t.category !== "demo_workshop");
  const byStage = {};
  for (const t of active) {
    const key = t.stage || "backlog";
    (byStage[key] ||= []).push(t);
  }
  const stageOrder = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const columns = [];
  for (const s of stageOrder) {
    const list = byStage[s.key];
    if (!list?.length) continue;
    columns.push({
      key: s.key,
      label: s.label || s.key,
      count: list.length,
      cards: list
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id)
        .map(snapshotCard),
    });
  }
  // orphan stages not in list
  for (const [key, list] of Object.entries(byStage)) {
    if (columns.some((c) => c.key === key)) continue;
    columns.push({
      key,
      label: key,
      count: list.length,
      cards: list.map(snapshotCard),
    });
  }
  return {
    total: active.length,
    archived: pocTasks.filter((t) => t.stage === "archive").length,
    columns,
  };
}

/**
 * POC-scoped activity report from task_events + commits + board snapshot.
 */
export function buildPocActivityReport({
  poc,
  tasks = [],
  events = [],
  commits = [],
  stages = [],
  range,
}) {
  const pocId = poc?.id;
  const pocTasks = tasks.filter((t) => Number(t.pocId) === Number(pocId));
  const pocById = { [pocId]: poc };

  const filteredEvents = events.filter((e) => {
    if (pocId != null && e.pocId != null && Number(e.pocId) !== Number(pocId)) return false;
    return inRangeMs(toMs(e.createdAt), range);
  });
  const filteredCommits = commits
    .filter((c) => Number(c.pocId) === Number(pocId) && inRangeMs(toMs(c.committedAt), range))
    .map((c) => mapCommit(c, poc))
    .sort((a, b) => (toMs(b.committedAt) || 0) - (toMs(a.committedAt) || 0));

  const periodCards = pocTasks
    .filter((t) => t.category !== "demo_workshop" && t.stage !== "archive")
    .map((t) => enrichCard(t, stages, pocById, range))
    .filter((c) => c.flags.due || c.flags.activity);

  const overdue = pocTasks
    .filter((t) => t.stage !== "archive" && t.category !== "demo_workshop")
    .map((t) => enrichCard(t, stages, pocById, range))
    .filter((c) => c.flags.overdue);

  const enrich = (ev) => ({
    ...ev,
    line: formatEventLine(ev, stages),
    createdAtLabel: formatShortDate(new Date(toMs(ev.createdAt))),
  });

  const meta = {
    status: poc?.status || null,
    account: poc?.account || null,
    owner: poc?.owner || null,
    startDate: poc?.startDate || null,
    targetDemoDate: poc?.targetDemoDate || null,
    notesUrl: poc?.notesUrl || null,
    repoUrl: poc?.repoUrl || null,
    commitCount: poc?.commitCount ?? null,
  };

  const board = buildBoardSnapshot(pocTasks, stages);

  const packDays = (buckets) =>
    buckets.map((dayRange) => {
      const dayEvents = filteredEvents
        .filter((e) => inRangeMs(toMs(e.createdAt), dayRange))
        .map(enrich)
        .sort((a, b) => (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0));
      const dayCommits = filteredCommits
        .filter((c) => inRangeMs(toMs(c.committedAt), dayRange))
        .sort((a, b) => (toMs(b.committedAt) || 0) - (toMs(a.committedAt) || 0));
      return {
        range: dayRange,
        label: dayRange.label,
        events: dayEvents,
        commits: dayCommits,
      };
    });

  const days =
    range.granularity === "day"
      ? [
          {
            range,
            label: range.label,
            events: filteredEvents.map(enrich).sort((a, b) => (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0)),
            commits: filteredCommits,
          },
        ]
      : packDays(dayBucketsForWeek(range)).filter((d) => d.events.length || d.commits.length);

  return {
    pocId,
    pocTitle: poc?.title || poc?.folderName || `POC #${pocId}`,
    meta,
    board,
    periodCards,
    overdue,
    range,
    totals: {
      events: filteredEvents.length,
      commits: filteredCommits.length,
      cards: periodCards.length,
      overdue: overdue.length,
      board: board.total,
    },
    days,
  };
}

export function pocReportToMarkdown(report) {
  const { pocTitle, range, totals, days, meta, board, periodCards, overdue } = report;
  const heading =
    range.granularity === "day"
      ? `# ${pocTitle} — Daily — ${range.label}`
      : `# ${pocTitle} — Week of ${range.label}`;

  const lines = [heading, ""];

  const metaBits = [];
  if (meta?.status) metaBits.push(`status ${meta.status.replace(/_/g, " ")}`);
  if (meta?.account) metaBits.push(`account ${meta.account}`);
  if (meta?.owner) metaBits.push(`owner ${meta.owner}`);
  if (meta?.startDate || meta?.targetDemoDate) {
    metaBits.push(`${meta.startDate || "—"} → ${meta.targetDemoDate || "—"}`);
  }
  if (meta?.notesUrl) metaBits.push(`notes ${meta.notesUrl}`);
  if (meta?.repoUrl) metaBits.push(`repo ${meta.repoUrl}`);
  if (metaBits.length) {
    lines.push(metaBits.join(" · "), "");
  }

  lines.push(
    `${totals.events} card update${totals.events === 1 ? "" : "s"} · ${totals.commits} commit${
      totals.commits === 1 ? "" : "s"
    } · ${totals.cards} touched card${totals.cards === 1 ? "" : "s"} · ${totals.overdue} overdue · ${
      totals.board
    } on board`,
    ""
  );

  if (overdue?.length) {
    lines.push("## Overdue", "");
    for (const c of overdue) {
      lines.push(`- **${c.title}** — ${cardDetailBits(c, range.granularity).join(" · ")}`);
      appendDescription(lines, c.description);
    }
    lines.push("");
  }

  if (periodCards?.length) {
    lines.push("## Touched / due in period", "");
    for (const c of periodCards) {
      lines.push(`- **${c.title}** — ${cardDetailBits(c, range.granularity).join(" · ")}`);
      appendDescription(lines, c.description);
    }
    lines.push("");
  }

  if (days.length) {
    for (const day of days) {
      if (range.granularity === "week") {
        lines.push(`## ${day.label}`, "");
      } else {
        lines.push("## Activity", "");
      }

      if (day.events.length) {
        lines.push("### Card updates");
        for (const e of day.events) {
          lines.push(`- ${e.line}`);
        }
        lines.push("");
      }

      if (day.commits.length) {
        lines.push("### Commits");
        for (const c of day.commits) {
          const author = c.author ? ` (${c.author})` : "";
          const when = c.committedAtLabel ? ` · ${c.committedAtLabel}` : "";
          lines.push(`- \`${c.shortSha}\` ${c.message}${author}${when}`);
        }
        lines.push("");
      }
    }
  }

  if (board?.columns?.length) {
    lines.push("## Current board", "");
    lines.push(`${board.total} active · ${board.archived} archived`, "");
    for (const col of board.columns) {
      lines.push(`### ${col.label} (${col.count})`);
      for (const c of col.cards) {
        const bits = [];
        if (c.workstreamLabel) bits.push(c.workstreamLabel);
        if (c.dueDateLabel) bits.push(`due ${c.dueDateLabel}`);
        if (c.overdue) bits.push("overdue");
        if (c.subtasksTotal) bits.push(`subtasks ${c.subtasksDone}/${c.subtasksTotal}`);
        if (c.labels?.length) bits.push(c.labels.join(", "));
        lines.push(`- **${c.title}**${bits.length ? ` — ${bits.join(" · ")}` : ""}`);
        appendDescription(lines, c.description);
      }
      lines.push("");
    }
  }

  if (!days.length && !periodCards?.length && !overdue?.length && !board?.columns?.length) {
    lines.push("_No card updates, commits, or board cards for this POC._", "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
