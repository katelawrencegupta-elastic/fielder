import { dueDateStatus, pillStyle, softPillFromAccent } from "../helpers.js";
import { AccountPill, DueDatePill, LabelPill } from "./Pills.jsx";

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
    <div className="task-card-title">
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
    </div>
  );
}

function PocPill({ poc }) {
  if (!poc) return null;
  const soft = softPillFromAccent("#2f6fad");
  const name = poc.title || poc.folderName || `POC ${poc.id}`;
  return (
    <span style={pillStyle(soft.bg, soft.color)} title={`Linked POC: ${name}`}>
      POC · {name}
    </span>
  );
}

export default function TaskCard({
  task,
  accountMap,
  pocMap = {},
  isDragging,
  onOpen,
  compactMeta = false,
  hidePocLabel = false,
}) {
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

  return (
    <div
      className={`task-card${isDragging ? " dragging" : ""}${overdue ? " overdue" : ""}`}
      onClick={() => onOpen?.(task)}
    >
      <TitleWithLinks title={task.title || ""} />
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
      </div>
      {pct != null && (
        <div className="subtask-bar" title={`${progress.done}/${progress.total} subtasks`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
