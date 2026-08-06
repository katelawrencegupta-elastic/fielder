import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { POC_STATUSES } from "../helpers.js";
import { AccountPill, StatusPill } from "../components/Pills.jsx";
import KanbanView from "./KanbanView.jsx";

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
  const [showArchive, setShowArchive] = useState(false);

  const taskCountByPoc = useMemo(() => {
    const counts = {};
    for (const t of tasks) {
      if (t.pocId == null) continue;
      counts[t.pocId] = (counts[t.pocId] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  // Prefer a POC that already has tasks; fall back to first POC.
  useEffect(() => {
    if (!pocs.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && pocs.some((p) => p.id === selectedId)) return;
    const withTasks = pocs.find((p) => (taskCountByPoc[p.id] || 0) > 0);
    setSelectedId((withTasks || pocs[0]).id);
  }, [pocs, selectedId, taskCountByPoc]);

  const selected = pocs.find((p) => p.id === selectedId) || null;

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
    });
    onPocsChange(pocs.map((p) => (p.id === updated.id ? updated : p)));
    setEditing(null);
    flash?.("POC updated");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="view-scroll" style={{ flex: "0 0 auto", paddingBottom: 0 }}>
        <div className="toolbar-row">
          <div style={{ fontSize: 13, color: "var(--color-text-mid)" }}>
            {pocs.length} POC{pocs.length === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {selected && (
              <>
                <button type="button" onClick={() => setShowArchive((v) => !v)}>
                  {showArchive ? "Hide archive" : "Show archive"}
                </button>
                <button type="button" onClick={() => setShowCommits((v) => !v)}>
                  {showCommits ? "Hide commits" : `Commits (${commits.length})`}
                </button>
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
                    })
                  }
                >
                  Edit POC
                </button>
                {selected.repoUrl && (
                  <a href={selected.repoUrl} target="_blank" rel="noreferrer">
                    <button type="button">Repo</button>
                  </a>
                )}
              </>
            )}
            <button type="button" className="primary" onClick={sync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync POCs"}
            </button>
          </div>
        </div>

        {pocs.length === 0 ? (
          <div className="empty-state">No POCs yet. Hit Sync POCs to pull from GitHub.</div>
        ) : (
          <div className="poc-picker">
            {pocs.map((poc) => {
              const active = selected?.id === poc.id;
              const count = taskCountByPoc[poc.id] || 0;
              return (
                <button
                  key={poc.id}
                  type="button"
                  className={`poc-picker-card${active ? " active" : ""}`}
                  onClick={() => setSelectedId(poc.id)}
                >
                  <div className="poc-picker-title">{poc.title || poc.folderName}</div>
                  <div className="poc-picker-meta">
                    {poc.account && <AccountPill akey={poc.account} accountMap={accountMap} />}
                    <StatusPill status={poc.status} />
                    <span className="poc-picker-count">
                      {count} task{count === 1 ? "" : "s"}
                    </span>
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
          {boardTaskCount === 0 ? (
            <div className="empty-state">
              No tasks linked to this POC yet. Link a task from the drawer’s POC field, or create one
              with this POC selected.
            </div>
          ) : (
            <KanbanView
              stages={stages}
              tasks={tasks}
              accounts={accounts}
              accountMap={accountMap}
              aeColors={aeColors}
              filters={boardFilters}
              showArchive={showArchive}
              onTasksChange={onTasksChange}
              onStagesChange={onStagesChange}
              onOpenTask={onOpenTask}
              embedded
              showTcColumns
            />
          )}
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
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Owner</label>
              <input
                value={editing.owner}
                onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
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
