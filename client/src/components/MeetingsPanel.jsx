import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import MeetingMoveDialog from "./MeetingMoveDialog.jsx";
import MeetingReaderActions from "./MeetingReaderActions.jsx";
import { MeetingLabels } from "./Pills.jsx";
import {
  meetingListLabels,
  meetingTopic,
  sortMeetingsNewestFirst,
} from "../report/dailySummary.js";
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

const FOLLOWUP_LIMIT = 50;
const DOCKS = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
];

function formatStamp(value) {
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

export default function MeetingsPanel({
  account,
  poc = "",
  pocId = null,
  tasks = [],
  accounts = [],
  pocs = [],
  defaultAccount,
  defaultStage = "backlog",
  variant = "dock",
  dock = "right",
  onDockChange,
  onCountChange,
  onTaskCreated,
  flash,
}) {
  const [status, setStatus] = useState("loading");
  const [hits, setHits] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [url, setUrl] = useState("http://127.0.0.1:8787/");
  const [selectedPath, setSelectedPath] = useState(null);
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [addingKey, setAddingKey] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const [clearedKeys, setClearedKeys] = useState(() => loadClearedFollowUpKeys());
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const openPathRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    openPathRef.current = null;
    setSelectedPath(null);
    setNotes("");
    setNotesError("");
    setNotesLoading(false);
    setHits([]);
    setFollowups([]);

    Promise.all([
      api.searchMeetings({ account, poc, k: 30 }),
      api.getMeetingFollowups({ account, poc }),
      api.getMeetingsHealth().catch(() => ({ unavailable: true })),
    ])
      .then(([search, followup, health]) => {
        if (cancelled) return;
        const scrappyUrl = search.url || followup.url || health.url || "http://127.0.0.1:8787/";
        setUrl(scrappyUrl);
        if (search.unavailable) {
          setStatus("unavailable");
          onCountChange?.(0);
          return;
        }
        const nextHits = sortMeetingsNewestFirst(search.hits || []);
        setHits(nextHits);
        setFollowups(followup.unavailable ? [] : followup.items || []);
        setStatus("ok");
        onCountChange?.(nextHits.length);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatus("error");
        onCountChange?.(0);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, poc, reloadToken]);

  const visibleFollowups = useMemo(
    () => openFollowUps(followups, clearedKeys, FOLLOWUP_LIMIT),
    [followups, clearedKeys]
  );
  const pendingFollowups = useMemo(
    () =>
      visibleFollowups.filter(
        (item) => !isFollowUpOnBoard(item, tasks, { account: defaultAccount || account, pocId })
      ),
    [visibleFollowups, tasks, defaultAccount, account, pocId]
  );

  const busy = Boolean(addingKey) || addingAll;
  const page = variant === "page";
  const selectedHit = hits.find((hit) => hit.rel_path === selectedPath) || null;

  function closeReader() {
    openPathRef.current = null;
    setSelectedPath(null);
    setNotes("");
    setNotesError("");
    setNotesLoading(false);
  }

  async function onArchiveMeeting() {
    const path = selectedPath;
    if (!path || lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await api.archiveMeeting(path);
      flash?.("Meeting archived");
      closeReader();
      setReloadToken((n) => n + 1);
    } catch (err) {
      flash?.(err.message || "Could not archive meeting");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onUnarchiveMeeting() {
    const path = selectedPath;
    if (!path || lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await api.unarchiveMeeting(path);
      flash?.("Meeting restored");
      closeReader();
      setReloadToken((n) => n + 1);
    } catch (err) {
      flash?.(err.message || "Could not unarchive meeting");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onDeleteMeeting() {
    const path = selectedPath;
    if (!path || lifecycleBusy) return;
    const ok = window.confirm(
      "Permanently delete this meeting? Transcript files and notes will be removed."
    );
    if (!ok) return;
    setLifecycleBusy(true);
    try {
      await api.deleteMeeting(path);
      flash?.("Meeting deleted");
      closeReader();
      setReloadToken((n) => n + 1);
    } catch (err) {
      flash?.(err.message || "Could not delete meeting");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onMoveMeeting({ account: nextAccount, poc: nextPoc }) {
    const path = selectedPath;
    if (!path || lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      const result = await api.moveMeeting(path, { account: nextAccount, poc: nextPoc });
      const nextPath = result?.path || path;
      flash?.("Meeting moved");
      setMoveOpen(false);
      setReloadToken((n) => n + 1);
      if (nextPath) {
        await openMeeting(nextPath);
      } else {
        closeReader();
      }
    } catch (err) {
      flash?.(err.message || "Could not move meeting");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function openMeeting(relPath) {
    openPathRef.current = relPath;
    setSelectedPath(relPath);
    setNotesError("");
    setNotes("");
    setNotesLoading(true);
    try {
      const meeting = await api.getMeetingNotes(relPath);
      if (openPathRef.current !== relPath) return;
      if (meeting.unavailable) {
        setNotesError("Meeting notes unavailable. Start Scrappy → Search meetings.");
        return;
      }
      setNotes(meeting.notes || "");
    } catch (err) {
      if (openPathRef.current !== relPath) return;
      setNotesError(err.message || "Could not load notes.");
    } finally {
      if (openPathRef.current === relPath) setNotesLoading(false);
    }
  }

  async function addFollowUp(item) {
    const body = followUpToTaskBody(item, {
      pocId,
      account: defaultAccount || account || item.account,
      stage: defaultStage,
    });
    if (!body) return null;
    const created = await api.createTask(body);
    onTaskCreated?.(created);
    return created;
  }

  async function onAddCard(item) {
    const key = followUpKey(item);
    if (addingKey || addingAll || isFollowUpOnBoard(item, tasks, { account: defaultAccount || account, pocId })) return;
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

  async function onAddRemaining() {
    if (addingAll || addingKey || pendingFollowups.length === 0) return;
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
    const next = saveClearedFollowUpKeys(withClearedFollowUp(clearedKeys, item));
    setClearedKeys(next);
    flash?.("Cleared follow-up");
  }

  function onClearAllFollowUps() {
    if (visibleFollowups.length === 0) return;
    const next = saveClearedFollowUpKeys(
      withClearedFollowUps(clearedKeys, visibleFollowups)
    );
    setClearedKeys(next);
    flash?.(
      visibleFollowups.length === 1
        ? "Cleared follow-up"
        : `Cleared ${visibleFollowups.length} follow-ups`
    );
  }

  return (
    <aside className={`meetings-dock ${page ? "is-page" : `is-${dock}`}`}>
      <div className="meetings-panel-header">
        <div className="filter-label" style={{ marginBottom: 0 }}>
          Meetings{status === "ok" ? ` (${hits.length})` : ""}
        </div>
        <div className="meetings-dock-actions">
          {!page && onDockChange && (
            <div className="meetings-dock-chips" role="group" aria-label="Dock meetings pane">
              {DOCKS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`chip${dock === opt.key ? " active" : ""}`}
                  aria-pressed={dock === opt.key}
                  onClick={() => onDockChange(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {status !== "unavailable" && (
            <a className="btn-link" href={url} target="_blank" rel="noreferrer">
              Open in Scrappy
            </a>
          )}
        </div>
      </div>

      <div className={`meetings-dock-body${page && selectedPath ? " has-reader" : ""}`}>
      <div className="meetings-panel-scroll">
      {status === "loading" && (
        <div className="meetings-empty">Loading meetings…</div>
      )}
      {status === "unavailable" && (
        <div className="meetings-empty">
          Meeting notes unavailable. Start Scrappy → Search meetings.
        </div>
      )}
      {status === "error" && (
        <div className="meetings-empty">Could not load meeting notes.</div>
      )}
      {status === "ok" && visibleFollowups.length > 0 && (
        <div className="meeting-followups">
          <div className="meetings-panel-header">
            <div className="filter-label" style={{ marginBottom: 0 }}>
              Open follow-ups
            </div>
            <div className="meetings-followup-actions">
              <button type="button" className="meeting-clear" onClick={onClearAllFollowUps}>
                Clear all
              </button>
              {pendingFollowups.length > 0 && (pocId != null || account) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAddRemaining}
                >
                  {addingAll
                    ? "Adding…"
                    : `Add remaining (${pendingFollowups.length})`}
                </button>
              )}
            </div>
          </div>
          {visibleFollowups.map((item, index) => {
            const key = followUpKey(item) || `${item.rel_path}-${index}`;
            const onBoard = isFollowUpOnBoard(item, tasks, {
              account: defaultAccount || account,
              pocId,
            });
            return (
              <div key={`${key}-${index}`} className="meeting-followup-row">
                <button
                  type="button"
                  className="meeting-followup-text"
                  onClick={() => openMeeting(item.rel_path)}
                >
                  {item.text}
                </button>
                {onBoard ? (
                  <span className="meeting-followup-status">On board</span>
                ) : (
                  <button
                    type="button"
                    className="meeting-add-card"
                    disabled={busy || !(account || pocId != null)}
                    onClick={() => onAddCard(item)}
                  >
                    {addingKey === key ? "Adding…" : "Add card"}
                  </button>
                )}
                <button
                  type="button"
                  className="meeting-clear"
                  onClick={() => onClearFollowUp(item)}
                >
                  Clear
                </button>
              </div>
            );
          })}
        </div>
      )}
      {status === "ok" && hits.length === 0 && (
        <div className="meetings-empty">No recorded meetings for this account.</div>
      )}
      {page && status === "ok" && hits.length > 0 && !selectedPath && (
        <div className="meetings-empty">Click a meeting to read the notes on the right.</div>
      )}
      {status === "ok" &&
        hits.map((hit) => (
          <button
            key={hit.rel_path}
            type="button"
            className={`meeting-row${selectedPath === hit.rel_path ? " is-active" : ""}`}
            onClick={() => openMeeting(hit.rel_path)}
          >
            <div className="meeting-row-meta">
              {formatStamp(hit.started_at)}
              {hit.poc ? ` · ${hit.poc}` : ""}
            </div>
            {meetingTopic(hit) ? (
              <div className="report-item-title">{meetingTopic(hit)}</div>
            ) : hit.snippet ? (
              <div className="meeting-row-snippet">{hit.snippet}</div>
            ) : null}
            <MeetingLabels labels={meetingListLabels(hit)} />
          </button>
        ))}
      </div>
      {page && selectedPath && (
        <section className="meeting-reader" aria-label="Meeting notes">
          <div className="meeting-reader-header">
            <div className="meeting-reader-meta">
              <div className="meeting-reader-title">
                {formatStamp(selectedHit?.started_at) || "Meeting notes"}
              </div>
              <div className="meeting-reader-sub">
                {[selectedHit?.poc, selectedHit?.kind].filter(Boolean).join(" · ") ||
                  "Meeting notes"}
              </div>
            </div>
            <MeetingReaderActions
              archived={Boolean(selectedHit?.archived)}
              busy={lifecycleBusy}
              onMove={accounts.length ? () => setMoveOpen(true) : undefined}
              onArchive={onArchiveMeeting}
              onUnarchive={onUnarchiveMeeting}
              onDelete={onDeleteMeeting}
              onClose={closeReader}
            />
          </div>
          <div className="meeting-reader-body">
            {notesLoading ? (
              <div className="meetings-empty">Loading notes…</div>
            ) : notesError ? (
              <div className="meetings-empty">{notesError}</div>
            ) : (
              <div className="meeting-reader-notes">{notes || "No notes indexed."}</div>
            )}
          </div>
        </section>
      )}
      {!page && selectedPath && (
        <div className="meeting-notes-wrap">
          <MeetingReaderActions
            archived={Boolean(selectedHit?.archived)}
            busy={lifecycleBusy}
            onMove={accounts.length ? () => setMoveOpen(true) : undefined}
            onArchive={onArchiveMeeting}
            onUnarchive={onUnarchiveMeeting}
            onDelete={onDeleteMeeting}
            onClose={closeReader}
          />
          {notesError ? (
            <div className="meetings-empty">{notesError}</div>
          ) : (
            <pre className="meeting-notes">{notes || "No notes indexed."}</pre>
          )}
        </div>
      )}
      </div>
      {moveOpen && selectedPath && accounts.length ? (
        <MeetingMoveDialog
          key={selectedPath}
          open
          accounts={accounts}
          pocs={pocs}
          initialAccount={selectedHit?.account || account || defaultAccount || ""}
          initialPoc={selectedHit?.poc || poc || ""}
          busy={lifecycleBusy}
          onClose={() => setMoveOpen(false)}
          onConfirm={onMoveMeeting}
        />
      ) : null}
    </aside>
  );
}
