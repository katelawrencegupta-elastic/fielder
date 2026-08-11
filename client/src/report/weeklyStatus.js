/** Week = Monday 00:00:00.000 → Sunday 23:59:59.999 local time.
 *  Day  = calendar day 00:00:00.000 → 23:59:59.999 local time.
 */

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

function ensureSection(map, key, accountMap, accounts) {
  if (map[key]) return map[key];
  const acct = accountMap[key] || accounts.find((a) => a.key === key);
  map[key] = {
    accountKey: key,
    accountLabel: acct?.label || acct?.long || key,
    ae: acct?.ae || "",
    cards: [],
    commits: [],
    demos: [],
  };
  return map[key];
}

/**
 * Build weekly/daily report sections grouped by account.
 * Omits accounts with no matching items.
 * `week` may be a day or week range (same shape).
 */
export function buildWeeklyReport({
  tasks = [],
  pocs = [],
  commits = [],
  accounts = [],
  accountMap = {},
  stages = [],
  week,
  range,
}) {
  const period = range || week;
  const pocById = {};
  for (const p of pocs) pocById[p.id] = p;

  const sections = {};

  for (const t of tasks) {
    if (t.category === "demo_workshop") continue;
    if (t.stage === "archive") continue;

    const due = dateInRangeYmd(t.dueDate, period);
    const createdMs = toMs(t.createdAt);
    const updatedMs = toMs(t.updatedAt);
    const isNew = inRangeMs(createdMs, period);
    const isUpdated = !isNew && inRangeMs(updatedMs, period);
    const activity = isNew || isUpdated;
    if (!due && !activity) continue;

    const key = t.account || "other";
    const sec = ensureSection(sections, key, accountMap, accounts);
    sec.cards.push({
      id: t.id,
      title: t.title || "(untitled)",
      stage: t.stage,
      stageLabel: stageLabel(stages, t.stage),
      dueDate: t.dueDate || null,
      dueDateLabel: t.dueDate ? formatDay(t.dueDate) : null,
      flags: {
        due,
        isNew,
        isUpdated: isUpdated || (isNew && inRangeMs(updatedMs, period) && updatedMs !== createdMs),
        activity,
      },
    });
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
      stage: t.stage,
      stageLabel: stageLabel(stages, t.stage),
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
    s.cards.sort((a, b) => {
      const ad = a.dueDate || "9999";
      const bd = b.dueDate || "9999";
      return ad.localeCompare(bd) || a.title.localeCompare(b.title);
    });
    s.commits.sort((a, b) => (toMs(b.committedAt) || 0) - (toMs(a.committedAt) || 0));
    s.demos.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "") || a.title.localeCompare(b.title));
  }

  return keys.map((k) => sections[k]);
}

function cardFlagText(flags, granularity = "week") {
  const parts = [];
  if (flags.due) parts.push(granularity === "day" ? "due today" : "due this week");
  if (flags.isNew) parts.push("new");
  else if (flags.activity) parts.push("updated");
  return parts.join(", ");
}

export function reportToMarkdown(sections, week, options = {}) {
  const granularity = options.granularity || week?.granularity || "week";
  const title =
    granularity === "day"
      ? `# Daily status — ${week.label}`
      : `# Weekly status — ${week.label}`;
  const lines = [title, ""];

  if (!sections.length) {
    const empty =
      granularity === "day"
        ? "_No Kanban activity, POC commits, or demos/workshops for this day._"
        : "_No Kanban activity, POC commits, or demos/workshops for this week._";
    lines.push(empty, "");
    return lines.join("\n");
  }

  for (const sec of sections) {
    const ae = sec.ae ? ` (${sec.ae})` : "";
    lines.push(`## ${sec.accountLabel}${ae}`, "");

    if (sec.cards.length) {
      lines.push("### Kanban");
      for (const c of sec.cards) {
        const bits = [c.stageLabel];
        if (c.dueDateLabel) bits.push(`due ${c.dueDateLabel}`);
        const flags = cardFlagText(c.flags, granularity);
        if (flags) bits.push(flags);
        lines.push(`- **${c.title}** — ${bits.join(" · ")}`);
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
        lines.push(`- **${d.title}** — ${d.spanLabel}${d.stageLabel ? ` · ${d.stageLabel}` : ""}`);
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

/**
 * POC-scoped activity report from task_events + commits.
 * Day: one bucket. Week: Mon–Sun day buckets (empty days omitted from UI list but counted).
 */
export function buildPocActivityReport({
  poc,
  events = [],
  commits = [],
  stages = [],
  range,
}) {
  const pocId = poc?.id;
  const filteredEvents = events.filter((e) => {
    if (pocId != null && e.pocId != null && Number(e.pocId) !== Number(pocId)) return false;
    return inRangeMs(toMs(e.createdAt), range);
  });
  const filteredCommits = commits
    .filter((c) => Number(c.pocId) === Number(pocId) && inRangeMs(toMs(c.committedAt), range))
    .map((c) => mapCommit(c, poc))
    .sort((a, b) => (toMs(b.committedAt) || 0) - (toMs(a.committedAt) || 0));

  const enrich = (ev) => ({
    ...ev,
    line: formatEventLine(ev, stages),
    createdAtLabel: formatShortDate(new Date(toMs(ev.createdAt))),
  });

  if (range.granularity === "day") {
    const dayEvents = filteredEvents.map(enrich).sort((a, b) => (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0));
    return {
      pocId,
      pocTitle: poc?.title || poc?.folderName || `POC #${pocId}`,
      range,
      totals: {
        events: dayEvents.length,
        commits: filteredCommits.length,
      },
      days: [
        {
          range,
          label: range.label,
          events: dayEvents,
          commits: filteredCommits,
        },
      ],
    };
  }

  const buckets = dayBucketsForWeek(range).map((dayRange) => {
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

  return {
    pocId,
    pocTitle: poc?.title || poc?.folderName || `POC #${pocId}`,
    range,
    totals: {
      events: filteredEvents.length,
      commits: filteredCommits.length,
    },
    days: buckets.filter((d) => d.events.length || d.commits.length),
  };
}

export function pocReportToMarkdown(report) {
  const { pocTitle, range, totals, days } = report;
  const heading =
    range.granularity === "day"
      ? `# ${pocTitle} — Daily — ${range.label}`
      : `# ${pocTitle} — Week of ${range.label}`;

  const lines = [
    heading,
    "",
    `${totals.events} card update${totals.events === 1 ? "" : "s"} · ${totals.commits} commit${
      totals.commits === 1 ? "" : "s"
    }`,
    "",
  ];

  if (!days.length) {
    lines.push("_No card updates or commits in this period._", "");
    return lines.join("\n");
  }

  for (const day of days) {
    if (range.granularity === "week") {
      lines.push(`## ${day.label}`, "");
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

    if (!day.events.length && !day.commits.length) {
      lines.push("—", "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
