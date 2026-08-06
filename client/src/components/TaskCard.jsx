import { dueDateStatus } from "../helpers.js";
import { AccountPill, DueDatePill, LabelPill } from "./Pills.jsx";

export default function TaskCard({ task, accountMap, isDragging, onOpen, compactMeta = false }) {
  const overdue = dueDateStatus(task.dueDate) === "overdue" && task.stage !== "done" && task.stage !== "archive";
  const progress = task.subtaskProgress;
  const pct =
    progress?.total > 0 ? Math.round((100 * (progress.done || 0)) / progress.total) : null;

  return (
    <div
      className={`task-card${isDragging ? " dragging" : ""}${overdue ? " overdue" : ""}`}
      onClick={() => onOpen?.(task)}
    >
      <div className="task-card-title">{task.title}</div>
      <div className="task-card-meta">
        {!compactMeta && task.account && (
          <AccountPill akey={task.account} accountMap={accountMap} />
        )}
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
