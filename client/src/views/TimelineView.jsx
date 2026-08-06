import { useEffect, useRef, useState } from "react";
import { DataSet, Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import { api } from "../api.js";

function toDate(value, endOfDay = false) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(endOfDay ? `${s}T23:59:59` : `${s}T00:00:00`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function TimelineView({ accountMap }) {
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const [groupBy, setGroupBy] = useState("account");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getTimeline()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const groups = new DataSet();
    const items = new DataSet();
    const groupIds = new Set();

    function ensureGroup(id, content) {
      if (groupIds.has(id)) return;
      groupIds.add(id);
      groups.add({ id, content });
    }

    if (groupBy === "account") {
      for (const task of data.tasks || []) {
        const gid = task.account || "other";
        const acct = accountMap[gid];
        ensureGroup(gid, acct?.label || gid);
        const start = toDate(task.startDate) || toDate(task.dueDate);
        const end = toDate(task.dueDate, true) || toDate(task.startDate, true);
        if (!start) continue;
        items.add({
          id: `task-${task.id}`,
          group: gid,
          content: task.title,
          start,
          end: end && end > start ? end : undefined,
          type: end && end > start ? "range" : "point",
          className: "task-item",
        });
      }
      for (const poc of data.pocs || []) {
        const gid = poc.account || "other";
        const acct = accountMap[gid];
        ensureGroup(gid, acct?.label || gid);
        const start = toDate(poc.startDate);
        const end = toDate(poc.targetDemoDate, true);
        if (!start && !end) continue;
        items.add({
          id: `poc-${poc.id}`,
          group: gid,
          content: `POC · ${poc.title || poc.folderName}`,
          start: start || end,
          end: end && start && end > start ? end : undefined,
          type: end && start && end > start ? "range" : "point",
          className: "poc-item",
        });
      }
      for (const commit of data.commits || []) {
        const poc = (data.pocs || []).find((p) => p.id === commit.pocId);
        const gid = poc?.account || "other";
        const acct = accountMap[gid];
        ensureGroup(gid, acct?.label || gid);
        const start = toDate(commit.committedAt);
        if (!start) continue;
        items.add({
          id: `commit-${commit.sha}-${commit.pocId}`,
          group: gid,
          content: "●",
          title: commit.message,
          start,
          type: "point",
          className: "commit-item",
        });
      }
    } else {
      for (const poc of data.pocs || []) {
        const gid = `poc-${poc.id}`;
        ensureGroup(gid, poc.title || poc.folderName);
        const start = toDate(poc.startDate);
        const end = toDate(poc.targetDemoDate, true);
        if (start || end) {
          items.add({
            id: `poc-range-${poc.id}`,
            group: gid,
            content: poc.title || poc.folderName,
            start: start || end,
            end: end && start && end > start ? end : undefined,
            type: end && start && end > start ? "range" : "point",
            className: "poc-item",
          });
        }
      }
      for (const task of data.tasks || []) {
        if (!task.pocId) continue;
        const gid = `poc-${task.pocId}`;
        const poc = (data.pocs || []).find((p) => p.id === task.pocId);
        ensureGroup(gid, poc?.title || poc?.folderName || gid);
        const start = toDate(task.startDate) || toDate(task.dueDate);
        const end = toDate(task.dueDate, true) || toDate(task.startDate, true);
        if (!start) continue;
        items.add({
          id: `task-${task.id}`,
          group: gid,
          content: task.title,
          start,
          end: end && end > start ? end : undefined,
          type: end && end > start ? "range" : "point",
          className: "task-item",
        });
      }
      for (const commit of data.commits || []) {
        const gid = `poc-${commit.pocId}`;
        const poc = (data.pocs || []).find((p) => p.id === commit.pocId);
        ensureGroup(gid, poc?.title || poc?.folderName || gid);
        const start = toDate(commit.committedAt);
        if (!start) continue;
        items.add({
          id: `commit-${commit.sha}-${commit.pocId}`,
          group: gid,
          content: "●",
          title: commit.message,
          start,
          type: "point",
          className: "commit-item",
        });
      }
    }

    if (timelineRef.current) {
      timelineRef.current.destroy();
      timelineRef.current = null;
    }

    timelineRef.current = new Timeline(containerRef.current, items, groups, {
      stack: true,
      orientation: "top",
      zoomMin: 1000 * 60 * 60 * 24 * 2,
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 3,
      margin: { item: 6 },
      tooltip: { followMouse: true },
    });

    return () => {
      if (timelineRef.current) {
        timelineRef.current.destroy();
        timelineRef.current = null;
      }
    };
  }, [data, groupBy, accountMap]);

  if (loading) return <div className="loading">Loading timeline…</div>;
  if (error) return <div className="empty-state">{error}</div>;

  return (
    <div className="view-scroll">
      <div className="toolbar-row">
        <div style={{ fontSize: 13, color: "var(--color-text-mid)" }}>
          {(data?.tasks || []).length} dated tasks · {(data?.pocs || []).length} POCs ·{" "}
          {(data?.commits || []).length} commits
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className={groupBy === "account" ? "primary" : ""}
            onClick={() => setGroupBy("account")}
          >
            By account
          </button>
          <button
            type="button"
            className={groupBy === "poc" ? "primary" : ""}
            onClick={() => setGroupBy("poc")}
          >
            By POC
          </button>
        </div>
      </div>
      <div className="timeline-wrap" ref={containerRef} />
    </div>
  );
}
