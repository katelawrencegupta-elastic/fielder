const BASE = "/api";

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`${method} ${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getAccounts: () => req("GET", "/accounts"),
  syncAccounts: () => req("POST", "/accounts/sync"),

  getStages: () => req("GET", "/stages"),
  createStage: (body) => req("POST", "/stages", body),
  updateStage: (key, body) => req("PATCH", `/stages/${encodeURIComponent(key)}`, body),
  reorderStages: (keys) => req("POST", "/stages/reorder", { keys }),
  deleteStage: (key, moveTo) =>
    req("DELETE", `/stages/${encodeURIComponent(key)}`, moveTo ? { moveTo } : undefined),

  getEpics: (account) =>
    req("GET", `/epics${account ? `?account=${encodeURIComponent(account)}` : ""}`),
  createEpic: (body) => req("POST", "/epics", body),
  updateEpic: (id, body) => req("PATCH", `/epics/${id}`, body),
  deleteEpic: (id) => req("DELETE", `/epics/${id}`),

  getTasks: (pocId) =>
    req("GET", `/tasks${pocId != null ? `?pocId=${encodeURIComponent(pocId)}` : ""}`),
  createTask: (body) => req("POST", "/tasks", body),
  updateTask: (id, body) => req("PATCH", `/tasks/${id}`, body),
  deleteTask: (id) => req("DELETE", `/tasks/${id}`),
  reorderTasks: (updates) => req("POST", "/tasks/reorder", { updates }),

  addSubtask: (id, text) => req("POST", `/tasks/${id}/subtasks`, { text }),
  updateSubtask: (id, subId, body) => req("PATCH", `/tasks/${id}/subtasks/${subId}`, body),
  deleteSubtask: (id, subId) => req("DELETE", `/tasks/${id}/subtasks/${subId}`),

  addLabel: (id, label) => req("POST", `/tasks/${id}/labels`, { label }),
  removeLabel: (id, label) =>
    req("DELETE", `/tasks/${id}/labels/${encodeURIComponent(label)}`),
  getAllLabels: () => req("GET", "/labels"),

  getPocs: () => req("GET", "/pocs"),
  getPocCommits: (id) => req("GET", `/pocs/${id}/commits`),
  updatePoc: (id, body) => req("PATCH", `/pocs/${id}`, body),
  syncPocs: () => req("POST", "/pocs/sync"),

  getTimeline: () => req("GET", "/timeline"),

  getTaskEvents: ({ pocId, fromMs, toMs } = {}) => {
    const q = new URLSearchParams();
    if (pocId != null && pocId !== "") q.set("pocId", String(pocId));
    if (fromMs != null) q.set("fromMs", String(fromMs));
    if (toMs != null) q.set("toMs", String(toMs));
    const qs = q.toString();
    return req("GET", `/task-events${qs ? `?${qs}` : ""}`);
  },

  exportTasks: () => req("GET", "/export"),
  importTasks: (items) => req("POST", "/import", items),

  getSnapshots: () => req("GET", "/snapshots"),
  snapshotNow: () => req("POST", "/snapshots/now"),
  restoreSnapshot: (name) =>
    req("POST", `/snapshots/restore/${encodeURIComponent(name)}`),
};
