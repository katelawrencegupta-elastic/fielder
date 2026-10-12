const BASE = "/api";
const DEFAULT_TIMEOUT_MS = 15000;

function combineSignals(timeoutMs, signal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([timeout, signal]);
  return timeout;
}

async function req(method, path, body, { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: combineSignals(timeoutMs, signal),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error(`${method} ${path} → timed out`);
    }
    throw err;
  }
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

async function meetingsGet(path, opts) {
  return meetingsReq("GET", path, undefined, opts);
}

async function meetingsReq(method, path, body, { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: combineSignals(timeoutMs, signal),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return { unavailable: true, hits: [], items: [], error: "timed out" };
    }
    throw err;
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (res.status === 503) {
    return { unavailable: true, hits: [], items: [], ...data };
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}${data.error ? `: ${data.error}` : ""}`
    );
  }
  return data;
}

function meetingsQuery(params) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  getAccounts: () => req("GET", "/accounts"),
  getAccountsConfig: () => req("GET", "/accounts/config"),
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
  syncPocs: () => req("POST", "/pocs/sync", undefined, { timeoutMs: 60000 }),

  getTimeline: ({ fromMs, toMs, limit } = {}) => {
    const q = new URLSearchParams();
    if (fromMs != null) q.set("fromMs", String(fromMs));
    if (toMs != null) q.set("toMs", String(toMs));
    if (limit != null) q.set("limit", String(limit));
    const qs = q.toString();
    return req("GET", `/timeline${qs ? `?${qs}` : ""}`);
  },

  getTaskEvents: ({ pocId, fromMs, toMs } = {}) => {
    const q = new URLSearchParams();
    if (pocId != null && pocId !== "") q.set("pocId", String(pocId));
    if (fromMs != null) q.set("fromMs", String(fromMs));
    if (toMs != null) q.set("toMs", String(toMs));
    const qs = q.toString();
    return req("GET", `/task-events${qs ? `?${qs}` : ""}`);
  },

  exportTasks: () => req("GET", "/export"),
  importTasks: (items) => req("POST", "/import", items, { timeoutMs: 30000 }),

  getSnapshots: () => req("GET", "/snapshots"),
  snapshotNow: () => req("POST", "/snapshots/now"),
  restoreSnapshot: (name) =>
    req("POST", `/snapshots/restore/${encodeURIComponent(name)}`, undefined, { timeoutMs: 30000 }),

  getMeetingsHealth: () => meetingsGet("/meetings/health"),
  searchMeetings: ({ account, poc, q = "", since = "", k = 12, includeArchived = false } = {}) =>
    meetingsGet(
      `/meetings/search${meetingsQuery({
        account,
        poc,
        q,
        since,
        k,
        include_archived: includeArchived ? "1" : "",
      })}`
    ),
  getMeetingNotes: (relPath) =>
    meetingsGet(`/meetings/meeting${meetingsQuery({ path: relPath })}`),
  getMeetingFollowups: ({ account, poc, since = "", includeArchived = false } = {}) =>
    meetingsGet(
      `/meetings/followups${meetingsQuery({
        account,
        poc,
        since,
        include_archived: includeArchived ? "1" : "",
      })}`
    ),
  archiveMeeting: (relPath) => meetingsReq("POST", "/meetings/archive", { path: relPath }),
  unarchiveMeeting: (relPath) =>
    meetingsReq("POST", "/meetings/unarchive", { path: relPath }),
  deleteMeeting: (relPath) =>
    meetingsReq("POST", "/meetings/delete", { path: relPath }),
  moveMeeting: (relPath, { account, poc = "" } = {}) =>
    meetingsReq("POST", "/meetings/move", { path: relPath, account, poc }),
  getCalendarEvents: ({ from, to, signal } = {}) =>
    req("GET", `/calendar/events${meetingsQuery({ from, to })}`, undefined, { signal }),
};
