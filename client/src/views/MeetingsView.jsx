import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import MeetingMoveDialog from "../components/MeetingMoveDialog.jsx";
import MeetingReaderActions from "../components/MeetingReaderActions.jsx";
import { AccountPill, MeetingLabels } from "../components/Pills.jsx";
import {
  followUpKey,
  followUpToTaskBody,
  isFollowUpOnBoard,
  loadClearedFollowUpKeys,
  openFollowUps,
  saveClearedFollowUpKeys,
  withClearedFollowUp,
  withClearedFollowUps,
} from "../followups.js";
import {
  accountsWithCalls,
  formatMeetingDate,
  formatMeetingTime,
  groupHitsByDay,
  meetingAccountKey,
  meetingCallSummary,
  meetingListLabels,
  meetingListSummary,
  meetingPocName,
  meetingTopic,
  sortMeetingsNewestFirst,
} from "../report/dailySummary.js";

const ACCOUNT_STORAGE_KEY = "fielder.meetings.accountKey";
const ARCHIVE_STORAGE_KEY = "fielder.meetings.showArchived";
const ALL_KEY = "";
const CATALOG_K = 200;
const FOLLOWUP_LIMIT = 50;
const DETAIL_TABS = [
  { key: "summary", label: "Summary" },
  { key: "notes", label: "Notes" },
  { key: "followups", label: "Follow-ups" },
];
const ACCOUNTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1c0nleBeyOIth4lj3N71Zga69Sq324DgvlzmrDtYhhf8/edit";

function pocIdForItem(item, pocs) {
  const folder = String(item?.poc || "").trim().toLowerCase();
  const account = String(item?.account || "").trim().toLowerCase();
  if (!folder) return null;
  const matches = (pocs || []).filter(
    (poc) => String(poc.folderName || "").toLowerCase() === folder
  );
  if (matches.length === 1) return matches[0].id;
  const scoped = matches.find(
    (poc) => String(poc.account || "").toLowerCase() === account
  );
  return scoped ? scoped.id : null;
}

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
  stages = [],
  tasks = [],
  filters = {},
  onFiltersChange,
  dataEpoch = 0,
  onTasksChange,
  onAccountsChange,
  flash,
  focusMeeting = null,
}) {
  const ae = filters.ae || null;
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("loading");
  const [hits, setHits] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [url, setUrl] = useState("http://127.0.0.1:8787/");
  const [selectedPath, setSelectedPath] = useState(focusMeeting?.rel_path || null);
  const [detail, setDetail] = useState(null);
  const [notesError, setNotesError] = useState("");
  const [notesLoading, setNotesLoading] = useState(Boolean(focusMeeting?.rel_path));
  const [detailTab, setDetailTab] = useState("summary");
  const [showArchived, setShowArchived] = useState(loadShowArchived);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePaths, setMovePaths] = useState([]);
  const [checkedPaths, setCheckedPaths] = useState(() => new Set());
  const [checkedFollowUpKeys, setCheckedFollowUpKeys] = useState(() => new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const [qInput, setQInput] = useState("");
  const [query, setQuery] = useState("");
  const [clearedKeys, setClearedKeys] = useState(() => loadClearedFollowUpKeys());
  const [addingKey, setAddingKey] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const openPathRef = useRef(null);
  const deepLinkRef = useRef(focusMeeting?.rel_path || null);
  const skipAutoSelectRef = useRef(false);

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
    setFollowups([]);
    const searching = Boolean(query);
    Promise.all([
      api.searchMeetings({
        k: CATALOG_K,
        q: query,
        includeArchived: showArchived || searching,
      }),
      api.getMeetingFollowups({
        includeArchived: showArchived || searching,
      }),
      api.getMeetingsHealth().catch(() => ({ unavailable: true })),
    ])
      .then(([catalog, followup, health]) => {
        if (cancelled) return;
        setUrl(catalog.url || followup.url || health.url || "http://127.0.0.1:8787/");
        if (catalog.unavailable) {
          setStatus("unavailable");
          return;
        }
        setHits(sortMeetingsNewestFirst(catalog.hits || []));
        setFollowups(followup.unavailable ? [] : followup.items || []);
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
    skipAutoSelectRef.current = false;
  }, [selectedKey, ae, query, showArchived, reloadToken]);

  useEffect(() => {
    setCheckedPaths(new Set());
    setCheckedFollowUpKeys(new Set());
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

  useEffect(() => {
    if (status === "loading") return;
    if (deepLinkRef.current) return;

    if (!visibleHits.length) {
      if (!selectedPath) return;
      openPathRef.current = null;
      setSelectedPath(null);
      setDetail(null);
      setNotesError("");
      setNotesLoading(false);
      return;
    }

    const stillVisible = selectedPath
      ? visibleHits.some((hit) => hit.rel_path === selectedPath)
      : false;
    if (stillVisible) {
      if (deepLinkRef.current === selectedPath) deepLinkRef.current = null;
      return;
    }
    if (selectedPath && deepLinkRef.current === selectedPath) return;
    if (skipAutoSelectRef.current && !selectedPath) return;

    skipAutoSelectRef.current = false;
    openMeeting(visibleHits[0]);
  }, [visibleHits, selectedPath, status]);

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
  const defaultStage = stages[0]?.key || "backlog";
  const accountFollowups = useMemo(() => {
    if (!selectedKey) return followups;
    return followups.filter((item) => String(item.account || "") === selectedKey);
  }, [followups, selectedKey]);
  const visibleFollowups = useMemo(
    () => openFollowUps(accountFollowups, clearedKeys, FOLLOWUP_LIMIT),
    [accountFollowups, clearedKeys]
  );
  const meetingFollowups = useMemo(() => {
    if (!selectedPath) return [];
    return visibleFollowups.filter((item) => item.rel_path === selectedPath);
  }, [visibleFollowups, selectedPath]);
  const otherFollowups = useMemo(() => {
    if (!selectedPath) return visibleFollowups;
    return visibleFollowups.filter((item) => item.rel_path !== selectedPath);
  }, [visibleFollowups, selectedPath]);
  const pendingFollowups = useMemo(
    () =>
      visibleFollowups.filter((item) => {
        const pocId = pocIdForItem(item, pocs);
        return !isFollowUpOnBoard(item, tasks, {
          account: item.account || selectedKey,
          pocId,
        });
      }),
    [visibleFollowups, tasks, pocs, selectedKey]
  );

  useEffect(() => {
    setDetailTab("summary");
  }, [selectedPath]);
  const followUpKeys = useMemo(
    () => visibleFollowups.map((item, index) => followUpKey(item) || `${item.rel_path}-${index}`),
    [visibleFollowups]
  );
  const checkedFollowups = useMemo(
    () =>
      visibleFollowups.filter((item, index) => {
        const key = followUpKey(item) || `${item.rel_path}-${index}`;
        return checkedFollowUpKeys.has(key);
      }),
    [visibleFollowups, checkedFollowUpKeys]
  );
  const checkedFollowUpCount = checkedFollowups.length;
  const checkedPendingFollowups = useMemo(
    () =>
      checkedFollowups.filter((item) => {
        const pocId = pocIdForItem(item, pocs);
        return !isFollowUpOnBoard(item, tasks, {
          account: item.account || selectedKey,
          pocId,
        });
      }),
    [checkedFollowups, tasks, pocs, selectedKey]
  );
  const checkedAllFollowups =
    followUpKeys.length > 0 && followUpKeys.every((key) => checkedFollowUpKeys.has(key));
  const followupBusy = Boolean(addingKey || addingAll);

  const selectedHit =
    visibleHits.find((hit) => hit.rel_path === selectedPath) ||
    hits.find((hit) => hit.rel_path === selectedPath) ||
    (focusMeeting?.rel_path === selectedPath ? focusMeeting : null) ||
    null;
  const summary = notesLoading
    ? ""
    : meetingCallSummary(selectedHit, detail?.notes);
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
    skipAutoSelectRef.current = true;
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

  function toggleFollowUpChecked(key, on) {
    if (!key) return;
    setCheckedFollowUpKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleSelectAllFollowUps() {
    setCheckedFollowUpKeys((prev) => {
      if (checkedAllFollowups) return new Set();
      return new Set(followUpKeys);
    });
  }

  function clearCheckedFollowUps() {
    setCheckedFollowUpKeys(new Set());
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

  async function addFollowUp(item) {
    const body = followUpToTaskBody(item, {
      pocId: pocIdForItem(item, pocs),
      account: item.account || selectedKey || "other",
      stage: defaultStage,
    });
    if (!body) return null;
    const created = await api.createTask(body);
    onTasksChange?.((prev) => [created, ...(prev || [])]);
    return created;
  }

  async function onAddFollowUpCard(item) {
    const key = followUpKey(item);
    if (followupBusy || isFollowUpOnBoard(item, tasks, {
      account: item.account || selectedKey,
      pocId: pocIdForItem(item, pocs),
    })) {
      return;
    }
    setAddingKey(key);
    try {
      await addFollowUp(item);
      flash?.("Added card");
    } catch (err) {
      flash?.(err.message || "Could not add card");
    } finally {
      setAddingKey("");
    }
  }

  async function onAddRemainingFollowUps() {
    if (followupBusy || pendingFollowups.length === 0) return;
    setAddingAll(true);
    let added = 0;
    try {
      for (const item of pendingFollowups) {
        await addFollowUp(item);
        added += 1;
      }
      flash?.(added === 1 ? "Added card" : `Added ${added} cards`);
    } catch (err) {
      flash?.(
        added
          ? `Added ${added} card${added === 1 ? "" : "s"}; ${err.message || "stopped"}`
          : err.message || "Could not add cards"
      );
    } finally {
      setAddingAll(false);
    }
  }

  function onClearFollowUp(item) {
    const key = followUpKey(item);
    setClearedKeys(saveClearedFollowUpKeys(withClearedFollowUp(clearedKeys, item)));
    if (key) {
      setCheckedFollowUpKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
    flash?.("Cleared follow-up");
  }

  function onClearAllFollowUps() {
    // Clear the full pool (not just the capped visible list).
    const pool = accountFollowups.length ? accountFollowups : followups;
    if (pool.length === 0) return;
    setClearedKeys(saveClearedFollowUpKeys(withClearedFollowUps(clearedKeys, pool)));
    clearCheckedFollowUps();
    flash?.(pool.length === 1 ? "Cleared follow-up" : `Cleared ${pool.length} follow-ups`);
  }

  function onClearCheckedFollowUps() {
    if (checkedFollowups.length === 0) return;
    setClearedKeys(
      saveClearedFollowUpKeys(withClearedFollowUps(clearedKeys, checkedFollowups))
    );
    const n = checkedFollowups.length;
    clearCheckedFollowUps();
    flash?.(n === 1 ? "Cleared follow-up" : `Cleared ${n} follow-ups`);
  }

  async function onAddCheckedFollowUps() {
    if (followupBusy || checkedPendingFollowups.length === 0) return;
    setAddingAll(true);
    let added = 0;
    try {
      for (const item of checkedPendingFollowups) {
        await addFollowUp(item);
        added += 1;
      }
      clearCheckedFollowUps();
      flash?.(added === 1 ? "Added card" : `Added ${added} cards`);
    } catch (err) {
      flash?.(
        added
          ? `Added ${added} card${added === 1 ? "" : "s"}; ${err.message || "stopped"}`
          : err.message || "Could not add cards"
      );
    } finally {
      setAddingAll(false);
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

  function renderFollowUpRow(item, index, { hideAccount = false } = {}) {
    const key = followUpKey(item) || `${item.rel_path}-${index}`;
    const pocId = pocIdForItem(item, pocs);
    const onBoard = isFollowUpOnBoard(item, tasks, {
      account: item.account || selectedKey,
      pocId,
    });
    const checked = checkedFollowUpKeys.has(key);
    const accountKey = meetingAccountKey(item) || item.account || "";
    const when = [formatMeetingDate(item.started_at), formatMeetingTime(item.started_at)]
      .filter(Boolean)
      .join(" · ");
    return (
      <div
        key={`${key}-${index}`}
        className={`meeting-followup-row${checked ? " is-checked" : ""}`}
      >
        <label className="meetings-catalog-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            disabled={followupBusy}
            onChange={(e) => toggleFollowUpChecked(key, e.target.checked)}
            aria-label={`Select follow-up: ${item.text || key}`}
          />
        </label>
        <div className="meeting-followup-main">
          <div className="meeting-followup-meta">
            {!hideAccount && accountKey ? (
              <AccountPill akey={accountKey} accountMap={accountMap} />
            ) : null}
            {when ? <span>{when}</span> : null}
          </div>
          <button
            type="button"
            className="meeting-followup-text"
            onClick={() =>
              openMeeting({
                rel_path: item.rel_path,
                account: item.account,
                poc: item.poc,
                started_at: item.started_at,
              })
            }
          >
            {item.text}
          </button>
        </div>
        {onBoard ? (
          <span className="meeting-followup-status">On board</span>
        ) : (
          <button
            type="button"
            className="meeting-add-card"
            disabled={followupBusy}
            onClick={() => onAddFollowUpCard(item)}
          >
            {addingKey === key ? "Adding…" : "Add"}
          </button>
        )}
        <button type="button" className="meeting-clear" onClick={() => onClearFollowUp(item)}>
          Clear
        </button>
      </div>
    );
  }

  const detailTitle =
    selectedTopic || meetingPocName(selectedHit) || meta.poc || "Call";
  const followupTabCount = selectedPath
    ? meetingFollowups.length
    : visibleFollowups.length;

  return (
    <div className="meetings-view">
      <div className="meetings-toolbar">
        {aes.length > 0 && (
          <div className="filter-group">
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
        <div className="filter-group">
          <span className="filter-label">Account</span>
          <select
            className="filter-select meetings-account-select"
            value={selectedKey}
            onChange={(e) => {
              closeReader();
              chooseAccount(e.target.value || ALL_KEY);
            }}
            aria-label="Account"
          >
            <option value={ALL_KEY}>
              All meetings{totalCount ? ` (${totalCount})` : ""}
            </option>
            {railGroups.map((group) => {
              const account = group.account;
              const count = counts.get(account.key) || group.meetings.length;
              return (
                <option key={account.key} value={account.key}>
                  {account.label || account.long || account.key}
                  {count ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
        </div>
        <input
          className="meetings-search"
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search…"
          aria-label="Search meetings"
        />
        <div className="meetings-toolbar-actions">
          <button type="button" onClick={syncAccounts} disabled={syncing} title="Sync accounts">
            {syncing ? "Syncing…" : "Sync"}
          </button>
          <a className="btn-link" href={ACCOUNTS_SHEET_URL} target="_blank" rel="noreferrer">
            Sheet
          </a>
          {status === "ok" && (
            <button type="button" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
          {status !== "unavailable" && (
            <a className="btn-link" href={url} target="_blank" rel="noreferrer">
              Scrappy
            </a>
          )}
        </div>
      </div>

      <div className="meetings-workspace">
        <section className="meetings-pane meetings-pane-list" aria-label="Meetings">
          <div className="meetings-pane-head">
            <h3>Meetings</h3>
            <span className="meetings-pane-meta">
              {status === "ok"
                ? `${shownCount}${query ? " matching" : showArchived ? "" : " · 2 wks"}`
                : "—"}
            </span>
          </div>
          <div className="meetings-pane-body">
            {status === "loading" && <div className="meetings-empty">Loading…</div>}
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
                    ? "No meetings in the last 2 weeks for this account."
                    : "No meetings in the last 2 weeks."}
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
                    const excerpt = meetingListSummary(hit);
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
                              {excerpt ? (
                                <div className="meeting-row-snippet">{excerpt}</div>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        </section>

        <section className="meetings-pane meetings-pane-detail" aria-label="Meeting detail">
          {selectedPath ? (
            <>
              <div className="meetings-pane-head">
                <div className="meetings-detail-heading">
                  <div className="meeting-summary-title">{detailTitle}</div>
                  <div className="meeting-summary-meta">
                    {selectedHit?.account || selected?.key || meta.account ? (
                      <AccountPill
                        akey={selectedHit?.account || selected?.key || meta.account}
                        accountMap={accountMap}
                      />
                    ) : null}
                    {meta.poc ? <span>{meta.poc}</span> : null}
                    {meta.startedAt ? (
                      <span>
                        {[formatMeetingDate(meta.startedAt), formatMeetingTime(meta.startedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {selectedLabels.length ? <MeetingLabels labels={selectedLabels} /> : null}
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
                <div className="meetings-detail-tabs" role="tablist" aria-label="Meeting sections">
                  {DETAIL_TABS.map((tab) => {
                    const active = detailTab === tab.key;
                    const count =
                      tab.key === "followups" && followupTabCount > 0 ? followupTabCount : null;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`chip${active ? " active" : ""}`}
                        onClick={() => setDetailTab(tab.key)}
                      >
                        {tab.label}
                        {count != null ? (
                          <span className="meetings-detail-tab-count">{count}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className={`meetings-pane-body${
                  detailTab === "followups" ? " is-followups" : ""
                }`}
                role="tabpanel"
              >
                {detailTab === "summary" ? (
                  notesLoading && !summary ? (
                    <div className="meetings-empty">Loading summary…</div>
                  ) : notesError && !summary ? (
                    <div className="meetings-empty">{notesError}</div>
                  ) : (
                    <div className="meeting-summary">
                      {summary || "No summary indexed for this call."}
                    </div>
                  )
                ) : null}
                {detailTab === "notes" ? (
                  notesLoading ? (
                    <div className="meetings-empty">Loading notes…</div>
                  ) : notesError ? (
                    <div className="meetings-empty">{notesError}</div>
                  ) : (
                    <div className="meeting-reader-notes">
                      {detail?.notes || "No notes indexed."}
                    </div>
                  )
                ) : null}
                {detailTab === "followups" ? (
                  status === "ok" && visibleFollowups.length === 0 ? (
                    <div className="meetings-empty">No open follow-ups.</div>
                  ) : status === "ok" ? (
                    <>
                      <div className="meetings-bulk-bar">
                        <label className="meetings-bulk-select-all">
                          <input
                            type="checkbox"
                            checked={checkedAllFollowups}
                            disabled={followupBusy}
                            onChange={toggleSelectAllFollowUps}
                          />
                          <span>
                            {checkedFollowUpCount
                              ? `${checkedFollowUpCount} selected`
                              : `Select all (${visibleFollowups.length})`}
                          </span>
                        </label>
                        {checkedFollowUpCount > 0 ? (
                          <div className="meetings-bulk-actions">
                            {checkedPendingFollowups.length > 0 ? (
                              <button
                                type="button"
                                disabled={followupBusy}
                                onClick={onAddCheckedFollowUps}
                              >
                                {addingAll
                                  ? "Adding…"
                                  : `Add (${checkedPendingFollowups.length})`}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={followupBusy}
                              onClick={onClearCheckedFollowUps}
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              disabled={followupBusy}
                              onClick={clearCheckedFollowUps}
                            >
                              Clear selection
                            </button>
                          </div>
                        ) : (
                          <div className="meetings-bulk-actions">
                            {pendingFollowups.length > 0 ? (
                              <button
                                type="button"
                                disabled={followupBusy}
                                onClick={onAddRemainingFollowUps}
                              >
                                {addingAll
                                  ? "Adding…"
                                  : `Add remaining (${pendingFollowups.length})`}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="meeting-clear"
                              disabled={followupBusy}
                              onClick={onClearAllFollowUps}
                            >
                              Clear all
                            </button>
                          </div>
                        )}
                      </div>
                      {selectedPath && meetingFollowups.length > 0 ? (
                        <div className="meetings-followup-section">
                          <div className="meetings-followup-section-label">This meeting</div>
                          {meetingFollowups.map((item, index) =>
                            renderFollowUpRow(item, `meeting-${index}`, {
                              hideAccount: Boolean(selectedKey),
                            })
                          )}
                        </div>
                      ) : null}
                      {selectedPath &&
                      meetingFollowups.length === 0 &&
                      otherFollowups.length > 0 ? (
                        <div className="meetings-empty">No follow-ups for this meeting.</div>
                      ) : null}
                      {otherFollowups.length > 0 ? (
                        <div className="meetings-followup-section">
                          {selectedPath ? (
                            <div className="meetings-followup-section-label">Other</div>
                          ) : null}
                          {otherFollowups.map((item, index) =>
                            renderFollowUpRow(item, `other-${index}`, {
                              hideAccount: Boolean(selectedKey),
                            })
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="meetings-empty">No open follow-ups.</div>
                  )
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="meetings-pane-head">
                <h3>Detail</h3>
              </div>
              <div className="meetings-pane-body">
                <div className="meetings-empty">Select a meeting to read its summary and notes.</div>
              </div>
            </>
          )}
        </section>
      </div>

      {moveOpen && movePaths.length ? (
        <MeetingMoveDialog
          key={movePaths.join("|")}
          open
          accounts={accounts}
          pocs={pocs}
          initialAccount={
            movePaths.length === 1 ? meta.account || selectedHit?.account || "" : ""
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
