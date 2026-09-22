import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import TaskCard from "../components/TaskCard.jsx";
import { AccountPill, MeetingLabels } from "../components/Pills.jsx";
import { getDayRange, shiftRange } from "../report/weeklyStatus.js";
import {
  formatEventWhen,
  formatMeetingStamp,
  formatMeetingTime,
  getAgendaRange,
  groupTasksByAccount,
  meetingAccountKey,
  meetingListLabels,
  meetingPocName,
  meetingTopic,
  meetingsInAgendaRange,
  recordedHitForCalendarEvent,
  splitAgendaDays,
  todoTasks,
} from "../report/dailySummary.js";

const CATALOG_K = 120;

function aeChipLabel(name) {
  return name.replace(" (Tim)", "").split(" ")[0];
}

function dayHeading(ymd, todayYmd, tomorrowYmd) {
  if (ymd === todayYmd) return "Today";
  if (ymd === tomorrowYmd) return "Tomorrow";
  const parsed = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function MeetingRow({ hit, selected, onOpen, showAccount = true, accountMap }) {
  const accountKey = meetingAccountKey(hit);
  const poc = meetingPocName(hit);
  const topic = meetingTopic(hit);
  const labels = meetingListLabels(hit);
  const bits = [formatMeetingStamp(hit.started_at), poc].filter(Boolean);

  return (
    <button
      type="button"
      className={`meeting-row daily-meeting-row${selected ? " is-active" : ""}`}
      title="Open meeting summary"
      onClick={() => onOpen?.(hit)}
    >
      <div className="daily-meeting-row-top">
        {showAccount ? (
          accountKey ? (
            <AccountPill akey={accountKey} accountMap={accountMap} />
          ) : (
            <span className="report-item-meta">Unaligned</span>
          )
        ) : null}
        <span className="meeting-row-meta">{bits.join(" · ")}</span>
      </div>
      {topic ? <div className="report-item-title">{topic}</div> : null}
      {labels.length ? <MeetingLabels labels={labels} /> : null}
      {!topic && hit.snippet ? <div className="meeting-row-snippet">{hit.snippet}</div> : null}
    </button>
  );
}

function CalendarEventRow({ event, selected, onOpen, accountMap, hasRecording = false }) {
  const start = event?.allDay ? "All day" : formatMeetingTime(event?.start);
  const end = event?.allDay ? "" : formatMeetingTime(event?.end);
  const showEnd = Boolean(end && start && end !== start);
  const location = String(event.location || "").trim();
  const showLocation = location && !/^https?:\/\//i.test(location);
  const timeLabel = showEnd ? `${start}–${end}` : start || "—";

  return (
    <div
      className={`daily-agenda-row${selected ? " is-active" : ""}${hasRecording ? " has-recording" : ""}`}
      role="button"
      tabIndex={0}
      title={
        [event.title || "(No title)", timeLabel, showLocation ? location : ""]
          .filter(Boolean)
          .join(" · ")
      }
      onClick={() => onOpen(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(event);
        }
      }}
    >
      <div className="daily-agenda-time" aria-label={timeLabel}>
        <span className="daily-agenda-time-start">{start || "—"}</span>
        {showEnd ? <span className="daily-agenda-time-end">{end}</span> : null}
      </div>
      <div className="daily-agenda-body">
        <div className="daily-agenda-title">{event.title || "(No title)"}</div>
        <div className="daily-agenda-meta">
          {event.account ? (
            <AccountPill akey={event.account} accountMap={accountMap} />
          ) : (
            <span className="daily-agenda-unaligned">Unaligned</span>
          )}
          {hasRecording ? <span className="daily-agenda-rec">Rec</span> : null}
        </div>
      </div>
      {event.meetUrl ? (
        <a
          className="daily-join-link"
          href={event.meetUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          Join
        </a>
      ) : null}
    </div>
  );
}

function AccountGroup({ account, accountMap, children, count }) {
  return (
    <section className="daily-account-group">
      <div className="daily-account-group-head">
        <AccountPill akey={account.key} accountMap={accountMap} />
        {account.ae ? <span className="report-account-ae">{account.ae}</span> : null}
        {count != null ? <span className="daily-count">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function DailySummaryView({
  tasks,
  pocs,
  accounts,
  accountMap,
  aes = [],
  aeColors = {},
  filters = {},
  onFiltersChange,
  dataEpoch = 0,
  onOpenTask,
  onOpenMeeting,
}) {
  const [range, setRange] = useState(() => getDayRange(new Date()));
  const aeFilter = filters.ae || null;
  const [status, setStatus] = useState("loading");
  const [hits, setHits] = useState([]);
  const [url, setUrl] = useState("http://127.0.0.1:8787/");
  const [selectedCalId, setSelectedCalId] = useState(null);
  const [calStatus, setCalStatus] = useState("loading");
  const [calEvents, setCalEvents] = useState([]);
  const [calConfigured, setCalConfigured] = useState(true);
  const [calError, setCalError] = useState("");

  const todayRange = getDayRange(new Date());
  const isToday = range.startYmd === todayRange.startYmd;
  // Selected day + the next day; rolls with the day navigator (and at midnight via effect below).
  const agendaRange = useMemo(() => getAgendaRange(range.start), [range.startYmd]);
  const realTomorrowYmd = useMemo(
    () => getAgendaRange(new Date()).nextYmd,
    [todayRange.startYmd]
  );

  // When the calendar date rolls, snap back to today so the window stays relative.
  useEffect(() => {
    setRange(getDayRange(new Date()));
  }, [todayRange.startYmd]);

  const visibleAccounts = useMemo(
    () => (aeFilter ? accounts.filter((a) => a.ae === aeFilter) : accounts),
    [accounts, aeFilter]
  );
  const visibleKeys = useMemo(
    () => new Set(visibleAccounts.map((a) => a.key)),
    [visibleAccounts]
  );

  const pocMap = useMemo(() => {
    const m = {};
    for (const p of pocs || []) m[p.id] = p;
    return m;
  }, [pocs]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHits([]);

    Promise.all([
      api.searchMeetings({ k: CATALOG_K }),
      api.getMeetingsHealth().catch(() => ({ unavailable: true })),
    ])
      .then(([catalog, health]) => {
        if (cancelled) return;
        setUrl(catalog.url || health.url || "http://127.0.0.1:8787/");
        if (catalog.unavailable) {
          setStatus("unavailable");
          return;
        }
        setHits(catalog.hits || []);
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [dataEpoch]);

  useEffect(() => {
    let cancelled = false;
    setCalStatus("loading");
    setCalError("");
    const ac = new AbortController();
    api
      .getCalendarEvents({
        from: agendaRange.start.toISOString(),
        to: agendaRange.end.toISOString(),
        signal: ac.signal,
      })
      .then((data) => {
        if (cancelled) return;
        setCalEvents(data.events || []);
        setCalConfigured(data.configured !== false || (data.events || []).length > 0);
        setCalStatus("ok");
      })
      .catch((err) => {
        if (cancelled || err.name === "AbortError") return;
        console.error(err);
        setCalError(err.message || "Could not load calendar");
        setCalStatus("error");
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [agendaRange.startMs, agendaRange.endMs, dataEpoch]);

  const filteredHits = useMemo(() => {
    if (!aeFilter) return hits;
    return hits.filter((hit) => visibleKeys.has(meetingAccountKey(hit)));
  }, [hits, aeFilter, visibleKeys]);

  const visibleCal = useMemo(() => {
    if (!aeFilter) return calEvents;
    return calEvents.filter((ev) => ev.account && visibleKeys.has(ev.account));
  }, [calEvents, aeFilter, visibleKeys]);

  const agenda = useMemo(
    () => splitAgendaDays(visibleCal, agendaRange),
    [visibleCal, agendaRange]
  );

  const todos = useMemo(() => {
    const all = todoTasks(tasks);
    if (!aeFilter) return all;
    return all.filter((t) => visibleKeys.has(t.account));
  }, [tasks, aeFilter, visibleKeys]);
  const todoGroups = useMemo(
    () => groupTasksByAccount(todos, visibleAccounts),
    [todos, visibleAccounts]
  );

  const available = useMemo(() => {
    const inWindow = meetingsInAgendaRange(filteredHits, agendaRange);
    return [...inWindow].sort(
      (a, b) =>
        (b.started_at || "").localeCompare(a.started_at || "") ||
        (a.rel_path || "").localeCompare(b.rel_path || "")
    );
  }, [filteredHits, agendaRange]);

  const selectedCal = visibleCal.find((e) => e.id === selectedCalId) || null;
  const agendaCount = (agenda.days || []).reduce((n, d) => n + d.events.length, 0);

  function openCalendarEvent(event) {
    const recorded = recordedHitForCalendarEvent(event, filteredHits);
    if (recorded && onOpenMeeting) {
      setSelectedCalId(null);
      onOpenMeeting(recorded);
      return;
    }
    setSelectedCalId(event.id);
  }

  function chooseAe(next) {
    onFiltersChange?.((prev) => ({
      ...(prev || {}),
      ae: next,
      account: next ? null : prev?.account ?? null,
    }));
  }

  const meetingsStatusLabel =
    calStatus === "loading"
      ? "Loading calendar…"
      : calStatus === "error"
        ? calError || "Could not load calendar"
        : `${agendaCount} on calendar · ${available.length} recorded`;

  function renderAgendaBucket(label, events) {
    return (
      <section className="daily-agenda-day">
        <div className="daily-agenda-day-label">
          <span>{label}</span>
          <span className="daily-count">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <div className="daily-agenda-empty">No meetings</div>
        ) : (
          <div className="daily-agenda-list">
            {events.map((event) => (
              <CalendarEventRow
                key={event.id}
                event={event}
                selected={selectedCalId === event.id}
                onOpen={openCalendarEvent}
                accountMap={accountMap}
                hasRecording={Boolean(recordedHitForCalendarEvent(event, filteredHits))}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="view-scroll daily-view">
      <div className="toolbar-row report-toolbar">
        <div className="report-controls">
          {aes.length > 0 && (
            <div className="report-ae-filter" role="group" aria-label="Account exec">
              <span className="filter-label">AE</span>
              <div className="filter-chips">
                <button
                  type="button"
                  className={`chip ${!aeFilter ? "active" : ""}`}
                  onClick={() => chooseAe(null)}
                >
                  All
                </button>
                {aes.map((name) => {
                  const colors = aeColors[name] || {};
                  const active = aeFilter === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`chip ae-chip ${active ? "active" : ""}`}
                      style={
                        active
                          ? {
                              color: colors.color,
                              background: colors.bg,
                              borderColor: colors.color,
                            }
                          : undefined
                      }
                      title={name}
                      onClick={() => chooseAe(active ? null : name)}
                    >
                      {aeChipLabel(name)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="report-week-nav">
            <button type="button" onClick={() => setRange((r) => shiftRange(r, -1))}>
              ‹ Prev
            </button>
            <div className="report-week-label">{range.label}</div>
            <button type="button" onClick={() => setRange((r) => shiftRange(r, 1))}>
              Next ›
            </button>
            {!isToday && (
              <button type="button" onClick={() => setRange(getDayRange(new Date()))}>
                Today
              </button>
            )}
          </div>
        </div>
        {status !== "unavailable" && (
          <a className="btn-link" href={url} target="_blank" rel="noreferrer">
            Open in Scrappy
          </a>
        )}
      </div>

      <p className="report-summary">
        {meetingsStatusLabel}
        {todos.length ? ` · ${todos.length} in progress` : ""}
      </p>

      <div className="daily-grid">
        <section className="entity-card daily-col daily-col-agenda">
          <div className="daily-col-head">
            <h3>Today & Tomorrow</h3>
            <span className="daily-count">{agendaCount}</span>
          </div>
          <div className="daily-agenda">
          {calStatus === "loading" && <div className="meetings-empty">Loading calendar…</div>}
          {calStatus === "error" && (
            <div className="meetings-empty">{calError || "Could not load calendar meetings."}</div>
          )}
          {calStatus === "ok" && !calConfigured && agendaCount === 0 && (
            <div className="meetings-empty daily-agenda-setup">
              No live calendar. Set up Spark CLI (Spark Desktop → Settings → AI Agents → Setup CLI) or add
              CALENDAR_ICS_URL to .env, then restart the server.
            </div>
          )}
          {calStatus === "ok" &&
            (calConfigured || agendaCount > 0) &&
            (agenda.days || []).map((bucket) =>
              renderAgendaBucket(
                dayHeading(bucket.ymd, todayRange.startYmd, realTomorrowYmd),
                bucket.events
              )
            )}
          </div>
        </section>

        <section className="entity-card daily-col">
          <div className="daily-col-head">
            <h3>In progress</h3>
            <span className="daily-count">{todos.length}</span>
          </div>
          {todos.length === 0 ? (
            <div className="meetings-empty">Nothing in progress.</div>
          ) : (
            <>
              {todoGroups.groups.map((group) => (
                <AccountGroup
                  key={group.key}
                  account={group.account}
                  accountMap={accountMap}
                  count={group.tasks.length}
                >
                  <div className="daily-todo-list">
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        accountMap={accountMap}
                        pocMap={pocMap}
                        compactMeta
                        onOpen={onOpenTask}
                      />
                    ))}
                  </div>
                </AccountGroup>
              ))}
              {todoGroups.unaligned.length > 0 && (
                <section className="daily-account-group">
                  <div className="daily-account-group-head">
                    <span className="report-account-name">Unaligned</span>
                    <span className="daily-count">{todoGroups.unaligned.length}</span>
                  </div>
                  <div className="daily-todo-list">
                    {todoGroups.unaligned.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        accountMap={accountMap}
                        pocMap={pocMap}
                        onOpen={onOpenTask}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </section>

        <section className="entity-card daily-col">
          <div className="daily-col-head">
            <h3>Available meetings</h3>
            <span className="daily-count">{available.length}</span>
          </div>
          {status === "loading" && <div className="meetings-empty">Loading meetings…</div>}
          {status === "unavailable" && (
            <div className="meetings-empty">
              Meeting notes unavailable. Start Scrappy → Search meetings.
            </div>
          )}
          {status === "ok" && available.length === 0 && (
            <div className="meetings-empty">No recorded meetings in this window.</div>
          )}
          {status === "ok" &&
            available.map((hit) => (
              <MeetingRow
                key={hit.rel_path}
                hit={hit}
                onOpen={onOpenMeeting}
                accountMap={accountMap}
              />
            ))}
        </section>
      </div>

      {selectedCal && (
        <section className="entity-card daily-reader" aria-label="Calendar meeting">
          <div className="meeting-reader-header">
            <div className="meeting-reader-meta">
              <div className="meeting-reader-title">{selectedCal.title}</div>
              <div className="meeting-reader-sub">
                {[
                  formatEventWhen(selectedCal),
                  selectedCal.account
                    ? accountMap[selectedCal.account]?.label || selectedCal.account
                    : "Unaligned",
                  selectedCal.location,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="daily-reader-actions">
              {selectedCal.meetUrl && (
                <a className="btn-link" href={selectedCal.meetUrl} target="_blank" rel="noreferrer">
                  Join
                </a>
              )}
              {selectedCal.url && (
                <a className="btn-link" href={selectedCal.url} target="_blank" rel="noreferrer">
                  Calendar
                </a>
              )}
              <button type="button" onClick={() => setSelectedCalId(null)}>
                Close
              </button>
            </div>
          </div>
          <div className="meeting-reader-body">
            <div className="meeting-reader-notes">
              {selectedCal.notes || "No description on this calendar event."}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
