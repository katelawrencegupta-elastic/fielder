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

function CardFlags({ flags, granularity }) {
  const bits = [];
  if (flags.due) bits.push(granularity === "day" ? "Due today" : "Due");
  if (flags.isNew) bits.push("New");
  else if (flags.activity) bits.push("Updated");
  if (!bits.length) return null;
  return (
    <span className="report-flags">
      {bits.map((b) => (
        <span key={b} className="report-flag">
          {b}
        </span>
      ))}
    </span>
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

export default function ReportView({
  tasks,
  pocs,
  accounts,
  accountMap,
  stages,
  flash,
}) {
  const [scope, setScope] = useState("accounts"); // accounts | poc
  const [granularity, setGranularity] = useState("week"); // day | week
  const [range, setRange] = useState(() => getWeekRange(new Date()));
  const [pocId, setPocId] = useState(() => loadStoredPocId(pocs));
  const [commits, setCommits] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [eventError, setEventError] = useState("");

  useEffect(() => {
    if (scope !== "poc") return;
    if (pocId === "" && pocs.length) {
      setPocId(loadStoredPocId(pocs));
    }
  }, [pocs, scope, pocId]);

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
      .getTimeline()
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
  }, []);

  useEffect(() => {
    if (scope !== "poc" || pocId === "" || pocId == null) {
      setEvents([]);
      setEventError("");
      setLoadingEvents(false);
      return;
    }
    let cancelled = false;
    setLoadingEvents(true);
    setEventError("");
    api
      .getTaskEvents({ pocId, fromMs: range.startMs, toMs: range.endMs })
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

  const selectedPoc = useMemo(
    () => pocs.find((p) => Number(p.id) === Number(pocId)) || null,
    [pocs, pocId]
  );

  const accountSections = useMemo(
    () =>
      buildWeeklyReport({
        tasks,
        pocs,
        commits,
        accounts,
        accountMap,
        stages,
        range,
      }),
    [tasks, pocs, commits, accounts, accountMap, stages, range]
  );

  const pocReport = useMemo(() => {
    if (scope !== "poc" || !selectedPoc) return null;
    return buildPocActivityReport({
      poc: selectedPoc,
      events,
      commits,
      stages,
      range,
    });
  }, [scope, selectedPoc, events, commits, stages, range]);

  const markdown = useMemo(() => {
    if (scope === "poc" && pocReport) return pocReportToMarkdown(pocReport);
    return reportToMarkdown(accountSections, range, { granularity });
  }, [scope, pocReport, accountSections, range, granularity]);

  const totals = useMemo(() => {
    if (scope === "poc" && pocReport) {
      return {
        accounts: 0,
        cards: pocReport.totals.events,
        commits: pocReport.totals.commits,
        demos: 0,
      };
    }
    let cards = 0;
    let commitCount = 0;
    let demos = 0;
    for (const s of accountSections) {
      cards += s.cards.length;
      commitCount += s.commits.length;
      demos += s.demos.length;
    }
    return { accounts: accountSections.length, cards, commits: commitCount, demos };
  }, [scope, pocReport, accountSections]);

  const loading = loadingCommits || (scope === "poc" && loadingEvents);
  const thisRange = granularity === "day" ? getDayRange(new Date()) : getWeekRange(new Date());
  const isCurrent =
    range.startYmd === thisRange.startYmd && range.endYmd === thisRange.endYmd;

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
    a.download = `fielder-${scopeTag}-${granularity}-${range.startYmd}.md`;
    a.click();
    URL.revokeObjectURL(url);
    flash?.("Downloaded report");
  }

  const pocOptions = useMemo(
    () =>
      [...pocs].sort((a, b) =>
        (a.title || a.folderName || "").localeCompare(b.title || b.folderName || "")
      ),
    [pocs]
  );

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
            ? `${totals.cards} card update${totals.cards === 1 ? "" : "s"} · ${totals.commits} commit${
                totals.commits === 1 ? "" : "s"
              }`
            : `${totals.accounts} account${totals.accounts === 1 ? "" : "s"} · ${totals.cards} card${
                totals.cards === 1 ? "" : "s"
              } · ${totals.commits} commit${totals.commits === 1 ? "" : "s"} · ${totals.demos} demo${
                totals.demos === 1 ? "" : "s"
              } / workshop${totals.demos === 1 ? "" : "s"}`}
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
              No Kanban activity, POC commits, or demos/workshops for {range.label}.
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
                </header>

                {sec.cards.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Kanban</h3>
                    <ul className="report-list">
                      {sec.cards.map((c) => (
                        <li key={c.id}>
                          <span className="report-item-title">{c.title}</span>
                          <span className="report-item-meta">
                            {c.stageLabel}
                            {c.dueDateLabel ? ` · due ${c.dueDateLabel}` : ""}
                          </span>
                          <CardFlags flags={c.flags} granularity={granularity} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sec.commits.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">POC commits</h3>
                    <ul className="report-list">
                      {sec.commits.map((c) => (
                        <li key={`${c.sha}-${c.pocId}`}>
                          <code className="report-sha">{c.shortSha}</code>
                          <span className="report-item-meta">{c.pocTitle}</span>
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noreferrer" className="report-item-title">
                              {c.message}
                            </a>
                          ) : (
                            <span className="report-item-title">{c.message}</span>
                          )}
                          <span className="report-item-meta">
                            {c.author}
                            {c.committedAtLabel ? ` · ${c.committedAtLabel}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sec.demos.length > 0 && (
                  <div className="report-block">
                    <h3 className="report-block-title">Demos / workshops</h3>
                    <ul className="report-list">
                      {sec.demos.map((d) => (
                        <li key={d.id}>
                          <span className="report-item-title">{d.title}</span>
                          <span className="report-item-meta">
                            {d.spanLabel}
                            {d.stageLabel ? ` · ${d.stageLabel}` : ""}
                          </span>
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
            <div className="empty-state">Select a POC to view activity.</div>
          )}
          {selectedPoc && !loading && pocReport && pocReport.days.length === 0 && (
            <div className="empty-state">
              No card updates or commits for {selectedPoc.title || selectedPoc.folderName} in{" "}
              {range.label}.
              <div className="report-hint">
                Card updates are recorded from now on when you create, move, rename, or edit POC
                cards.
              </div>
            </div>
          )}
          {selectedPoc && pocReport && pocReport.days.length > 0 && (
            <div className="report-sections">
              <section className="report-account entity-card">
                <header className="report-account-header">
                  <div className="report-account-title">
                    <span className="report-account-name">
                      {pocReport.pocTitle}
                    </span>
                  </div>
                </header>
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
                            <li key={e.id}>
                              <span className="report-item-title">{e.line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {day.commits.length > 0 && (
                      <div className="report-block">
                        <h3 className="report-block-title">Commits</h3>
                        <ul className="report-list">
                          {day.commits.map((c) => (
                            <li key={`${c.sha}-${c.pocId}`}>
                              <code className="report-sha">{c.shortSha}</code>
                              {c.url ? (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="report-item-title"
                                >
                                  {c.message}
                                </a>
                              ) : (
                                <span className="report-item-title">{c.message}</span>
                              )}
                              <span className="report-item-meta">
                                {c.author}
                                {c.committedAtLabel ? ` · ${c.committedAtLabel}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
