const express = require("express");
const { all, get, run } = require("../db/helpers");

const router = express.Router();

function serialize(r) {
  return { key: r.key, label: r.label, order: r.sort_order };
}

function slugify(label) {
  const base = String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "stage";
}

function uniqueKey(label) {
  let key = slugify(label);
  if (!get("SELECT key FROM stages WHERE key = ?", key)) return key;
  let i = 2;
  while (get("SELECT key FROM stages WHERE key = ?", `${key}_${i}`)) i += 1;
  return `${key}_${i}`;
}

router.get("/", (req, res) => {
  const rows = all("SELECT * FROM stages ORDER BY sort_order ASC");
  res.json(rows.map(serialize));
});

router.post("/", (req, res) => {
  const label = String(req.body?.label || "").trim();
  if (!label) return res.status(400).json({ error: "label is required" });
  const key = req.body?.key ? slugify(req.body.key) : uniqueKey(label);
  if (get("SELECT key FROM stages WHERE key = ?", key)) {
    return res.status(409).json({ error: `Stage key "${key}" already exists` });
  }
  const maxOrder = get("SELECT COALESCE(MAX(sort_order), -1) as m FROM stages").m;
  // Insert before archive if present, otherwise at end
  const archive = get("SELECT sort_order FROM stages WHERE key = 'archive'");
  let order = maxOrder + 1;
  if (archive && !req.body?.key) {
    order = archive.sort_order;
    run("UPDATE stages SET sort_order = sort_order + 1 WHERE sort_order >= ?", order);
  }
  run("INSERT INTO stages (key, label, sort_order) VALUES (?, ?, ?)", key, label, order);
  res.status(201).json(serialize(get("SELECT * FROM stages WHERE key = ?", key)));
});

router.patch("/:key", (req, res) => {
  const existing = get("SELECT * FROM stages WHERE key = ?", req.params.key);
  if (!existing) return res.status(404).json({ error: "Stage not found" });
  const label = req.body?.label != null ? String(req.body.label).trim() : existing.label;
  if (!label) return res.status(400).json({ error: "label is required" });
  const order = req.body?.order != null ? Number(req.body.order) : existing.sort_order;
  run("UPDATE stages SET label = ?, sort_order = ? WHERE key = ?", label, order, existing.key);
  res.json(serialize(get("SELECT * FROM stages WHERE key = ?", existing.key)));
});

router.post("/reorder", (req, res) => {
  const keys = req.body?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: "keys array is required" });
  }
  keys.forEach((key, i) => {
    run("UPDATE stages SET sort_order = ? WHERE key = ?", i, key);
  });
  const rows = all("SELECT * FROM stages ORDER BY sort_order ASC");
  res.json(rows.map(serialize));
});

router.delete("/:key", (req, res) => {
  const key = req.params.key;
  const existing = get("SELECT * FROM stages WHERE key = ?", key);
  if (!existing) return res.status(404).json({ error: "Stage not found" });

  const count = all("SELECT key FROM stages").length;
  if (count <= 1) return res.status(400).json({ error: "Cannot delete the last column" });

  const taskCount = get("SELECT COUNT(*) as n FROM tasks WHERE stage_key = ?", key).n;
  const moveTo = req.body?.moveTo || req.query.moveTo || null;

  if (taskCount > 0) {
    if (!moveTo) {
      return res.status(400).json({
        error: `Column has ${taskCount} task${taskCount !== 1 ? "s" : ""}; provide moveTo`,
        taskCount,
      });
    }
    if (moveTo === key) return res.status(400).json({ error: "moveTo must be a different column" });
    const dest = get("SELECT key FROM stages WHERE key = ?", moveTo);
    if (!dest) return res.status(400).json({ error: `Destination stage "${moveTo}" not found` });

    const maxPos = get("SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE stage_key = ?", moveTo).m;
    const tasks = all("SELECT id FROM tasks WHERE stage_key = ? ORDER BY position ASC", key);
    tasks.forEach((t, i) => {
      run("UPDATE tasks SET stage_key = ?, position = ? WHERE id = ?", moveTo, maxPos + 1 + i, t.id);
    });
  }

  run("DELETE FROM stages WHERE key = ?", key);
  // Compact sort_order
  all("SELECT key FROM stages ORDER BY sort_order ASC").forEach((r, i) => {
    run("UPDATE stages SET sort_order = ? WHERE key = ?", i, r.key);
  });
  res.json({ ok: true, moved: taskCount });
});

module.exports = router;
