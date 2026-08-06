import { useMemo, useState } from "react";
import { api } from "../api.js";
import { today } from "../helpers.js";
import { AccountPill } from "../components/Pills.jsx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  if (!s) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventDate(task) {
  return task.dueDate || task.startDate || null;
}

function buildMonthCells(anchor) {
  const first = startOfMonth(anchor);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function DemosView({
  tasks,
  accounts,
  accountMap,
  stages,
  onTasksChange,
  onOpenTask,
  flash,
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    account: accounts[0]?.key || "other",
    dueDate: today(),
    startDate: "",
  });

  const demos = useMemo(
    () => tasks.filter((t) => t.category === "demo_workshop" && t.stage !== "archive"),
    [tasks]
  );

  const byDate = useMemo(() => {
    const map = {};
    for (const t of demos) {
      const start = t.startDate || t.dueDate;
      const end = t.dueDate || t.startDate;
      if (!start && !end) continue;
      if (start && end && start !== end) {
        const a = parseYmd(start);
        const b = parseYmd(end);
        if (!a || !b) continue;
        const cur = new Date(a);
        while (cur <= b) {
          const key = ymd(cur);
          (map[key] ||= []).push(t);
          cur.setDate(cur.getDate() + 1);
        }
      } else {
        const key = start || end;
        (map[key] ||= []).push(t);
      }
    }
    for (const key of Object.keys(map)) {
      map[key] = [...new Map(map[key].map((t) => [t.id, t])).values()];
    }
    return map;
  }, [demos]);

  const undated = useMemo(
    () => demos.filter((t) => !t.startDate && !t.dueDate),
    [demos]
  );

  const upcoming = useMemo(() => {
    const t = today();
    return demos
      .filter((d) => eventDate(d) && eventDate(d) >= t)
      .sort((a, b) => eventDate(a).localeCompare(eventDate(b)))
      .slice(0, 12);
  }, [demos]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const todayKey = today();

  async function createDemo(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const stage =
      stages.find((s) => s.key === "planning")?.key ||
      stages.find((s) => s.key === "backlog")?.key ||
      "backlog";
    const created = await api.createTask({
      title: draft.title.trim(),
      account: draft.account || "other",
      stage,
      category: "demo_workshop",
      startDate: draft.startDate || null,
      dueDate: draft.dueDate || null,
    });
    onTasksChange([created, ...tasks]);
    setShowForm(false);
    setDraft({
      title: "",
      account: draft.account,
      dueDate: today(),
      startDate: "",
    });
    flash?.("Demo / workshop added");
  }

  function openDay(dateStr) {
    setDraft((d) => ({ ...d, dueDate: dateStr, startDate: "" }));
    setShowForm(true);
  }

  return (
    <div className="view-scroll demos-view">
      <div className="toolbar-row">
        <div style={{ fontSize: 13, color: "var(--color-text-mid)" }}>
          {demos.length} demo{demos.length === 1 ? "" : "s"} / workshop
          {demos.length === 1 ? "" : "s"}
          {undated.length > 0 && (
            <span style={{ color: "var(--color-text-dim)" }}>
              {" "}
              · {undated.length} undated
            </span>
          )}
        </div>
        <button type="button" className="primary" onClick={() => setShowForm(true)}>
          New demo / workshop
        </button>
      </div>

      <div className="demos-layout">
        <div className="cal-panel">
          <div className="cal-nav">
            <button type="button" onClick={() => setCursor((c) => addMonths(c, -1))}>
              ‹
            </button>
            <div className="cal-month-label">{monthLabel}</div>
            <button type="button" onClick={() => setCursor((c) => addMonths(c, 1))}>
              ›
            </button>
            <button
              type="button"
              onClick={() => setCursor(startOfMonth(new Date()))}
              style={{ marginLeft: 8 }}
            >
              Today
            </button>
          </div>

          <div className="cal-grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {cells.map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const events = byDate[key] || [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`cal-cell${inMonth ? "" : " outside"}${isToday ? " today" : ""}`}
                  onDoubleClick={() => openDay(key)}
                >
                  <div className="cal-cell-head">
                    <span className="cal-day-num">{d.getDate()}</span>
                    <button
                      type="button"
                      className="cal-add"
                      title="Add on this day"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDay(key);
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div className="cal-events">
                    {events.slice(0, 3).map((t) => {
                      const acct = accountMap[t.account];
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="cal-event"
                          style={{
                            background: acct?.bg || "var(--color-accent-dim)",
                            color: acct?.color || "var(--color-accent)",
                            borderColor: acct?.color || "var(--color-accent)",
                          }}
                          title={t.title}
                          onClick={() => onOpenTask(t)}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {events.length > 3 && (
                      <div className="cal-more">+{events.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cal-hint">Double-click a day (or press +) to schedule a demo/workshop.</div>
        </div>

        <aside className="demos-sidebar">
          <div className="filter-label" style={{ marginBottom: 8 }}>
            Upcoming
          </div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-dim)", marginBottom: 16 }}>
              No upcoming dated demos.
            </div>
          ) : (
            <div className="demos-list" style={{ marginBottom: 18 }}>
              {upcoming.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="demos-list-item"
                  onClick={() => onOpenTask(t)}
                >
                  <div className="demos-list-title">{t.title}</div>
                  <div className="demos-list-meta">
                    <span>{eventDate(t)}</span>
                    {t.account && <AccountPill akey={t.account} accountMap={accountMap} />}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="filter-label" style={{ marginBottom: 8 }}>
            Undated ({undated.length})
          </div>
          {undated.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-dim)" }}>All set.</div>
          ) : (
            <div className="demos-list">
              {undated.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="demos-list-item"
                  onClick={() => onOpenTask(t)}
                >
                  <div className="demos-list-title">{t.title}</div>
                  <div className="demos-list-meta">
                    {t.account && <AccountPill akey={t.account} accountMap={accountMap} />}
                    <span style={{ color: "var(--color-text-dim)" }}>Needs a date</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createDemo}>
            <h2>New demo / workshop</h2>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Title</label>
              <input
                autoFocus
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="GE Vernova observability workshop…"
              />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Account</label>
              <select
                value={draft.account}
                onChange={(e) => setDraft({ ...draft, account: e.target.value })}
              >
                {accounts.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Start</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Date / due</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="primary">
                Create
              </button>
              <button type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
