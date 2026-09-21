const TITLE_MAX = 200;

export function normalizeFollowUpTitle(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

export function followUpKey(item) {
  const path = String(item?.rel_path || "").trim();
  return `${path}\0${normalizeFollowUpTitle(item?.text)}`.toLowerCase();
}

export function followUpToTaskBody(
  item,
  { pocId = null, account, stage = "backlog" } = {}
) {
  const title = normalizeFollowUpTitle(item?.text);
  if (!title) return null;
  const stamp = meetingStamp(item?.started_at);
  const path = String(item?.rel_path || "").trim();
  const lines = [];
  if (stamp) lines.push(`From meeting ${stamp}.`);
  if (path) lines.push(path);
  return {
    title: title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title,
    description: lines.length ? lines.join("\n") : null,
    account: account || item?.account || "other",
    stage: stage || "backlog",
    workstream: "misc",
    category: "general",
    pocId: pocId == null ? null : pocId,
    source: "scrappy",
    labels: ["meeting"],
  };
}

export function isFollowUpOnBoard(item, tasks, opts) {
  const { account, pocId } = opts && typeof opts === "object" ? opts : {};
  const title = normalizeFollowUpTitle(item?.text).toLowerCase();
  if (!title) return false;
  return (tasks || []).some((task) => {
    if (normalizeFollowUpTitle(task.title).toLowerCase() !== title) return false;
    if (account) return task.account === account;
    if (pocId != null) return Number(task.pocId) === Number(pocId);
    return false;
  });
}

export const CLEARED_FOLLOWUPS_KEY = "fielder.meetings.clearedFollowups";

export function loadClearedFollowUpKeys(storage) {
  const store = storage || localStorageOrNull();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(CLEARED_FOLLOWUPS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key) => typeof key === "string" && key);
  } catch {
    return [];
  }
}

export function saveClearedFollowUpKeys(keys, storage) {
  const unique = uniqueKeys(keys);
  const store = storage || localStorageOrNull();
  if (!store) return unique;
  try {
    store.setItem(CLEARED_FOLLOWUPS_KEY, JSON.stringify(unique));
  } catch {
    /* ignore quota / private mode */
  }
  return unique;
}

export function withClearedFollowUp(keys, item) {
  const key = followUpKey(item);
  if (!normalizeFollowUpTitle(item?.text) || !key) return uniqueKeys(keys);
  if ((keys || []).includes(key)) return uniqueKeys(keys);
  return uniqueKeys([...(keys || []), key]);
}

export function withClearedFollowUps(keys, items) {
  return (items || []).reduce((acc, item) => withClearedFollowUp(acc, item), keys || []);
}

export function openFollowUps(items, clearedKeys, limit) {
  const cleared = new Set(clearedKeys || []);
  const open = (items || []).filter((item) => !cleared.has(followUpKey(item)));
  if (limit == null || limit < 0) return open;
  return open.slice(0, limit);
}

function uniqueKeys(keys) {
  return [...new Set((keys || []).filter((key) => typeof key === "string" && key))];
}

function localStorageOrNull() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function meetingStamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace("T", " ").replace(/:\d{2}$/, "").slice(0, 16);
}
