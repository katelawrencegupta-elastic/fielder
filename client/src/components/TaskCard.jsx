import { useEffect, useRef, useState } from "react";
import { dueDateStatus, normalizeWorkstream } from "../helpers.js";
import { AccountPill, DueDatePill, LabelPill, PocPill } from "./Pills.jsx";

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host.includes("docs.google.com")) return "Google Doc";
    if (host.includes("drive.google.com")) return "Google Drive";
    if (host.includes("github.com")) return "GitHub";
    const path = u.pathname.replace(/\/$/, "");
    const tail = path.split("/").filter(Boolean).pop();
    if (tail && tail.length <= 28) return `${host}/…/${tail}`;
    return host;
  } catch {
    return "Link";
  }
}

function TitleWithLinks({ title }) {
  const parts = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let match;
  while ((match = re.exec(title)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: title.slice(last, match.index) });
    parts.push({ type: "url", value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < title.length) parts.push({ type: "text", value: title.slice(last) });
  if (parts.length === 0) parts.push({ type: "text", value: title });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "url" ? (
          <a
            key={i}
            href={p.value}
            target="_blank"
            rel="noreferrer"
            className="task-card-link"
            title={p.value}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {shortenUrl(p.value)}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  );
}

export default function TaskCard({
  task,
  accountMap,
  pocMap = {},
  isDragging,
  onOpen,
  onRename,
  quickMoveStages = null,
  quickMoveWorkstreams = null,
  onQuickMove = null,
  compactMeta = false,
  hidePocLabel = false,
}) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title || "");
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const inputRef = useRef(null);
  const skipCommitRef = useRef(false);
  const skipOpenAfterDragRef = useRef(false);

  useEffect(() => {
    if (!editing) setTitleDraft(task.title || "");
  }, [task.title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (isDragging) skipOpenAfterDragRef.current = true;
  }, [isDragging]);

  const overdue =
    dueDateStatus(task.dueDate) === "overdue" &&
    task.stage !== "done" &&
    task.stage !== "archive";
  const progress = task.subtaskProgress;
  const pct =
    progress?.total > 0 ? Math.round((100 * (progress.done || 0)) / progress.total) : null;
  const linkedPoc =
    task.pocId != null
      ? pocMap[task.pocId] || { id: task.pocId, title: `POC #${task.pocId}` }
      : null;

  const stageOptions = Array.isArray(quickMoveStages)
    ? quickMoveStages.filter((s) => s.key !== task.stage)
    : [];
  const workstreamOptions = Array.isArray(quickMoveWorkstreams)
    ? quickMoveWorkstreams.filter((w) => w.key !== normalizeWorkstream(task.workstream))
    : [];
  const canQuickMove =
    !!onQuickMove && (stageOptions.length > 0 || workstreamOptions.length > 0);

  function startRename(e) {
    if (!onRename) return;
    e.preventDefault();
    e.stopPropagation();
    setTitleDraft(task.title || "");
    setEditing(true);
  }

  async function commitRename() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    if (!onRename || saving) return;
    const next = titleDraft.trim();
    if (!next || next === (task.title || "").trim()) {
      setEditing(false);
      setTitleDraft(task.title || "");
      return;
    }
    setSaving(true);
    try {
      await onRename(task, next);
      setEditing(false);
    } catch {
      setTitleDraft(task.title || "");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelRename() {
    skipCommitRef.current = true;
    setEditing(false);
    setTitleDraft(task.title || "");
  }

  async function moveTo(raw) {
    if (!onQuickMove || moving || !raw) return;
    let patch = null;
    if (raw.startsWith("stage:")) patch = { stage: raw.slice(6) };
    else if (raw.startsWith("workstream:")) patch = { workstream: raw.slice(11) };
    else patch = { stage: raw };
    if (!patch) return;
    setMoving(true);
    try {
      await onQuickMove(task, patch);
    } finally {
      setMoving(false);
    }
  }

  return (
    <div
      className={`task-card${isDragging ? " dragging" : ""}${overdue ? " overdue" : ""}${
        editing ? " is-editing" : ""
      }${task.category === "demo_workshop" ? " is-demo" : ""}`}
      onClick={() => {
        if (editing) return;
        if (skipOpenAfterDragRef.current) {
          skipOpenAfterDragRef.current = false;
          return;
        }
        onOpen?.(task);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="task-card-title-input"
          value={titleDraft}
          disabled={saving}
          onChange={(e) => setTitleDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={() => commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
        />
      ) : (
        <div
          className="task-card-title"
          title={onRename ? "Double-click to rename" : undefined}
          onDoubleClick={startRename}
        >
          <TitleWithLinks title={task.title || ""} />
        </div>
      )}
      <div className="task-card-meta">
        {!compactMeta && task.account && (
          <AccountPill akey={task.account} accountMap={accountMap} />
        )}
        {!hidePocLabel && linkedPoc && <PocPill poc={linkedPoc} />}
        <DueDatePill dueDate={task.dueDate} />
        {(task.labels || []).slice(0, compactMeta ? 2 : 3).map((l) => (
          <LabelPill key={l} label={l} />
        ))}
        {(task.labels || []).length > (compactMeta ? 2 : 3) && (
          <span style={{ fontSize: 10, color: "var(--color-text-dim)" }}>
            +{task.labels.length - (compactMeta ? 2 : 3)}
          </span>
        )}
        {canQuickMove && (
          <select
            className={`task-card-move-select${
              workstreamOptions.length ? " task-card-move-select--wide" : ""
            }`}
            value=""
            disabled={moving}
            aria-label="Move card"
            title="Move to column or workstream"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = e.target.value;
              e.target.value = "";
              moveTo(next);
            }}
          >
            <option value="" disabled>
              {moving ? "…" : "Move"}
            </option>
            {stageOptions.length > 0 && (
              <optgroup label="Column">
                {stageOptions.map((s) => (
                  <option key={`stage:${s.key}`} value={`stage:${s.key}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
            {workstreamOptions.length > 0 && (
              <optgroup label="Workstream">
                {workstreamOptions.map((w) => (
                  <option key={`workstream:${w.key}`} value={`workstream:${w.key}`}>
                    {w.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </div>
      {pct != null && (
        <div className="subtask-bar" title={`${progress.done}/${progress.total} subtasks`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
