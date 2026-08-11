import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { isTcStage, POC_STATUSES, WORKSTREAMS } from "../helpers.js";
import { AccountPill, StatusPill } from "../components/Pills.jsx";
import KanbanView from "./KanbanView.jsx";

const POC_SWIM_KEY = "fielder.pocSwimlaneMode";

function loadPocSwimMode() {
  try {
    const v = sessionStorage.getItem(POC_SWIM_KEY);
    return v === "none" ? "none" : "workstream";
  } catch {
    return "workstream";
  }
}

export default function PocsView({
  pocs,
  accounts,
  accountMap,
  aeColors,
  stages,
  tasks,
  onPocsChange,
  onTasksChange,
  onStagesChange,
  onOpenTask,
  flash,
}) {
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [commits, setCommits] = useState([]);
  const [showCommits, setShowCommits] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showTaskArchive, setShowTaskArchive] = useState(false);
  const [showArchivedPocs, setShowArchivedPocs] = useState(false);
  const [pocSwimlaneMode, setPocSwimlaneMode] = useState(loadPocSwimMode);
  const [newOpen, setNewOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    account: "",
    stage: "backlog",
    workstream: "misc",
    dueDate: "",
  });

  const taskCountByPoc = useMemo(() => {
    const counts = {};
    for (const t of tasks) {
      if (t.pocId == null) continue;
      counts[t.pocId] = (counts[t.pocId] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const visiblePocs = useMemo(() => {
    if (showArchivedPocs) return pocs;
    return pocs.filter((p) => p.status !== "archived");
  }, [pocs, showArchivedPocs]);

  const archivedPocCount = useMemo(
    () => pocs.filter((p) => p.status === "archived").length,
    [pocs]
  );

  // Prefer a POC that already has tasks; fall back to first visible POC.
  useEffect(() => {
    if (!visiblePocs.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && visiblePocs.some((p) => p.id === selectedId)) return;
    const withTasks = visiblePocs.find((p) => (taskCountByPoc[p.id] || 0) > 0);
    setSelectedId((withTasks || visiblePocs[0]).id);
  }, [visiblePocs, selectedId, taskCountByPoc]);

  const selected = pocs.find((p) => p.id === selectedId) || null;
  const selectedIsArchived = selected?.status === "archived";

  useEffect(() => {
    if (!selected) {
      setCommits([]);
      return;
    }
    api
      .getPocCommits(selected.id)
      .then(setCommits)
      .catch((e) => console.error(e));
  }, [selected]);

  // Refresh POC list when this tab mounts so fields like notesUrl stay current.
  useEffect(() => {
    let cancelled = false;
    api
      .getPocs()
      .then((next) => {
        if (!cancelled) onPocsChange(next);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boardFilters = useMemo(
    () => ({ pocId: selected?.id ?? -1, ae: null, account: null, label: null }),
    [selected]
  );

  const boardTaskCount = selected ? taskCountByPoc[selected.id] || 0 : 0;

  async function sync() {
    setSyncing(true);
    try {
      const result = await api.syncPocs();
      const next = await api.getPocs();
      onPocsChange(next);
      flash?.(`Synced ${result.synced ?? next.length} POC folders`);
    } catch (e) {
      flash?.(e.message || "POC sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    const updated = await api.updatePoc(editing.id, {
      account: editing.account || null,
      title: editing.title || null,
      status: editing.status || null,
      startDate: editing.startDate || null,
      targetDemoDate: editing.targetDemoDate || null,
      owner: editing.owner || null,
      notesUrl: editing.notesUrl || null,
    });
    onPocsChange(pocs.map((p) => (p.id === updated.id ? updated : p)));
    setEditing(null);
    flash?.("POC updated");
  }

  async function setPocArchived(archived) {
    if (!selected) return;
    const updated = await api.updatePoc(selected.id, {
      status: archived ? "archived" : "planning",
    });
    onPocsChange(pocs.map((p) => (p.id === updated.id ? updated : p)));
    flash?.(archived ? "POC archived" : "POC restored");
    if (archived && !showArchivedPocs) {
      const next = pocs.find(
        (p) => p.id !== selected.id && p.status !== "archived"
      );
      setSelectedId(next?.id ?? null);
    }
  }

  function openNewTask() {
    if (!selected) return;
    const defaultStage =
      stages.find((s) => s.key === "backlog")?.key ||
      stages.find((s) => s.key !== "archive")?.key ||
      "backlog";
    setNewTask({
      title: "",
      account: selected.account || accounts[0]?.key || "other",
      stage: defaultStage,
      workstream: "misc",
      dueDate: "",
    });
    setNewOpen(true);
  }

  async function createTask(e) {
    e.preventDefault();
    if (!selected || !newTask.title.trim()) return;
    const created = await api.createTask({
      title: newTask.title.trim(),
      account: newTask.account || selected.account || "other",
      stage: newTask.stage || "backlog",
      workstream: newTask.workstream || "misc",
      dueDate: newTask.dueDate || null,
      category: "general",
      pocId: selected.id,
    });
    onTasksChange([created, ...tasks]);
    setNewOpen(false);
    setNewTask({
      title: "",
      account: newTask.account,
      stage: newTask.stage,
      workstream: newTask.workstream || "misc",
      dueDate: "",
    });
    flash?.("Task created");
  }

  const stageOptions = useMemo(
    () => stages.filter((s) => s.key !== "archive"),
    [stages]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="view-scroll" style={{ flex: "0 0 auto", paddingBottom: 0 }}>
        <div className="toolbar-row">
          <div style={{ fontSize: 13, color: "var(--color-text-mid)" }}>
            {visiblePocs.length} POC{visiblePocs.length === 1 ? "" : "s"}
            {archivedPocCount > 0 && !showArchivedPocs && (
              <span style={{ color: "var(--color-text-dim)" }}>
                {" "}
                · {archivedPocCount} archived
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {archivedPocCount > 0 && (
              <button type="button" onClick={() => setShowArchivedPocs((v) => !v)}>
                {showArchivedPocs ? "Hide archived POCs" : "Show archived POCs"}
              </button>
            )}
            {selected && (
              <>
                <button type="button" onClick={() => setShowTaskArchive((v) => !v)}>
                  {showTaskArchive ? "Hide task archive" : "Show task archive"}
                </button>
                <button type="button" onClick={() => setShowCommits((v) => !v)}>
                  {showCommits ? "Hide commits" : `Commits (${commits.length})`}
                </button>
                {selectedIsArchived ? (
                  <button type="button" onClick={() => setPocArchived(false)}>
                    Unarchive POC
                  </button>
                ) : (
                  <button type="button" onClick={() => setPocArchived(true)}>
                    Archive POC
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...selected,
                      startDate: selected.startDate || "",
                      targetDemoDate: selected.targetDemoDate || "",
                      owner: selected.owner || "",
                      title: selected.title || selected.folderName || "",
                      account: selected.account || "",
                      status: selected.status || "planning",
                      notesUrl: selected.notesUrl || "",
                    })
                  }
                >
                  Edit POC
                </button>
                {selected.notesUrl ? (
                  <a
                    className="btn-link"
                    href={selected.notesUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Notes doc
                  </a>
                ) : null}
                {selected.repoUrl ? (
                  <a className="btn-link" href={selected.repoUrl} target="_blank" rel="noreferrer">
                    Repo
                  </a>
                ) : null}
              </>
            )}
            <button type="button" className="primary" onClick={sync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync POCs"}
            </button>
          </div>
        </div>

        {visiblePocs.length === 0 ? (
          <div className="empty-state">
            {pocs.length === 0
              ? "No POCs yet. Hit Sync POCs to pull from GitHub."
              : "All POCs are archived. Show archived POCs to view them."}
          </div>
        ) : (
          <div className="poc-picker">
            {visiblePocs.map((poc) => {
              const active = selected?.id === poc.id;
              const count = taskCountByPoc[poc.id] || 0;
              return (
                <button
                  key={poc.id}
                  type="button"
                  className={`poc-picker-card${active ? " active" : ""}${
                    poc.status === "archived" ? " is-archived" : ""
                  }`}
                  onClick={() => setSelectedId(poc.id)}
                >
                  <div className="poc-picker-title">{poc.title || poc.folderName}</div>
                  <div className="poc-picker-meta">
                    {poc.account && <AccountPill akey={poc.account} accountMap={accountMap} />}
                    <StatusPill status={poc.status} />
                    <span className="poc-picker-count">
                      {count} task{count === 1 ? "" : "s"}
                    </span>
                    {poc.notesUrl ? (
                      <a
                        className="poc-picker-notes"
                        href={poc.notesUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open notes doc"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Notes
                      </a>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="poc-board-header">
            <div>
              <div style={{ fontSize: 15, fontWeight: 650 }}>{selected.title || selected.folderName}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-dim)", marginTop: 2 }}>
                {boardTaskCount} linked task{boardTaskCount === 1 ? "" : "s"}
                {selected.owner ? ` · ${selected.owner}` : ""}
                {(selected.startDate || selected.targetDemoDate) &&
                  ` · ${selected.startDate || "—"} → ${selected.targetDemoDate || "—"}`}
              </div>
            </div>
            <div className="poc-board-header-actions">
              {selected.notesUrl ? (
                <a
                  className="btn-link primary-link"
                  href={selected.notesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open notes doc
                </a>
              ) : null}
              <button type="button" className="primary" onClick={openNewTask}>
                New task
              </button>
            </div>
          </div>
        )}

        {showCommits && selected && (
          <div className="entity-card" style={{ marginBottom: 12 }}>
            <div className="filter-label" style={{ marginBottom: 8 }}>
              Commits ({commits.length})
            </div>
            {commits.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-dim)" }}>No commits synced.</div>
            ) : (
              commits.slice(0, 40).map((c) => (
                <div
                  key={c.sha}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                >
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.message}
                  </a>
                  <div style={{ fontSize: 11, color: "var(--color-text-dim)", marginTop: 2 }}>
                    {c.author}
                    {c.committedAt ? ` · ${new Date(c.committedAt).toLocaleString()}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <KanbanView
            stages={stages}
            tasks={tasks}
            accounts={accounts}
            accountMap={accountMap}
            aeColors={aeColors}
            pocs={pocs}
            filters={boardFilters}
            showArchive={showTaskArchive}
            onTasksChange={onTasksChange}
            onStagesChange={onStagesChange}
            onOpenTask={onOpenTask}
            embedded
            showTcColumns
            swimlaneMode={pocSwimlaneMode}
            onSwimlaneModeChange={(mode) => {
              const next = mode === "none" ? "none" : "workstream";
              setPocSwimlaneMode(next);
              try {
                sessionStorage.setItem(POC_SWIM_KEY, next);
              } catch {
                /* ignore */
              }
            }}
            swimlaneOptions={[
              { key: "none", label: "Off" },
              { key: "workstream", label: "Workstream" },
            ]}
          />
        </div>
      )}

      {newOpen && selected && (
        <div className="modal-backdrop" onClick={() => setNewOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createTask}>
            <h2>New task</h2>
            <p style={{ fontSize: 12, color: "var(--color-text-mid)", marginBottom: 10 }}>
              Linked to <strong>{selected.title || selected.folderName}</strong>
            </p>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Title</label>
              <input
                autoFocus
                required
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              />
            </div>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <div className="field">
                <label>Account</label>
                <select
                  value={newTask.account}
                  onChange={(e) => setNewTask({ ...newTask, account: e.target.value })}
                >
                  {accounts.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Stage</label>
                <select
                  value={newTask.stage}
                  onChange={(e) => setNewTask({ ...newTask, stage: e.target.value })}
                >
                  {stageOptions.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                      {isTcStage(s.key) ? " (TC)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <div className="field">
                <label>Workstream</label>
                <select
                  value={newTask.workstream || "misc"}
                  onChange={(e) => setNewTask({ ...newTask, workstream: e.target.value })}
                >
                  {WORKSTREAMS.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Due date</label>
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="primary">
                Create
              </button>
              <button type="button" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h2>Edit POC</h2>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Title</label>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </div>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <div className="field">
                <label>Account</label>
                <select
                  value={editing.account}
                  onChange={(e) => setEditing({ ...editing, account: e.target.value })}
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  {POC_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row" style={{ marginBottom: 10 }}>
              <div className="field">
                <label>Start</label>
                <input
                  type="date"
                  value={editing.startDate}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Target demo</label>
                <input
                  type="date"
                  value={editing.targetDemoDate}
                  onChange={(e) => setEditing({ ...editing, targetDemoDate: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Owner</label>
              <input
                value={editing.owner}
                onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Notes doc URL</label>
              <input
                type="url"
                placeholder="https://docs.google.com/document/…"
                value={editing.notesUrl || ""}
                onChange={(e) => setEditing({ ...editing, notesUrl: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="primary">
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
