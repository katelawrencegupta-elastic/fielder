import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { AccountPill, AddLabelInput, LabelPill } from "./Pills.jsx";
import { isTcStage } from "../helpers.js";

export default function TaskDrawer({
  task,
  stages,
  accountMap,
  pocs,
  allLabels,
  onClose,
  onUpdated,
  onDeleted,
  allowTcStages = false,
}) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subText, setSubText] = useState("");
  const [error, setError] = useState("");

  const stageOptions = useMemo(() => {
    const showTc = allowTcStages || !!task?.pocId;
    return stages.filter((s) => {
      if (s.key === "archive") return true;
      if (!showTc && isTcStage(s.key)) {
        // Keep current stage visible even if it's a TC column
        return draft?.stage === s.key || task?.stage === s.key;
      }
      return true;
    });
  }, [stages, allowTcStages, task?.pocId, task?.stage, draft?.stage]);

  useEffect(() => {
    setDraft(task ? { ...task } : null);
    setError("");
    setSubText("");
  }, [task]);

  if (!task || !draft) return null;

  async function save(patch) {
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateTask(task.id, patch);
      setDraft(updated);
      onUpdated(updated);
      return updated;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function persistField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
    await save({ [key]: value });
  }

  async function addSubtask() {
    const text = subText.trim();
    if (!text) return;
    setSaving(true);
    try {
      const updated = await api.addSubtask(task.id, text);
      setDraft(updated);
      onUpdated(updated);
      setSubText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSub(sub) {
    const updated = await api.updateSubtask(task.id, sub.id, { done: !sub.done });
    setDraft(updated);
    onUpdated(updated);
  }

  async function removeSub(sub) {
    const updated = await api.deleteSubtask(task.id, sub.id);
    setDraft(updated);
    onUpdated(updated);
  }

  async function addLabel(label) {
    const updated = await api.addLabel(task.id, label);
    setDraft(updated);
    onUpdated(updated);
  }

  async function removeLabel(label) {
    const updated = await api.removeLabel(task.id, label);
    setDraft(updated);
    onUpdated(updated);
  }

  async function archive() {
    await persistField("stage", "archive");
    onClose();
  }

  async function unarchive() {
    await persistField("stage", "backlog");
  }

  async function remove() {
    if (!window.confirm(`Delete task “${task.title}”?`)) return;
    await api.deleteTask(task.id);
    onDeleted(task.id);
    onClose();
  }

  const isArchived = draft.stage === "archive";

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Title</label>
              <input
                className="drawer-title-input"
                value={draft.title || ""}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={() => {
                  const next = (draft.title || "").trim();
                  if (!next) {
                    setDraft((d) => ({ ...d, title: task.title }));
                    return;
                  }
                  if (next !== task.title) persistField("title", next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft((d) => ({ ...d, title: task.title }));
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <AccountPill
                akey={draft.account}
                accountMap={accountMap}
                onChange={(key) => persistField("account", key)}
              />
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "none", fontSize: 20, padding: "0 4px" }}>
            ×
          </button>
        </div>

        <div className="drawer-body">
          {error && (
            <div style={{ color: "var(--color-red)", fontSize: 12, fontFamily: "monospace" }}>{error}</div>
          )}

          <div className="field">
            <label>Description</label>
            <textarea
              rows={4}
              value={draft.description || ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              onBlur={() => {
                const next = draft.description || null;
                if (next !== (task.description || null)) persistField("description", next);
              }}
              placeholder="Notes…"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Stage</label>
              <select
                value={draft.stage || ""}
                onChange={(e) => persistField("stage", e.target.value)}
              >
                {stageOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Category</label>
              <select
                value={draft.category || "general"}
                onChange={(e) => persistField("category", e.target.value)}
              >
                <option value="general">General</option>
                <option value="demo_workshop">Demo / workshop</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={draft.startDate || ""}
                onChange={(e) => persistField("startDate", e.target.value || null)}
              />
            </div>
            <div className="field">
              <label>Due date</label>
              <input
                type="date"
                value={draft.dueDate || ""}
                onChange={(e) => persistField("dueDate", e.target.value || null)}
              />
            </div>
          </div>

          <div className="field">
            <label>POC</label>
            <select
              value={draft.pocId || ""}
              onChange={(e) =>
                persistField("pocId", e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">None</option>
              {pocs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.folderName}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Labels</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(draft.labels || []).map((l) => (
                <LabelPill key={l} label={l} onRemove={removeLabel} />
              ))}
              <AddLabelInput onAdd={addLabel} existing={draft.labels || []} all={allLabels} />
            </div>
          </div>

          <div className="field">
            <label>Subtasks</label>
            <div>
              {(draft.subtasks || []).map((s) => (
                <div key={s.id} className="subtask-row">
                  <input
                    type="checkbox"
                    checked={!!s.done}
                    onChange={() => toggleSub(s)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      textDecoration: s.done ? "line-through" : "none",
                      color: s.done ? "var(--color-text-dim)" : "var(--color-text)",
                    }}
                  >
                    {s.text}
                  </span>
                  <button type="button" onClick={() => removeSub(s)} style={{ border: "none", padding: 2 }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                value={subText}
                onChange={(e) => setSubText(e.target.value)}
                placeholder="Add subtask…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSubtask();
                }}
                style={{ flex: 1 }}
              />
              <button type="button" className="primary" onClick={addSubtask} disabled={saving || !subText.trim()}>
                Add
              </button>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "var(--color-text-dim)", fontFamily: "monospace" }}>
            id {task.id} · source {task.source || "manual"}
            {task.updatedAt ? ` · updated ${new Date(task.updatedAt).toLocaleString()}` : ""}
          </div>
        </div>

        <div className="drawer-footer">
          {isArchived ? (
            <button type="button" onClick={unarchive} disabled={saving}>
              Unarchive
            </button>
          ) : (
            <button type="button" onClick={archive} disabled={saving}>
              Archive
            </button>
          )}
          <button type="button" className="danger" onClick={remove}>
            Delete
          </button>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto" }}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
