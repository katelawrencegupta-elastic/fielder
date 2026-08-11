export const AE_COLOR_FALLBACK = {
  "Corey Fallarino": { bg: "#e3f5ea", color: "#1f6b3f" },
  "Peter Antoinette": { bg: "#f3e8f6", color: "#7a3d8f" },
  "Timothy Webster (Tim)": { bg: "#f5eee3", color: "#8a5a20" },
};

const LABEL_PALETTE = [
  { bg: "#f8efd9", color: "#8a5a10" },
  { bg: "#f8e3ef", color: "#9a3a6a" },
  { bg: "#e3f4ea", color: "#1f7a45" },
  { bg: "#e4ebf8", color: "#2f5aaa" },
  { bg: "#f8e4e4", color: "#a83838" },
  { bg: "#eee6f8", color: "#6a3aaa" },
  { bg: "#e0f4ef", color: "#1a7a68" },
  { bg: "#f6eadc", color: "#9a5520" },
];

function parseHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const h = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("")}`;
}

/** Turn a saturated accent into a light pill (pastel bg + darker text). */
export function softPillFromAccent(accent, fallback = "#6a7a96") {
  const rgb = parseHex(accent) || parseHex(fallback);
  const [r, g, b] = rgb;
  const bg = toHex([
    Math.round(r * 0.16 + 255 * 0.84),
    Math.round(g * 0.16 + 255 * 0.84),
    Math.round(b * 0.16 + 255 * 0.84),
  ]);
  const color = toHex([
    Math.round(r * 0.52),
    Math.round(g * 0.52),
    Math.round(b * 0.52),
  ]);
  return { bg, color, swatch: accent || fallback };
}

export function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `hsl(${hue}, 40%, 92%)`,
    color: `hsl(${hue}, 45%, 32%)`,
    swatch: `hsl(${hue}, 55%, 48%)`,
  };
}

export function buildAccountMap(list) {
  const m = {};
  list.forEach((a) => {
    const soft = softPillFromAccent(a.color || a.bg);
    m[a.key] = {
      ...a,
      bg: soft.bg,
      color: soft.color,
      swatch: a.color || soft.swatch,
    };
  });
  return m;
}

export function buildAeColors(list) {
  const c = {};
  list.forEach((a) => {
    if (!a.ae || c[a.ae]) return;
    if (a.aeColor) {
      c[a.ae] = softPillFromAccent(a.aeColor);
    } else if (AE_COLOR_FALLBACK[a.ae]) {
      c[a.ae] = AE_COLOR_FALLBACK[a.ae];
    } else {
      c[a.ae] = hashColor(a.ae);
    }
  });
  return c;
}

export function buildAllAes(list) {
  return [...new Set(list.map((a) => a.ae).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/** Sort accounts alphabetically by display label. */
export function sortAccounts(list) {
  return [...(list || [])].sort((a, b) =>
    (a.label || a.key || "").localeCompare(b.label || b.key || "", undefined, {
      sensitivity: "base",
    })
  );
}

/** Sort POCs alphabetically by title (archived last when present). */
export function sortPocs(list) {
  return [...(list || [])].sort((a, b) => {
    const aArch = a.status === "archived" ? 1 : 0;
    const bArch = b.status === "archived" ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    return (a.title || a.folderName || "").localeCompare(b.title || b.folderName || "", undefined, {
      sensitivity: "base",
    });
  });
}

export function pillColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return LABEL_PALETTE[Math.abs(h) % LABEL_PALETTE.length];
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isTcStage(key) {
  return /^tc\d+$/i.test(key || "");
}

export function dueDateStatus(d) {
  if (!d) return null;
  const t = today();
  if (d < t) return "overdue";
  if (d === t) return "today";
  return Math.round((new Date(d) - new Date(t)) / 86400000) <= 3 ? "soon" : "upcoming";
}

export function formatDueDate(d) {
  if (!d) return null;
  const st = dueDateStatus(d);
  const dt = new Date(d + "T00:00:00");
  const label =
    st === "today"
      ? "Today"
      : st === "overdue"
        ? `Overdue · ${dt.toLocaleDateString([], { month: "short", day: "numeric" })}`
        : dt.toLocaleDateString([], { month: "short", day: "numeric" });
  const colors = {
    overdue: { bg: "#f8e4e4", color: "#a83838" },
    today: { bg: "#e3f4ea", color: "#1f7a45" },
    soon: { bg: "#f8efd9", color: "#8a5a10" },
    upcoming: { bg: "#eef1f4", color: "#5a6a7a" },
  };
  return { label, ...(colors[st] || colors.upcoming) };
}

export const pillStyle = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 5,
  background: bg,
  color,
  fontWeight: 500,
  whiteSpace: "nowrap",
});

export const POC_STATUSES = [
  { key: "planning", label: "Planning" },
  { key: "in_progress", label: "In progress" },
  { key: "demo_ready", label: "Demo ready" },
  { key: "archived", label: "Archived" },
];

export function replaceById(list, item) {
  return list.map((x) => (x.id === item.id ? item : x));
}
