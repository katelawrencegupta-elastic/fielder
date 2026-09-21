import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  buildPocActivityReport,
  buildWeeklyReport,
  getDayRange,
  getWeekRange,
  pocReportToMarkdown,
  reportToMarkdown,
  shiftRange,
} from "../report/weeklyStatus.js";
import { AccountPill } from "../components/Pills.jsx";

const POC_STORAGE_KEY = "fielder.report.pocId";

function aeChipLabel(name) {
  return name.replace(" (Tim)", "").split(" ")[0];
}

function CardFlags({ flags, granularity }) {
  const bits = [];
  if (flags.overdue) bits.push("Overdue");
  if (flags.blocked) bits.push("Blocked");
  if (flags.due) bits.push(granularity === "day" ? "Due today" : "Due");
  if (flags.isNew) bits.push("New");
  else if (flags.activity) bits.push("Updated");
  if (!bits.length) return null;
  return (
    <span className="report-flags">
      {bits.map((b) => (
        <span
          key={b}
          className={`report-flag${b === "Overdue" || b === "Blocked" ? " report-flag-warn" : ""}`}
        >
          {b}
        </span>
      ))}
    </span>
  );
}

function NotesBlock({ text }) {
  if (!text) return null;
  return <div className="report-item-desc">{text}</div>;
}

function CardRow({ card, granularity, showAccount = false, onOpen }) {
  const meta = [];
  if (card.stageLabel) meta.push(card.stageLabel);
  if (card.workstreamLabel && card.workstream !== "misc") meta.push(card.workstreamLabel);
  if (card.pocTitle) meta.push(card.pocTitle);
  if (showAccount && card.account) meta.push(card.account);
  if (card.startDateLabel) meta.push(`start ${card.startDateLabel}`);
  if (card.dueDateLabel) meta.push(`due ${card.dueDateLabel}`);
  if (card.subtasksTotal > 0) meta.push(`subtasks ${card.subtasksDone}/${card.subtasksTotal}`);

  const body = (
    <>
      <div className="report-card-main">
        <span className="report-item-title">{card.title}</span>
        {meta.length > 0 && <span className="report-item-meta">{meta.join(" · ")}</span>}
        <CardFlags flags={card.flags} granularity={granularity} />
      </div>
      {card.labels?.length > 0 && (
        <div className="report-labels">
          {card.labels.map((lab) => (
            <span key={lab} className="report-label">
              {lab}
            </span>
          ))}
        </div>
      )}
      <NotesBlock text={card.description} />
    </>
  );

  if (onOpen && card.id != null) {
    return (
      <li className="report-card-row">
        <button type="button" className="report-card-open" onClick={() => onOpen(card)}>
          {body}
        </button>
      </li>
    );
  }

  return <li className="report-card-row">{body}</li>;
}

function CommitRow({ c, showPoc }) {
  return (
    <li>
      <code className="report-sha">{c.shortSha}</code>
      {showPoc && c.pocTitle && <span className="report-item-meta">{c.pocTitle}</span>}
      {c.url ? (
        <a href={c.url} target="_blank" rel="noreferrer" className="report-item-title">
          {c.message}
        </a>
      ) : (
        <span className="report-item-title">{c.message}</span>
      )}
      <span className="report-item-meta">
        {[c.author, c.committedAtLabel].filter(Boolean).join(" · ")}
      </span>
    </li>
  );
}

function EventRow({ e }) {
  return (
    <li>
      <span className="report-item-title">{e.line}</span>
      <span className="report-item-meta">
        {[e.pocTitle, e.createdAtLabel].filter(Boolean).join(" · ")}
      </span>
    </li>
  );
}

function loadStoredPocId(pocs) {
  try {
    const raw = sessionStorage.getItem(POC_STORAGE_KEY);
    if (!raw) return pocs[0]?.id ?? "";
    const id = Number(raw);
    if (pocs.some((p) => p.id === id)) return id;
  } catch {
    /* ignore */
  }
  return pocs[0]?.id ?? "";
}

function formatStatus(status) {
  if (!status) return null;
  return String(status).replace(/_/g, " ");
}

export default function ReportView({
  tasks,
  pocs,
  accounts,
  accountMap,
  aes = [],
  aeColors = {},
  stages,
  filters = {},
  onFiltersChange,
  onOpenTask,
  flash,
}) {
  const [scope, setScope] = useState("accounts"); // accounts | poc
  const [granularity, setGranularity] = useState("week"); // day | week
  const [range, setRange] = useState(() => getWeekRange(new Date()));
  const [pocId, setPocId] = useState(() => loadStoredPocId(pocs));
  const aeFilter = filters.ae || null;
  const [commits, setCommits] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [eventError, setEventError] = useState("");

  const tasksById = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) m.set(t.id, t);
    return m;
  }, [tasks]);

  function openReportCard(card) {
    if (!onOpenTask || card?.id == null) return;
    const task = tasksById.get(card.id) || card;
    onOpenTask(task);
  }

  useEffect(() => {
    if (pocId === "" || pocId == null) return;
    try {
      sessionStorage.setItem(POC_STORAGE_KEY, String(pocId));
    } catch {
      /* ignore */
    }
  }, [pocId]);

  useEffect(() => {
    setRange((prev) => {
      const anchor = prev?.start || new Date();
      return granularity === "day" ? getDayRange(anchor) : getWeekRange(anchor);
    });
  }, [granularity]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCommits(true);
    setCommitError("");
    api
      .getTimeline({ fromMs: range.startMs, toMs: range.endMs })
      .then((data) => {
        if (!cancelled) setCommits(data.commits || []);
      })
      .catch((e) => {
        if (!cancelled) setCommitError(e.message || "Failed to load commits");
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.startMs, range.endMs]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEvents(true);
    setEventError("");
    const opts = { fromMs: range.startMs, toMs: range.endMs };
    if (scope === "poc" && pocId !== "" && pocId != null) {
      opts.pocId = pocId;
    }
    if (scope === "poc" && (pocId === "" || pocId == null)) {
      setEvents([]);
      setEventError("");
      setLoadingEvents(false);
      return;
    }
    api
      .getTaskEvents(opts)
      .then((data) => {
        if (!cancelled) setEvents(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setEventError(e.message || "Failed to load card updates");
      })
      .finally(() => {
        if (!cancelled) setLoadingEvents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, pocId, range.startMs, range.endMs]);

  const selectedPoc = useMemo(() => {
    const poc = pocs.find((p) => Number(p.id) === Number(pocId)) || null;
    if (!poc || !aeFilter) return poc;
    const acct = accountMap[poc.account] || accounts.find((a) => a.key === poc.account);
    return acct?.ae === aeFilter ? poc : null;
  }, [pocs, pocId, aeFilter, accountMap, accounts]);

  const allAccountSections = useMemo(
    () =>
      buildWeeklyReport({
        tasks,
        pocs,
        commits,
        events,
        accounts,
        accountMap,
        stages,
        range,
      }),
    [tasks, pocs, commits, events, accounts, accountMap, stages, range]
  );

  const accountSections = useMemo(() => {
    if (!aeFilter) return allAccountSections;
    return allAccountSections.filter((sec) => sec.ae === aeFilter);
  }, [allAccountSections, aeFilter]);

  const pocOptions = useMemo(() => {
    let list = [...pocs];
    if (aeFilter) {
      list = list.filter((p) => {
        const acct = accountMap[p.account] || accounts.find((a) => a.key === p.account);
        return acct?.ae === aeFilter;
      });
    }
    return list.sort((a, b) =>
      (a.title || a.folderName || "").localeCompare(b.title || b.folderName || "")
    );
  }, [pocs, aeFilter, accountMap, accounts]);

  useEffect(() => {
    if (scope !== "poc") return;
    if (!pocOptions.length) {
      if (pocId !== "") setPocId("");
      return;
    }
    if (pocOptions.some((p) => Number(p.id) === Number(pocId))) return;
    const stored = loadStoredPocId(pocOptions);
    setPocId(stored === "" ? pocOptions[0].id : stored);
  }, [scope, pocOptions, pocId]);

  const pocReport = useMemo(() => {
    if (scope !== "poc" || !selectedPoc) return null;
    return buildPocActivityReport({
      poc: selectedPoc,
      tasks,
      events,
      commits,
      stages,
      range,
    });
  }, [scope, selectedPoc, tasks, events, commits, stages, range]);

  const markdown = useMemo(() => {
    if (scope === "poc" && pocReport) return pocReportToMarkdown(pocReport);
    return reportToMarkdown(accountSections, range, { granularity, ae: aeFilter });
  }, [scope, pocReport, accountSections, range, granularity, aeFilter]);

  const totals = useMemo(() => {
    if (scope === "poc" && pocReport) {
      return {
        events: pocReport.totals.events,
        commits: pocReport.totals.commits,
        cards: pocReport.totals.cards,
        overdue: pocReport.totals.overdue,
        board: pocReport.totals.board,
      };
    }
    let cards = 0;
    let commitCount = 0;
    let demos = 0;
    let eventCount = 0;
    let overdue = 0;
    let blocked = 0;
    for (const s of accountSections) {
      cards += s.cards.length;
      commitCount += s.commits.length;
      demos += s.demos.length;
      eventCount += s.events?.length || 0;
      overdue += s.overdue?.length || 0;
      blocked += s.blocked?.length || 0;
    }
    return {
      accounts: accountSections.length,
      cards,
      commits: commitCount,
      demos,
      events: eventCount,
      overdue,
      blocked,
    };
  }, [scope, pocReport, accountSections]);

  const loading = loadingCommits || loadingEvents;
  const thisRange = granularity === "day" ? getDayRange(new Date()) : getWeekRange(new Date());
  const isCurrent =
    range.startYmd === thisRange.startYmd && range.endYmd === thisRange.endYmd;

  const pocHasContent =
    pocReport &&
    (pocReport.days.length > 0 ||
      pocReport.periodCards?.length > 0 ||
      pocReport.overdue?.length > 0 ||
      pocReport.board?.columns?.length > 0);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      flash?.("Copied report markdown");
    } catch {
      flash?.("Could not copy to clipboard");
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scopeTag = scope === "poc" ? `poc-${pocId}` : "accounts";
    const aeTag = aeFilter ? `-${aeChipLabel(aeFilter).toLowerCase()}` : "";
    a.download = `fielder-${scopeTag}${aeTag}-${granularity}-${range.startYmd}.md`;
    a.click();
    URL.revokeObjectURL(url);
    flash?.("Downloaded report");
  }

  function chooseAe(next) {
    onFiltersChange?.((prev) => ({
      ...(prev || {}),
      ae: next,
      account: next ? null : prev?.account ?? null,
    }));
  }

  return (
    <div className="view-scroll report-view">
      <div className="toolbar-row report-toolbar">
        <div className="report-controls">
          <div className="report-seg" role="group" aria-label="Report scope">
            <button
              type="button"
              className={scope === "accounts" ? "active" : ""}
              onClick={() => setScope("accounts")}
            >
              Accounts
            </button>
            <button
              type="button"
              className={scope === "poc" ? "active" : ""}
              onClick={() => setScope("poc")}
            >
              POC
            </button>
          </div>
          <div className="report-seg" role="group" aria-label="Granularity">
            <button
              type="button"
              className={granularity === "day" ? "active" : ""}
              onClick={() => setGranularity("day")}
            >
              Day
            </button>
            <button
              type="button"
              className={granularity === "week" ? "active" : ""}
              onClick={() => setGranularity("week")}
            >
              Week
            </button>
          </div>
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
          {scope === "poc" && (
            <select
              className="report-poc-select"
              value={pocId === "" ? "" : String(pocId)}
              onChange={(e) => setPocId(e.target.value ? Number(e.target.value) : "")}
              aria-label="POC"
            >
              {!pocOptions.length && <option value="">No POCs</option>}
              {pocOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.folderName || `POC #${p.id}`}
                </option>
              ))}
            </select>
          )}
          <div className="report-week-nav">
            <button type="button" onClick={() => setRange((r) => shiftRange(r, -1))}>
              ‹ Prev
            </button>
            <div className="report-week-label">{range.label}</div>
            <button type="button" onClick={() => setRange((r) => shiftRange(r, 1))}>
              Next ›
            </button>
            {!isCurrent && (
              <button
                type="button"
                onClick={() =>
                  setRange(granularity === "day" ? getDayRange(new Date()) : getWeekRange(new Date()))
                }
              >
                {granularity === "day" ? "Today" : "This week"}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={copyMarkdown} disabled={loading}>
            Copy Markdown
          </button>
          <button type="button" className="primary" onClick={downloadMarkdown} disabled={loading}>
            Download
          </button>
        </div>
      </div>

      <div className="report-summary">
        {loading
          ? "Loading…"
          : scope === "poc"
            ? `${totals.events} card update${totals.events === 1 ? "" : "s"} · ${totals.commits} commit${
                totals.commits === 1 ? "" : "s"
              } · ${totals.cards} touched · ${totals.overdue} overdue · ${totals.board} on board`
            : `${totals.accounts} account${totals.accounts === 1 ? "" : "s"} · ${totals.cards} card${
                totals.cards === 1 ? "" : "s"
              } · ${totals.events} update${totals.events === 1 ? "" : "s"} · ${totals.overdue} overdue · ${
                totals.blocked
              } blocked · ${totals.commits} commit${totals.commits === 1 ? "" : "s"} · ${totals.demos} demo${
                totals.demos === 1 ? "" : "s"
              }`}
        {!loading && aeFilter ? ` · AE ${aeFilter}` : ""}
        {commitError && (
          <span style={{ color: "var(--color-red)", marginLeft: 8 }}>{commitError}</span>
        )}
        {eventError && (
          <span style={{ color: "var(--color-red)", marginLeft: 8 }}>{eventError}</span>
        )}
      </div>

      {scope === "accounts" && (
        <>
          {!loading && accountSections.length === 0 && (
            <div className="empty-state">
              No Kanban activity, card updates, POC commits, or demos/workshops for {range.label}
              {aeFilter ? ` · ${aeFilter}` : ""}.
            </div>
          )}

          <div className="report-sections">
            {accountSections.map((sec) => (
              <section key={sec.accountKey} className="report-account entity-card">
                <header className="report-account-header">
                  <div className="report-account-title">
                    <AccountPill akey={sec.accountKey} accountMap={accountMap} />
                    <span className="report-account-name">{sec.accountLabel}</span>
                    {sec.ae && <span className="report-account-ae">{sec.ae}</span>}
                  </div>
                  <div className="report-account-counts">
                    {[
                      sec.overdue?.length ? `${sec.overdue.length} overdue` : null,
                      sec.blocked?.length ? `${sec.blocked.length} blocked` : null,
                      sec.cards.length ? `${sec.cards.length} cards` : null,
                      sec.events?.length ? `${sec.events.length} updates` : null,
                      sec.commits.length ? `${sec.commits.length} commits` : null,
                      sec.demos.length ? `${sec.demos.length} demos` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </header>

                {sec.overdue?.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Overdue</h3>
                    <ul className="report-list">
                      {sec.overdue.map((c) => (
                        <CardRow key={`od-${c.id}`} card={c} granularity={granularity}  onOpen={openReportCard} />
                      ))}
                    </ul>
                  </div>
                )}

                {sec.blocked?.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Blocked</h3>
                    <ul className="report-list">
                      {sec.blocked.map((c) => (
                        <CardRow key={`bl-${c.id}`} card={c} granularity={granularity}  onOpen={openReportCard} />
                      ))}
                    </ul>
                  </div>
                )}

                {sec.cards.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Kanban (due / touched)</h3>
                    <ul className="report-list">
                      {sec.cards.map((c) => (
                        <CardRow key={c.id} card={c} granularity={granularity}  onOpen={openReportCard} />
                      ))}
                    </ul>
                  </div>
                )}

                {sec.events?.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Card updates</h3>
                    <ul className="report-list">
                      {sec.events.map((e) => (
                        <EventRow key={e.id} e={e} />
                      ))}
                    </ul>
                  </div>
                )}

                {sec.commits.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">POC commits</h3>
                    <ul className="report-list">
                      {sec.commits.map((c) => (
                        <CommitRow key={`${c.sha}-${c.pocId}`} c={c} showPoc />
                      ))}
                    </ul>
                  </div>
                )}

                {sec.demos.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Demos / workshops</h3>
                    <ul className="report-list">
                      {sec.demos.map((d) => (
                        <li key={d.id} className="report-card-row">
                          <button
                            type="button"
                            className="report-card-open"
                            onClick={() => openReportCard(d)}
                          >
                            <div className="report-card-main">
                              <span className="report-item-title">{d.title}</span>
                              <span className="report-item-meta">
                                {[d.spanLabel, d.stageLabel].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                            {d.labels?.length > 0 && (
                              <div className="report-labels">
                                {d.labels.map((lab) => (
                                  <span key={lab} className="report-label">
                                    {lab}
                                  </span>
                                ))}
                              </div>
                            )}
                            <NotesBlock text={d.description} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {scope === "poc" && (
        <>
          {!selectedPoc && (
            <div className="empty-state">
              {aeFilter && !pocOptions.length
                ? `No POCs for ${aeFilter}.`
                : "Select a POC to view activity."}
            </div>
          )}
          {selectedPoc && !loading && pocReport && !pocHasContent && (
            <div className="empty-state">
              No activity or board cards for {selectedPoc.title || selectedPoc.folderName} in{" "}
              {range.label}.
              <div className="report-hint">
                Card updates are recorded when you create, move, rename, or edit POC cards.
              </div>
            </div>
          )}
          {selectedPoc && pocReport && pocHasContent && (
            <div className="report-sections">
              <section className="report-account entity-card">
                <header className="report-account-header">
                  <div className="report-account-title">
                    <span className="report-account-name">{pocReport.pocTitle}</span>
                    {pocReport.meta?.account && (
                      <AccountPill akey={pocReport.meta.account} accountMap={accountMap} />
                    )}
                  </div>
                  <div className="report-meta-line">
                    {[
                      formatStatus(pocReport.meta?.status),
                      pocReport.meta?.owner ? `owner ${pocReport.meta.owner}` : null,
                      pocReport.meta?.startDate || pocReport.meta?.targetDemoDate
                        ? `${pocReport.meta.startDate || "—"} → ${pocReport.meta.targetDemoDate || "—"}`
                        : null,
                      pocReport.meta?.commitCount != null
                        ? `${pocReport.meta.commitCount} tracked commits`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {(pocReport.meta?.notesUrl || pocReport.meta?.repoUrl) && (
                    <div className="report-meta-links">
                      {pocReport.meta.notesUrl && (
                        <a href={pocReport.meta.notesUrl} target="_blank" rel="noreferrer">
                          Notes doc
                        </a>
                      )}
                      {pocReport.meta.repoUrl && (
                        <a href={pocReport.meta.repoUrl} target="_blank" rel="noreferrer">
                          Repo
                        </a>
                      )}
                    </div>
                  )}
                </header>

                {pocReport.overdue?.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Overdue</h3>
                    <ul className="report-list">
                      {pocReport.overdue.map((c) => (
                        <CardRow key={`od-${c.id}`} card={c} granularity={granularity}  onOpen={openReportCard} />
                      ))}
                    </ul>
                  </div>
                )}

                {pocReport.periodCards?.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Touched / due in period</h3>
                    <ul className="report-list">
                      {pocReport.periodCards.map((c) => (
                        <CardRow key={c.id} card={c} granularity={granularity}  onOpen={openReportCard} />
                      ))}
                    </ul>
                  </div>
                )}

                {pocReport.days.map((day) => (
                  <div key={day.range.startYmd} className="report-day">
                    {granularity === "week" && (
                      <h3 className="report-day-title">{day.label}</h3>
                    )}
                    {day.events.length > 0 && (
                      <div className="report-block">
                        <h3 className="report-block-title">Card updates</h3>
                        <ul className="report-list">
                          {day.events.map((e) => (
                            <EventRow key={e.id} e={e} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {day.commits.length > 0 && (
                      <div className="report-block">
                        <h3 className="report-block-title">Commits</h3>
                        <ul className="report-list">
                          {day.commits.map((c) => (
                            <CommitRow key={`${c.sha}-${c.pocId}`} c={c} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}

                {pocReport.board?.columns?.length > 0 && (
                  <div className="report-block report-board">
                    <h3 className="report-block-title">
                      Current board · {pocReport.board.total} active
                      {pocReport.board.archived
                        ? ` · ${pocReport.board.archived} archived`
                        : ""}
                    </h3>
                    <div className="report-board-cols">
                      {pocReport.board.columns.map((col) => (
                        <div key={col.key} className="report-board-col">
                          <div className="report-board-col-title">
                            {col.label}{" "}
                            <span className="report-board-count">{col.count}</span>
                          </div>
                          <ul className="report-list">
                            {col.cards.map((c) => (
                              <li key={c.id} className="report-card-row">
                                <button
                                  type="button"
                                  className="report-card-open"
                                  onClick={() => openReportCard(c)}
                                >
                                  <div className="report-card-main">
                                    <span className="report-item-title">{c.title}</span>
                                    <span className="report-item-meta">
                                      {[
                                        c.workstreamLabel,
                                        c.dueDateLabel ? `due ${c.dueDateLabel}` : null,
                                        c.subtasksTotal
                                          ? `subtasks ${c.subtasksDone}/${c.subtasksTotal}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                    {c.overdue && (
                                      <span className="report-flags">
                                        <span className="report-flag report-flag-warn">Overdue</span>
                                      </span>
                                    )}
                                  </div>
                                  {c.labels?.length > 0 && (
                                    <div className="report-labels">
                                      {c.labels.map((lab) => (
                                        <span key={lab} className="report-label">
                                          {lab}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <NotesBlock text={c.description} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
