import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import MeetingMoveDialog from "../components/MeetingMoveDialog.jsx";
import MeetingReaderActions from "../components/MeetingReaderActions.jsx";
import { AccountPill, MeetingLabels } from "../components/Pills.jsx";
import {
  accountsWithCalls,
  formatMeetingDate,
  formatMeetingTime,
  groupHitsByDay,
  meetingAccountKey,
  meetingCallSummary,
  meetingListLabels,
  meetingPocName,
  meetingTopic,
  sortMeetingsNewestFirst,
} from "../report/dailySummary.js";

const ACCOUNT_STORAGE_KEY = "fielder.meetings.accountKey";
const ARCHIVE_STORAGE_KEY = "fielder.meetings.showArchived";
const ALL_KEY = "";
const CATALOG_K = 200;
const ACCOUNTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1c0nleBeyOIth4lj3N71Zga69Sq324DgvlzmrDtYhhf8/edit";

function loadStoredAccount() {
  try {
    return sessionStorage.getItem(ACCOUNT_STORAGE_KEY) ?? ALL_KEY;
  } catch {
    return ALL_KEY;
  }
}

function loadShowArchived() {
  try {
    return sessionStorage.getItem(ARCHIVE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MeetingsView({
  accounts,
  accountMap,
  aes,
  aeColors,
  pocs = [],
  filters = {},
  onFiltersChange,
  dataEpoch = 0,
  onAccountsChange,
  flash,
  focusMeeting = null,
}) {
  const ae = filters.ae || null;
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("loading");
  const [hits, setHits] = useState([]);
  const [url, setUrl] = useState("http://127.0.0.1:8787/");
  const [selectedPath, setSelectedPath] = useState(focusMeeting?.rel_path || null);
  const [detail, setDetail] = useState(null);
  const [notesError, setNotesError] = useState("");
  const [notesLoading, setNotesLoading] = useState(Boolean(focusMeeting?.rel_path));
  const [showArchived, setShowArchived] = useState(loadShowArchived);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePaths, setMovePaths] = useState([]);
  const [checkedPaths, setCheckedPaths] = useState(() => new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const [qInput, setQInput] = useState("");
  const [query, setQuery] = useState("");
  const openPathRef = useRef(null);
  const deepLinkRef = useRef(focusMeeting?.rel_path || null);

  const [selectedKey, setSelectedKey] = useState(() => {
    const focusKey = focusMeeting ? meetingAccountKey(focusMeeting) : "";
    if (focusKey) return focusKey;
    if (filters.account) return filters.account;
    return loadStoredAccount();
  });

  useEffect(() => {
    if (deepLinkRef.current) return;
    if (filters.account != null && filters.account !== "") {
      setSelectedKey(filters.account);
    }
  }, [filters.account]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ACCOUNT_STORAGE_KEY, selectedKey ?? ALL_KEY);
    } catch {
      /* ignore */
    }
  }, [selectedKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ARCHIVE_STORAGE_KEY, showArchived ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showArchived]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(qInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHits([]);
    const searching = Boolean(query);
    Promise.all([
      api.searchMeetings({
        k: CATALOG_K,
        q: query,
        includeArchived: showArchived || searching,
      }),
      api.getMeetingsHealth().catch(() => ({ unavailable: true })),
    ])
      .then(([catalog, health]) => {
        if (cancelled) return;
        setUrl(catalog.url || health.url || "http://127.0.0.1:8787/");
        if (catalog.unavailable) {
          setStatus("unavailable");
          return;
        }
        setHits(sortMeetingsNewestFirst(catalog.hits || []));
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
  }, [showArchived, reloadToken, query, dataEpoch]);

  const railGroups = useMemo(
    () => accountsWithCalls(hits, accounts, ae),
    [hits, accounts, ae]
  );

  function chooseAe(next) {
    onFiltersChange?.((prev) => ({
      ...(prev || {}),
      ae: next,
      account: next ? null : prev?.account ?? null,
    }));
    if (next) setSelectedKey(ALL_KEY);
  }

  function chooseAccount(key) {
    deepLinkRef.current = null;
    setSelectedKey(key ?? ALL_KEY);
    onFiltersChange?.((prev) => ({
      ...(prev || {}),
      account: key || null,
    }));
  }

  const selected = railGroups.find((group) => group.key === selectedKey)?.account || null;

  const catalogDays = useMemo(() => {
    const meetings = selectedKey
      ? railGroups.find((group) => group.key === selectedKey)?.meetings || []
      : railGroups.flatMap((group) => group.meetings);
    return groupHitsByDay(meetings);
  }, [railGroups, selectedKey]);

  useEffect(() => {
    if (status === "loading") return;
    if (deepLinkRef.current) return;
    if (selectedKey === ALL_KEY) return;
    if (railGroups.some((group) => group.key === selectedKey)) return;
    setSelectedKey(ALL_KEY);
  }, [railGroups, selectedKey, status]);

  useEffect(() => {
    if (!selectedPath) return;
    if (status === "loading") return;
    const visible = catalogDays.some((day) =>
      day.meetings.some((hit) => hit.rel_path === selectedPath)
    );
    if (visible) {
      if (deepLinkRef.current === selectedPath) deepLinkRef.current = null;
      return;
    }
    if (deepLinkRef.current === selectedPath) return;
    openPathRef.current = null;
    setSelectedPath(null);
    setDetail(null);
    setNotesError("");
    setNotesLoading(false);
  }, [catalogDays, selectedPath, status]);

  useEffect(() => {
    setCheckedPaths(new Set());
  }, [selectedKey, ae, query, showArchived, reloadToken]);

  const counts = useMemo(() => {
    const map = new Map();
    for (const group of railGroups) {
      map.set(group.key, group.meetings.length);
    }
    return map;
  }, [railGroups]);

  const aeFilteredHits = useMemo(
    () => railGroups.flatMap((group) => group.meetings),
    [railGroups]
  );

  const visibleHits = useMemo(
    () => catalogDays.flatMap((day) => day.meetings),
    [catalogDays]
  );
  const visiblePaths = useMemo(
    () => visibleHits.map((hit) => hit.rel_path),
    [visibleHits]
  );

  const totalCount = aeFilteredHits.length;
  const shownCount = visibleHits.length;
  const checkedList = useMemo(() => [...checkedPaths], [checkedPaths]);
  const checkedCount = checkedList.length;
  const checkedHits = useMemo(
    () => visibleHits.filter((hit) => checkedPaths.has(hit.rel_path)),
    [visibleHits, checkedPaths]
  );
  const checkedAllVisible =
    visiblePaths.length > 0 && visiblePaths.every((path) => checkedPaths.has(path));
  const checkedSomeArchived = checkedHits.some((hit) => hit.archived);
  const checkedSomeActive = checkedHits.some((hit) => !hit.archived);

  const selectedHit =
    visibleHits.find((hit) => hit.rel_path === selectedPath) ||
    hits.find((hit) => hit.rel_path === selectedPath) ||
    (focusMeeting?.rel_path === selectedPath ? focusMeeting : null) ||
    null;
  const summary = meetingCallSummary(selectedHit, detail?.notes);
  const selectedTopic = meetingTopic(selectedHit);
  const selectedLabels = meetingListLabels(selectedHit);
  const meta = {
    account: detail?.account || selectedHit?.account || selected?.label || selected?.key || "",
    poc: detail?.poc || meetingPocName(selectedHit),
    startedAt: detail?.started_at || selectedHit?.started_at || "",
    path: detail?.rel_path || selectedHit?.rel_path || selectedPath || "",
    kind: selectedHit?.kind || "",
  };

  async function syncAccounts() {
    setSyncing(true);
    try {
      const result = await api.syncAccounts();
      if (Array.isArray(result.accounts)) onAccountsChange?.(result.accounts);
      const added = result.added?.length || 0;
      flash?.(
        added
          ? `Accounts synced from the sheet · ${added} new`
          : "Accounts synced from the sheet"
      );
    } catch (err) {
      flash?.(err.message || "Account sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function closeReader() {
    deepLinkRef.current = null;
    openPathRef.current = null;
    setSelectedPath(null);
    setDetail(null);
    setNotesError("");
    setNotesLoading(false);
  }

  function toggleChecked(path, on) {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setCheckedPaths((prev) => {
      if (checkedAllVisible) return new Set();
      const next = new Set(prev);
      for (const path of visiblePaths) next.add(path);
      return next;
    });
  }

  function clearChecked() {
    setCheckedPaths(new Set());
  }

  async function runBulk(paths, { doneOne, doneMany }, fn) {
    if (!paths.length || lifecycleBusy) return { ok: 0, fail: 0 };
    setLifecycleBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const path of paths) {
        try {
          await fn(path);
          ok += 1;
        } catch (err) {
          console.error(err);
          fail += 1;
        }
      }
      if (fail) {
        flash?.(`${doneMany}: ${ok} ok, ${fail} failed`);
      } else {
        flash?.(ok === 1 ? doneOne : `${doneMany} ${ok} meetings`);
      }
      if (selectedPath && paths.includes(selectedPath)) closeReader();
      clearChecked();
      setReloadToken((n) => n + 1);
    } finally {
      setLifecycleBusy(false);
    }
    return { ok, fail };
  }

  const selectedArchived = Boolean(detail?.archived || selectedHit?.archived);

  function meetingPathArg(path) {
    return typeof path === "string" && path ? path : selectedPath;
  }

  async function onArchiveMeeting(path) {
    const rel = meetingPathArg(path);
    if (!rel) return;
    await runBulk(
      [rel],
      { doneOne: "Meeting archived", doneMany: "Archived" },
      (p) => api.archiveMeeting(p)
    );
  }

  async function onUnarchiveMeeting(path) {
    const rel = meetingPathArg(path);
    if (!rel) return;
    await runBulk(
      [rel],
      { doneOne: "Meeting restored", doneMany: "Restored" },
      (p) => api.unarchiveMeeting(p)
    );
  }

  async function onDeleteMeeting(path) {
    const rel = meetingPathArg(path);
    if (!rel || lifecycleBusy) return;
    const ok = window.confirm(
      "Permanently delete this meeting? Transcript files and notes will be removed."
    );
    if (!ok) return;
    await runBulk(
      [rel],
      { doneOne: "Meeting deleted", doneMany: "Deleted" },
      (p) => api.deleteMeeting(p)
    );
  }

  function openRowMove(path) {
    if (!path) return;
    setMovePaths([path]);
    setMoveOpen(true);
  }

  async function onBulkArchive() {
    const paths = checkedHits.filter((hit) => !hit.archived).map((hit) => hit.rel_path);
    await runBulk(
      paths,
      { doneOne: "Archived 1 meeting", doneMany: "Archived" },
      (path) => api.archiveMeeting(path)
    );
  }

  async function onBulkUnarchive() {
    const paths = checkedHits.filter((hit) => hit.archived).map((hit) => hit.rel_path);
    await runBulk(
      paths,
      { doneOne: "Restored 1 meeting", doneMany: "Restored" },
      (path) => api.unarchiveMeeting(path)
    );
  }

  async function onBulkDelete() {
    if (!checkedCount || lifecycleBusy) return;
    const ok = window.confirm(
      `Permanently delete ${checkedCount} meeting${checkedCount === 1 ? "" : "s"}? Transcript files and notes will be removed.`
    );
    if (!ok) return;
    await runBulk(
      checkedList,
      { doneOne: "Deleted 1 meeting", doneMany: "Deleted" },
      (path) => api.deleteMeeting(path)
    );
  }

  function openBulkMove() {
    if (!checkedCount) return;
    setMovePaths(checkedList);
    setMoveOpen(true);
  }

  function openSingleMove() {
    if (!selectedPath) return;
    setMovePaths([selectedPath]);
    setMoveOpen(true);
  }

  async function onMoveMeeting({ account, poc }) {
    const paths = movePaths.length ? movePaths : selectedPath ? [selectedPath] : [];
    if (!paths.length || lifecycleBusy) return;
    setLifecycleBusy(true);
    let ok = 0;
    let fail = 0;
    let lastPath = "";
    try {
      for (const path of paths) {
        try {
          const result = await api.moveMeeting(path, { account, poc });
          lastPath = result?.path || path;
          ok += 1;
        } catch (err) {
          console.error(err);
          fail += 1;
        }
      }
      setMoveOpen(false);
      setMovePaths([]);
      clearChecked();
      setReloadToken((n) => n + 1);
      if (fail) {
        flash?.(`Moved ${ok}, ${fail} failed`);
        if (selectedPath && paths.includes(selectedPath)) closeReader();
      } else if (paths.length === 1 && lastPath) {
        flash?.("Meeting moved");
        await openMeeting({ rel_path: lastPath, account, poc });
      } else {
        flash?.(ok === 1 ? "Moved 1 meeting" : `Moved ${ok} meetings`);
        if (selectedPath && paths.includes(selectedPath)) closeReader();
      }
    } catch (err) {
      flash?.(err.message || "Could not move meeting");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function openMeeting(hit) {
    const relPath = hit.rel_path;
    if (deepLinkRef.current && deepLinkRef.current !== relPath) deepLinkRef.current = null;
    openPathRef.current = relPath;
    setSelectedPath(relPath);
    setNotesError("");
    setDetail(null);
    setNotesLoading(true);
    try {
      const meeting = await api.getMeetingNotes(relPath);
      if (openPathRef.current !== relPath) return;
      if (meeting.unavailable) {
        setNotesError("Meeting notes unavailable. Start Scrappy → Search meetings.");
        return;
      }
      setDetail(meeting);
    } catch (err) {
      if (openPathRef.current !== relPath) return;
      setNotesError(err.message || "Could not load notes.");
    } finally {
      if (openPathRef.current === relPath) setNotesLoading(false);
    }
  }

  useEffect(() => {
    if (!focusMeeting?.rel_path) return;
    const path = focusMeeting.rel_path;
    deepLinkRef.current = path;
    const key = meetingAccountKey(focusMeeting);
    setSelectedKey(key || ALL_KEY);
    openMeeting(focusMeeting);
  }, [focusMeeting]);

  return (
    <div className="meetings-view">
      <aside className="meetings-account-rail">
        <div className="meetings-account-rail-head">
          <div className="filter-label">Accounts</div>
          <div className="meetings-account-rail-actions">
            <a className="btn-link" href={ACCOUNTS_SHEET_URL} target="_blank" rel="noreferrer">
              Sheet
            </a>
            <button type="button" onClick={syncAccounts} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>

        {aes.length > 0 && (
          <div className="meetings-account-ae">
            <span className="filter-label">AE</span>
            <div className="filter-chips">
              <button
                type="button"
                className={`chip ${!ae ? "active" : ""}`}
                onClick={() => chooseAe(null)}
              >
                All
              </button>
              {aes.map((name) => {
                const colors = aeColors?.[name] || { color: "var(--color-accent)" };
                const active = ae === name;
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
                    onClick={() => chooseAe(active ? null : name)}
                  >
                    {name.replace(" (Tim)", "").split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="meetings-account-list" role="radiogroup" aria-label="Accounts">
          <label className={`meetings-account-item${!selectedKey ? " is-active" : ""}`}>
            <input
              type="radio"
              name="meetings-account"
              value=""
              checked={!selectedKey}
              onChange={() => {
                closeReader();
                chooseAccount(ALL_KEY);
              }}
            />
            <span className="meetings-account-item-text">
              <span className="meetings-account-item-label">All meetings</span>
              <span className="meetings-account-item-ae">
                {totalCount ? `${totalCount} recorded` : "Accounts with calls"}
              </span>
            </span>
          </label>
          {status === "ok" && railGroups.length === 0 ? (
            <div className="meetings-empty">
              {ae ? "No recorded calls for this AE." : "No recorded calls yet."}
            </div>
          ) : (
            railGroups.map((group) => {
              const account = group.account;
              const active = selected?.key === account.key;
              const colors = accountMap[account.key] || {};
              const count = counts.get(account.key) || group.meetings.length;
              return (
                <label
                  key={account.key}
                  className={`meetings-account-item${active ? " is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="meetings-account"
                    value={account.key}
                    checked={active}
                    onChange={() => {
                      closeReader();
                      chooseAccount(account.key);
                    }}
                  />                  <span
                    className="meetings-account-swatch"
                    style={{ background: colors.swatch || colors.color || "var(--color-border)" }}
                    aria-hidden
                  />
                  <span className="meetings-account-item-text">
                    <span className="meetings-account-item-label">
                      {account.label || account.long || account.key}
                    </span>
                    {account.ae ? (
                      <span className="meetings-account-item-ae">{account.ae}</span>
                    ) : null}
                  </span>
                  <span className="meetings-account-count">{count}</span>
                </label>
              );
            })
          )}
        </div>
      </aside>

      <div className="meetings-view-main has-reader">
        <div className="meetings-view-header">
          <div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>
              {selected ? selected.long || selected.label || selected.key : "All meetings"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-dim)",
                marginTop: 2,
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 8px",
                alignItems: "center",
              }}
            >
              {selected ? <AccountPill akey={selected.key} accountMap={accountMap} /> : null}
              {selected?.ae ? <span>{selected.ae}</span> : null}
              <span>
                {status === "ok"
                  ? `${shownCount} meeting${shownCount === 1 ? "" : "s"}${
                      query
                        ? " matching"
                        : showArchived
                          ? ""
                          : " · last 2 weeks"
                    }`
                  : "Recorded meetings"}
              </span>
            </div>
          </div>
          <div className="meetings-view-header-actions">
            <input
              className="meetings-search"
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search all meetings…"
              aria-label="Search meetings"
            />
            {status === "ok" && (
              <button type="button" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Hide archived" : "Show archived"}
              </button>
            )}
            {status !== "unavailable" && (
              <a className="btn-link" href={url} target="_blank" rel="noreferrer">
                Open in Scrappy
              </a>
            )}
          </div>
        </div>

        <div className="meetings-catalog-body">
          <div className="meetings-catalog-scroll">
            {status === "loading" && <div className="meetings-empty">Loading meetings…</div>}
            {status === "unavailable" && (
              <div className="meetings-empty">
                Meeting notes unavailable. Start Scrappy → Search meetings.
              </div>
            )}
            {status === "error" && (
              <div className="meetings-empty">Could not load meeting notes.</div>
            )}
            {status === "ok" && catalogDays.length === 0 && (
              <div className="meetings-empty">
                {query
                  ? "No meetings match that search."
                  : selected
                    ? "No meetings in the last 2 weeks for this account. Search to find older ones."
                    : "No meetings in the last 2 weeks. Search to find older ones."}
              </div>
            )}
            {status === "ok" && visiblePaths.length > 0 && (
              <div className="meetings-bulk-bar">
                <label className="meetings-bulk-select-all">
                  <input
                    type="checkbox"
                    checked={checkedAllVisible}
                    disabled={lifecycleBusy}
                    onChange={toggleSelectAllVisible}
                  />
                  <span>
                    {checkedCount
                      ? `${checkedCount} selected`
                      : `Select all (${visiblePaths.length})`}
                  </span>
                </label>
                {checkedCount > 0 ? (
                  <div className="meetings-bulk-actions">
                    {checkedSomeActive ? (
                      <button type="button" disabled={lifecycleBusy} onClick={onBulkArchive}>
                        Archive
                      </button>
                    ) : null}
                    {checkedSomeArchived ? (
                      <button type="button" disabled={lifecycleBusy} onClick={onBulkUnarchive}>
                        Unarchive
                      </button>
                    ) : null}
                    <button type="button" disabled={lifecycleBusy} onClick={openBulkMove}>
                      Move
                    </button>
                    <button type="button" disabled={lifecycleBusy} onClick={onBulkDelete}>
                      Delete
                    </button>
                    <button type="button" disabled={lifecycleBusy} onClick={clearChecked}>
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            {status === "ok" &&
              catalogDays.map((day) => (
                <div key={day.ymd} className="meetings-catalog-day">
                  <div className="meetings-catalog-day-label">{day.label}</div>
                  {day.meetings.map((hit) => {
                    const poc = meetingPocName(hit);
                    const time = formatMeetingTime(hit.started_at);
                    const accountKey = meetingAccountKey(hit);
                    const topic = meetingTopic(hit);
                    const labels = meetingListLabels(hit);
                    const checked = checkedPaths.has(hit.rel_path);
                    return (
                      <div
                        key={hit.rel_path}
                        className={`meeting-row meetings-catalog-row${
                          selectedPath === hit.rel_path ? " is-active" : ""
                        }${hit.archived ? " is-archived" : ""}${checked ? " is-checked" : ""}`}
                      >
                        <label
                          className="meetings-catalog-check"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={lifecycleBusy}
                            onChange={(e) => toggleChecked(hit.rel_path, e.target.checked)}
                            aria-label={`Select ${topic || poc || hit.rel_path}`}
                          />
                        </label>
                        <button
                          type="button"
                          className="meetings-catalog-row-main"
                          onClick={() => openMeeting(hit)}
                        >
                          <span className="meetings-catalog-time">{time || "—"}</span>
                          <span className="meetings-catalog-row-body">
                            <span className="meetings-catalog-copy">
                              <span className="meetings-catalog-title-row">
                                {!selectedKey && accountKey ? (
                                  <AccountPill akey={accountKey} accountMap={accountMap} />
                                ) : null}
                                <span className="meetings-catalog-title">
                                  {topic || poc || hit.kind || "Meeting"}
                                </span>
                                {hit.archived ? (
                                  <span className="report-item-meta">Archived</span>
                                ) : null}
                              </span>
                              {labels.length ? <MeetingLabels labels={labels} /> : null}
                            </span>
                          </span>
                        </button>
                        <div
                          className="meetings-catalog-row-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={lifecycleBusy}
                            title="Move"
                            onClick={() => openRowMove(hit.rel_path)}
                          >
                            Move
                          </button>
                          {hit.archived ? (
                            <button
                              type="button"
                              disabled={lifecycleBusy}
                              title="Unarchive"
                              onClick={() => onUnarchiveMeeting(hit.rel_path)}
                            >
                              Unarchive
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={lifecycleBusy}
                              title="Archive"
                              onClick={() => onArchiveMeeting(hit.rel_path)}
                            >
                              Archive
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger"
                            disabled={lifecycleBusy}
                            title="Delete"
                            onClick={() => onDeleteMeeting(hit.rel_path)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
          <section className="meeting-reader" aria-label="Call summary">
            {selectedPath ? (
              <>
                <div className="meeting-reader-header">
                  <div className="meeting-reader-meta">
                    <div className="meeting-reader-title">
                      {selectedTopic || meetingPocName(selectedHit) || meta.poc || "Call"}
                    </div>
                    <div className="meeting-reader-sub">
                      {selectedLabels.length ? (
                        <MeetingLabels labels={selectedLabels} />
                      ) : (
                        "Summary and details"
                      )}
                    </div>
                  </div>
                  <MeetingReaderActions
                    archived={selectedArchived}
                    busy={lifecycleBusy}
                    onMove={openSingleMove}
                    onArchive={onArchiveMeeting}
                    onUnarchive={onUnarchiveMeeting}
                    onDelete={onDeleteMeeting}
                    onClose={closeReader}
                  />
                </div>
                <div className="meeting-reader-body">
                  <dl className="meeting-meta">
                    {meta.account ? (
                      <>
                        <dt>Account</dt>
                        <dd>
                          <AccountPill
                            akey={selectedHit?.account || selected?.key || meta.account}
                            accountMap={accountMap}
                          />
                        </dd>
                      </>
                    ) : null}
                    {meta.poc ? (
                      <>
                        <dt>POC</dt>
                        <dd>{meta.poc}</dd>
                      </>
                    ) : null}
                    {meta.startedAt ? (
                      <>
                        <dt>Date</dt>
                        <dd>{formatMeetingDate(meta.startedAt) || meta.startedAt}</dd>
                        <dt>Time</dt>
                        <dd>{formatMeetingTime(meta.startedAt) || "—"}</dd>
                      </>
                    ) : null}
                    {meta.path ? (
                      <>
                        <dt>File</dt>
                        <dd className="meeting-meta-path">{meta.path}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="meeting-summary-label">Summary</div>
                  {notesLoading && !summary ? (
                    <div className="meetings-empty">Loading summary…</div>
                  ) : notesError && !summary ? (
                    <div className="meetings-empty">{notesError}</div>
                  ) : (
                    <div className="meeting-summary">{summary || "No summary indexed for this call."}</div>
                  )}
                </div>
              </>
            ) : (
              <div className="meeting-reader-body">
                <div className="meetings-empty">Select a call to see the summary.</div>
              </div>
            )}
          </section>
        </div>
      </div>
      {moveOpen && movePaths.length ? (
        <MeetingMoveDialog
          key={movePaths.join("|")}
          open
          accounts={accounts}
          pocs={pocs}
          initialAccount={
            movePaths.length === 1
              ? meta.account || selectedHit?.account || ""
              : ""
          }
          initialPoc={
            movePaths.length === 1 ? meta.poc || selectedHit?.poc || "" : ""
          }
          count={movePaths.length}
          busy={lifecycleBusy}
          onClose={() => {
            setMoveOpen(false);
            setMovePaths([]);
          }}
          onConfirm={onMoveMeeting}
        />
      ) : null}
    </div>
  );
}
