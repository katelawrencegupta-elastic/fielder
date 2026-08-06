import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import TaskCard from "../components/TaskCard.jsx";
import { isTcStage } from "../helpers.js";

const COLLAPSED_KEY = "fielder.collapsedStages";
const SWIM_KEY = "fielder.swimlaneMode";
const NONE_LANE = "__none__";

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(set) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
}

function loadSwimMode() {
  const v = localStorage.getItem(SWIM_KEY);
  return v === "account" || v === "ae" ? v : "none";
}

function cellId(stageKey, laneId) {
  return `cell:${stageKey}::${encodeURIComponent(laneId)}`;
}

function parseCellId(id) {
  if (!id?.startsWith("cell:")) return null;
  const rest = id.slice(5);
  const sep = rest.indexOf("::");
  if (sep < 0) return null;
  return {
    stageKey: rest.slice(0, sep),
    laneId: decodeURIComponent(rest.slice(sep + 2)),
  };
}

function laneIdForTask(task, mode, accountMap) {
  if (mode === "account") return task.account || NONE_LANE;
  if (mode === "ae") {
    const ae = accountMap[task.account]?.ae;
    return ae || NONE_LANE;
  }
  return null;
}

export default function KanbanView({
  stages,
  tasks,
  accounts = [],
  accountMap,
  aeColors = {},
  filters,
  onTasksChange,
  onStagesChange,
  onOpenTask,
  showArchive,
  showTcColumns = false,
  hideDemoWorkshops = false,
  embedded = false,
  swimlaneMode: swimlaneModeProp,
  onSwimlaneModeChange,
}) {
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [localSwim, setLocalSwim] = useState(loadSwimMode);

  const swimlaneMode = swimlaneModeProp ?? localSwim;
  const setSwimlaneMode = (mode) => {
    localStorage.setItem(SWIM_KEY, mode);
    if (onSwimlaneModeChange) onSwimlaneModeChange(mode);
    else setLocalSwim(mode);
  };

  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  const visibleStages = useMemo(() => {
    return stages.filter((s) => {
      if (!showArchive && s.key === "archive") return false;
      if (!showTcColumns && isTcStage(s.key)) return false;
      return true;
    });
  }, [stages, showArchive, showTcColumns]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (hideDemoWorkshops && t.category === "demo_workshop") return false;
      if (filters.pocId != null && Number(t.pocId) !== Number(filters.pocId)) return false;
      if (filters.account && t.account !== filters.account) return false;
      if (filters.ae) {
        const acct = accountMap[t.account];
        if (!acct || acct.ae !== filters.ae) return false;
      }
      if (filters.label && !(t.labels || []).includes(filters.label)) return false;
      return true;
    });
  }, [tasks, filters, accountMap, hideDemoWorkshops]);

  const lanes = useMemo(() => {
    if (swimlaneMode === "none") return null;

    if (swimlaneMode === "account") {
      const keys = new Set();
      for (const t of filtered) keys.add(t.account || NONE_LANE);
      // Include filtered account even if empty so drop target exists
      if (filters.account) keys.add(filters.account);

      const list = [...keys].map((key) => {
        if (key === NONE_LANE) {
          return { id: NONE_LANE, label: "Unassigned", color: "#6a7a96", bg: "#1a1e28", sort: "zzz" };
        }
        const a = accountMap[key];
        return {
          id: key,
          label: a?.label || a?.long || key,
          color: a?.color || "#6a7a96",
          bg: a?.bg || "#1a1e28",
          ae: a?.ae || "",
          sort: `${a?.ae || "zzz"}|${a?.label || key}`,
        };
      });
      list.sort((a, b) => a.sort.localeCompare(b.sort));
      return list;
    }

    // AE lanes
    const names = new Set();
    for (const t of filtered) {
      names.add(accountMap[t.account]?.ae || NONE_LANE);
    }
    if (filters.ae) names.add(filters.ae);

    const list = [...names].map((name) => {
      if (name === NONE_LANE) {
        return { id: NONE_LANE, label: "No AE", color: "#6a7a96", bg: "#1a1e28", sort: "zzz" };
      }
      const colors = aeColors[name] || { color: "#6a7a96", bg: "#1a1e28" };
      return {
        id: name,
        label: name.replace(" (Tim)", ""),
        color: colors.color,
        bg: colors.bg,
        sort: name,
      };
    });
    list.sort((a, b) => a.sort.localeCompare(b.sort));
    return list;
  }, [swimlaneMode, filtered, accountMap, aeColors, filters.account, filters.ae]);

  const byCell = useMemo(() => {
    const map = {};
    const ensure = (stageKey, laneId) => {
      const id = cellId(stageKey, laneId);
      if (!map[id]) map[id] = [];
      return map[id];
    };

    if (swimlaneMode === "none") {
      for (const s of visibleStages) ensure(s.key, "_");
      for (const t of filtered) {
        if (visibleStages.some((s) => s.key === t.stage)) {
          ensure(t.stage, "_").push(t);
        }
      }
    } else {
      for (const s of visibleStages) {
        for (const lane of lanes || []) ensure(s.key, lane.id);
      }
      for (const t of filtered) {
        if (!visibleStages.some((s) => s.key === t.stage)) continue;
        const laneId = laneIdForTask(t, swimlaneMode, accountMap);
        ensure(t.stage, laneId).push(t);
      }
    }

    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
    }
    return map;
  }, [filtered, visibleStages, swimlaneMode, lanes, accountMap]);

  function toggleCollapsed(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resolveAccountForLane(laneId, currentAccount) {
    if (swimlaneMode === "account") {
      return laneId === NONE_LANE ? currentAccount || "other" : laneId;
    }
    if (swimlaneMode === "ae") {
      if (laneId === NONE_LANE) return currentAccount || "other";
      const current = accountMap[currentAccount];
      if (current?.ae === laneId) return currentAccount;
      const first = accounts.find((a) => a.ae === laneId);
      return first?.key || currentAccount || "other";
    }
    return currentAccount;
  }

  async function reorderColumns(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const nextVisible = [...visibleStages];
    const [moved] = nextVisible.splice(fromIndex, 1);
    nextVisible.splice(toIndex, 0, moved);

    const visibleKeys = new Set(nextVisible.map((s) => s.key));
    const hidden = stages.filter((s) => !visibleKeys.has(s.key));
    const nextStages = [...nextVisible, ...hidden];

    onStagesChange?.(nextStages);
    setBusy(true);
    try {
      const saved = await api.reorderStages(nextStages.map((s) => s.key));
      onStagesChange?.(saved);
    } catch (e) {
      console.error(e);
      onStagesChange?.(stages);
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(sourceId, destId, fromIndex, toIndex) {
    const from = parseCellId(sourceId) || { stageKey: sourceId, laneId: "_" };
    const to = parseCellId(destId) || { stageKey: destId, laneId: "_" };

    const sourceList = [...(byCell[sourceId] || byCell[cellId(from.stageKey, from.laneId)] || [])];
    const destSame = sourceId === destId;
    const destList = destSame ? sourceList : [...(byCell[destId] || byCell[cellId(to.stageKey, to.laneId)] || [])];

    const [moved] = sourceList.splice(fromIndex, 1);
    if (!moved) return;

    const nextAccount =
      swimlaneMode === "none"
        ? moved.account
        : resolveAccountForLane(to.laneId, moved.account);

    const updatedMoved = {
      ...moved,
      stage: to.stageKey,
      account: nextAccount,
    };
    destList.splice(toIndex, 0, updatedMoved);

    const lists = destSame
      ? [[to.stageKey, to.laneId, sourceList]]
      : [
          [from.stageKey, from.laneId, sourceList],
          [to.stageKey, to.laneId, destList],
        ];

    const updates = [];
    for (const [stageKey, laneId, list] of lists) {
      list.forEach((t, index) => {
        const account =
          t.id === updatedMoved.id
            ? nextAccount
            : swimlaneMode === "none"
              ? t.account
              : resolveAccountForLane(laneId, t.account);
        const patch = { id: t.id, stage: stageKey, position: index };
        if (swimlaneMode !== "none") patch.account = account;
        else if (t.id === updatedMoved.id && nextAccount !== moved.account) {
          patch.account = nextAccount;
        }
        updates.push(patch);
      });
    }

    const byId = new Map(updates.map((u) => [u.id, u]));
    onTasksChange(
      tasks.map((t) => {
        const u = byId.get(t.id);
        if (!u) return t;
        return {
          ...t,
          stage: u.stage,
          position: u.position,
          ...("account" in u ? { account: u.account } : {}),
        };
      })
    );

    setBusy(true);
    try {
      await api.reorderTasks(updates);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDragEnd(result) {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    if (type === "COLUMN") {
      await reorderColumns(source.index, destination.index);
      return;
    }

    await moveTask(
      source.droppableId,
      destination.droppableId,
      source.index,
      destination.index
    );
  }

  function stageCount(stageKey) {
    if (swimlaneMode === "none") {
      return (byCell[cellId(stageKey, "_")] || []).length;
    }
    return (lanes || []).reduce(
      (n, lane) => n + (byCell[cellId(stageKey, lane.id)] || []).length,
      0
    );
  }

  function renderColumnHeaders(dragEnabled) {
    return visibleStages.map((stage, colIndex) => {
      const isCollapsed = collapsed.has(stage.key);
      const count = stageCount(stage.key);
      const inner = (
        <div className="kanban-col-header">
          <button
            type="button"
            className="kanban-col-toggle"
            title={isCollapsed ? "Expand column" : "Minimize column"}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed(stage.key);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
          <div
            className="kanban-col-handle"
            {...(dragEnabled ? {} : {})}
            title={dragEnabled ? "Drag to reorder column" : undefined}
          >
            {dragEnabled && (
              <span className="kanban-col-grip" aria-hidden>
                ⋮⋮
              </span>
            )}
            <span className="kanban-col-title">{stage.label}</span>
            <span className="kanban-col-count">{count}</span>
          </div>
        </div>
      );

      if (!dragEnabled) {
        return (
          <div
            key={stage.key}
            className={`kanban-col-head${isCollapsed ? " collapsed" : ""}`}
            style={{ width: isCollapsed ? 48 : 280 }}
          >
            {inner}
          </div>
        );
      }

      return (
        <Draggable key={stage.key} draggableId={`col:${stage.key}`} index={colIndex}>
          {(colProvided, colSnapshot) => (
            <div
              ref={colProvided.innerRef}
              {...colProvided.draggableProps}
              className={`kanban-col${isCollapsed ? " collapsed" : ""}${
                colSnapshot.isDragging ? " col-dragging" : ""
              }`}
            >
              <div className="kanban-col-header">
                <button
                  type="button"
                  className="kanban-col-toggle"
                  title={isCollapsed ? "Expand column" : "Minimize column"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapsed(stage.key);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
                <div
                  className="kanban-col-handle"
                  {...colProvided.dragHandleProps}
                  title="Drag to reorder column"
                >
                  <span className="kanban-col-grip" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="kanban-col-title">{stage.label}</span>
                  <span className="kanban-col-count">{count}</span>
                </div>
              </div>
              {/* body rendered separately in flat mode */}
              <Droppable droppableId={cellId(stage.key, "_")} type="TASK">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`kanban-col-body${isCollapsed ? " is-collapsed" : ""}${
                      snapshot.isDraggingOver ? " dragging-over" : ""
                    }`}
                  >
                    {!isCollapsed &&
                      (byCell[cellId(stage.key, "_")] || []).map((task, index) => (
                        <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                            >
                              <TaskCard
                                task={task}
                                accountMap={accountMap}
                                isDragging={dragSnapshot.isDragging}
                                onOpen={onOpenTask}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                    {provided.placeholder}
                    {!isCollapsed && (byCell[cellId(stage.key, "_")] || []).length === 0 && (
                      <div style={{ fontSize: 11, color: "var(--color-text-dim)", padding: 8 }}>
                        Drop tasks here
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          )}
        </Draggable>
      );
    });
  }

  function renderTaskCell(stageKey, laneId) {
    const isCollapsed = collapsed.has(stageKey);
    const id = cellId(stageKey, laneId);
    const list = byCell[id] || [];
    return (
      <Droppable key={id} droppableId={id} type="TASK">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`swim-cell${isCollapsed ? " collapsed" : ""}${
              snapshot.isDraggingOver ? " dragging-over" : ""
            }`}
            style={{ width: isCollapsed ? 48 : 280, minWidth: isCollapsed ? 48 : 280 }}
          >
            {!isCollapsed &&
              list.map((task, index) => (
                <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                    >
                      <TaskCard
                        task={task}
                        accountMap={accountMap}
                        isDragging={dragSnapshot.isDragging}
                        onOpen={onOpenTask}
                        compactMeta={swimlaneMode === "account"}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
            {provided.placeholder}
            {!isCollapsed && list.length === 0 && (
              <div className="swim-cell-empty">Drop</div>
            )}
          </div>
        )}
      </Droppable>
    );
  }

  return (
    <div
      className={embedded ? "kanban-embedded" : "view-scroll"}
      style={
        embedded
          ? { flex: 1, minHeight: 0, overflow: "auto", padding: "0 18px 14px" }
          : { paddingBottom: 0 }
      }
    >
      <div className="kanban-toolbar">
        <span className="filter-label">Swimlanes</span>
        {[
          { key: "none", label: "Off" },
          { key: "account", label: "Account" },
          { key: "ae", label: "AE" },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`chip ${swimlaneMode === opt.key ? "active" : ""}`}
            onClick={() => setSwimlaneMode(opt.key)}
          >
            {opt.label}
          </button>
        ))}
        {busy && (
          <span style={{ fontSize: 11, color: "var(--color-text-dim)", fontFamily: "monospace" }}>
            Saving…
          </span>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        {swimlaneMode === "none" ? (
          <Droppable droppableId="board" direction="horizontal" type="COLUMN">
            {(boardProvided) => (
              <div
                className="kanban-board"
                ref={boardProvided.innerRef}
                {...boardProvided.droppableProps}
              >
                {renderColumnHeaders(true)}
                {boardProvided.placeholder}
              </div>
            )}
          </Droppable>
        ) : (
          <div className="swim-board">
            <Droppable droppableId="board-header" direction="horizontal" type="COLUMN">
              {(headerProvided) => (
                <div
                  className="swim-header-row"
                  ref={headerProvided.innerRef}
                  {...headerProvided.droppableProps}
                >
                  <div className="swim-lane-label swim-corner">
                    {swimlaneMode === "ae" ? "AE" : "Account"}
                  </div>
                  {visibleStages.map((stage, colIndex) => {
                    const isCollapsed = collapsed.has(stage.key);
                    return (
                      <Draggable
                        key={stage.key}
                        draggableId={`col:${stage.key}`}
                        index={colIndex}
                      >
                        {(colProvided, colSnapshot) => (
                          <div
                            ref={colProvided.innerRef}
                            {...colProvided.draggableProps}
                            className={`kanban-col-head${isCollapsed ? " collapsed" : ""}${
                              colSnapshot.isDragging ? " col-dragging" : ""
                            }`}
                            style={{
                              width: isCollapsed ? 48 : 280,
                              minWidth: isCollapsed ? 48 : 280,
                            }}
                          >
                            <div className="kanban-col-header">
                              <button
                                type="button"
                                className="kanban-col-toggle"
                                title={isCollapsed ? "Expand column" : "Minimize column"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCollapsed(stage.key);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {isCollapsed ? "▸" : "▾"}
                              </button>
                              <div
                                className="kanban-col-handle"
                                {...colProvided.dragHandleProps}
                                title="Drag to reorder column"
                              >
                                <span className="kanban-col-grip" aria-hidden>
                                  ⋮⋮
                                </span>
                                <span className="kanban-col-title">{stage.label}</span>
                                <span className="kanban-col-count">{stageCount(stage.key)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {headerProvided.placeholder}
                </div>
              )}
            </Droppable>

            {(lanes || []).map((lane) => (
              <div key={lane.id} className="swim-row">
                <div
                  className="swim-lane-label"
                  style={{
                    background: lane.bg,
                    color: lane.color,
                    borderColor: lane.color,
                  }}
                  title={lane.label}
                >
                  <span className="swim-lane-name">{lane.label}</span>
                  <span className="swim-lane-count">
                    {visibleStages.reduce(
                      (n, s) => n + (byCell[cellId(s.key, lane.id)] || []).length,
                      0
                    )}
                  </span>
                </div>
                {visibleStages.map((stage) => renderTaskCell(stage.key, lane.id))}
              </div>
            ))}

            {(lanes || []).length === 0 && (
              <div className="empty-state">No tasks match the current filters.</div>
            )}
          </div>
        )}
      </DragDropContext>
    </div>
  );
}
