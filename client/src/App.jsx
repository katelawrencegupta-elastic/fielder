import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import {
  buildAccountMap,
  buildAeColors,
  buildAllAes,
  replaceById,
} from "./helpers.js";
import FilterBar from "./components/FilterBar.jsx";
import TaskDrawer from "./components/TaskDrawer.jsx";
import KanbanView from "./views/KanbanView.jsx";
import { isTcStage } from "./helpers.js";
import PocsView from "./views/PocsView.jsx";
import DemosView from "./views/DemosView.jsx";
import TimelineView from "./views/TimelineView.jsx";

const TABS = [
  { key: "kanban", label: "Kanban" },
  { key: "demos", label: "Demos & Workshops" },
  { key: "pocs", label: "POCs" },
  { key: "timeline", label: "Timeline" },
];

export default function App() {
  const [tab, setTab] = useState("kanban");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pocs, setPocs] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [filters, setFilters] = useState({
    ae: null,
    account: null,
    label: null,
  });
  const [selectedTask, setSelectedTask] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [status, setStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    account: "other",
    stage: "backlog",
    dueDate: "",
  });
  const snapRef = useRef(null);

  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);
  const aeColors = useMemo(() => buildAeColors(accounts), [accounts]);
  const aes = useMemo(() => buildAllAes(accounts), [accounts]);

  const flash = useCallback((msg, ms = 2500) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), ms);
  }, []);

  const reload = useCallback(async () => {
    const [a, s, t, p, l] = await Promise.all([
      api.getAccounts(),
      api.getStages(),
      api.getTasks(),
      api.getPocs(),
      api.getAllLabels(),
    ]);
    setAccounts(a);
    setStages(s);
    setTasks(t);
    setPocs(p);
    setAllLabels(l);
    setNewTask((nt) => ({
      ...nt,
      stage: nt.stage || s[0]?.key || "backlog",
      account: nt.account || a[0]?.key || "other",
    }));
  }, []);

  useEffect(() => {
    reload()
      .catch((err) => {
        console.error(err);
        flash("Failed to load data");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!snapsOpen) return;
    const onDoc = (e) => {
      if (snapRef.current && !snapRef.current.contains(e.target)) setSnapsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [snapsOpen]);

  async function exportTasks() {
    const data = await api.exportTasks();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fielder-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported");
  }

  async function runImport(e) {
    e.preventDefault();
    try {
      const items = JSON.parse(importText);
      const result = await api.importTasks(items);
      await reload();
      setShowImport(false);
      setImportText("");
      flash(`Imported ${result.added} tasks`);
    } catch (err) {
      flash(err.message || "Import failed");
    }
  }

  async function openSnapshots() {
    setSnapsOpen((v) => !v);
    if (!snapsOpen) {
      try {
        setSnapshots(await api.getSnapshots());
      } catch {
        setSnapshots([]);
      }
    }
  }

  async function saveSnapshot() {
    await api.snapshotNow();
    setSnapshots(await api.getSnapshots());
    flash("Snapshot saved");
  }

  async function restoreSnapshot(name) {
    if (!window.confirm(`Restore ${name}? Restart the server afterward.`)) return;
    await api.restoreSnapshot(name);
    flash("Restored — restart the server");
    setSnapsOpen(false);
    await reload();
  }

  async function createTask(e) {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    const created = await api.createTask({
      title: newTask.title.trim(),
      account: newTask.account || "other",
      stage: newTask.stage || stages[0]?.key || "backlog",
      dueDate: newTask.dueDate || null,
      category: "general",
    });
    setTasks((prev) => [created, ...prev]);
    setNewOpen(false);
    setNewTask({
      title: "",
      account: newTask.account,
      stage: newTask.stage,
      dueDate: "",
    });
    flash("Task created");
  }

  if (loading) {
    return <div className="loading">Loading Fielder…</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          Field<span>er</span>
        </div>
        <nav className="nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? "active" : ""}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {status && <span className="status-flash">{status}</span>}
          {tab === "kanban" && (
            <>
              <button type="button" onClick={() => setShowArchive((v) => !v)}>
                {showArchive ? "Hide archive" : "Show archive"}
              </button>
              <button type="button" className="primary" onClick={() => setNewOpen(true)}>
                New task
              </button>
            </>
          )}
          <button type="button" onClick={exportTasks}>
            Export
          </button>
          <button type="button" onClick={() => setShowImport(true)}>
            Import
          </button>
          <div ref={snapRef} style={{ position: "relative" }}>
            <button type="button" onClick={openSnapshots}>
              Snapshots
            </button>
            {snapsOpen && (
              <div className="menu-pop">
                <button type="button" className="menu-item" onClick={saveSnapshot}>
                  Save snapshot now
                </button>
                {snapshots.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 11, color: "var(--color-text-dim)" }}>
                    No snapshots yet
                  </div>
                ) : (
                  snapshots.slice(0, 12).map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className="menu-item"
                      onClick={() => restoreSnapshot(s.name)}
                    >
                      <span>{s.ts || s.name}</span>
                      <span style={{ color: "var(--color-text-dim)" }}>
                        {s.size ? `${(s.size / 1024).toFixed(0)} KB` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {tab === "kanban" && (
        <FilterBar
          accounts={accounts}
          aes={aes}
          aeColors={aeColors}
          allLabels={allLabels}
          filters={filters}
          onChange={setFilters}
        />
      )}

      <div className="app-body">
        {tab === "kanban" && (
          <KanbanView
            stages={stages}
            tasks={tasks}
            accounts={accounts}
            accountMap={accountMap}
            aeColors={aeColors}
            filters={filters}
            showArchive={showArchive}
            hideDemoWorkshops
            onTasksChange={setTasks}
            onStagesChange={setStages}
            onOpenTask={setSelectedTask}
          />
        )}
        {tab === "demos" && (
          <DemosView
            tasks={tasks}
            accounts={accounts}
            accountMap={accountMap}
            stages={stages}
            onTasksChange={setTasks}
            onOpenTask={setSelectedTask}
            flash={flash}
          />
        )}
        {tab === "pocs" && (
          <PocsView
            pocs={pocs}
            accounts={accounts}
            accountMap={accountMap}
            aeColors={aeColors}
            stages={stages}
            tasks={tasks}
            onPocsChange={setPocs}
            onTasksChange={setTasks}
            onStagesChange={setStages}
            onOpenTask={setSelectedTask}
            flash={flash}
          />
        )}
        {tab === "timeline" && <TimelineView accountMap={accountMap} />}
      </div>

      {selectedTask && (
        <TaskDrawer
          task={tasks.find((t) => t.id === selectedTask.id) || selectedTask}
          stages={stages}
          accountMap={accountMap}
          pocs={pocs}
          allLabels={allLabels}
          allowTcStages={tab === "pocs"}
          onClose={() => setSelectedTask(null)}
          onUpdated={(updated) => {
            setTasks((prev) => replaceById(prev, updated));
            setSelectedTask(updated);
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setSelectedTask(null);
          }}
        />
      )}

      {newOpen && (
        <div className="modal-backdrop" onClick={() => setNewOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createTask}>
            <h2>New task</h2>
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
                  {stages
                    .filter((s) => s.key !== "archive" && !isTcStage(s.key))
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Due date</label>
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
              />
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

      {showImport && (
        <div className="modal-backdrop" onClick={() => setShowImport(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={runImport}>
            <h2>Import tasks</h2>
            <p style={{ fontSize: 12, color: "var(--color-text-mid)", marginBottom: 10 }}>
              Paste exported Fielder/fieldwork JSON array.
            </p>
            <textarea
              rows={12}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='[{"title":"…","account":"foa","stage":"backlog"}]'
              style={{ width: "100%", marginBottom: 12, fontFamily: "monospace", fontSize: 11 }}
              required
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="primary">
                Import
              </button>
              <button type="button" onClick={() => setShowImport(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
