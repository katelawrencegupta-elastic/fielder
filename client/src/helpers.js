export const AE_COLOR_FALLBACK = {
  "Corey Fallarino": { bg: "#1a2e1a", color: "#7acf9a" },
  "Peter Antoinette": { bg: "#2a1a2e", color: "#c87adf" },
  "Timothy Webster (Tim)": { bg: "#2a2218", color: "#dfb87a" },
};

const LABEL_PALETTE = [
  { bg: "#2a1e08", color: "#f0b44a" },
  { bg: "#2a0e22", color: "#e87ab8" },
  { bg: "#0c2a18", color: "#4dc884" },
  { bg: "#0e1a40", color: "#6a9ef5" },
  { bg: "#2a0e0e", color: "#e87070" },
  { bg: "#1e0e38", color: "#a87af5" },
  { bg: "#0a2820", color: "#3dcfaa" },
  { bg: "#2a1808", color: "#e8904a" },
];

export function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { bg: `hsl(${hue},35%,14%)`, color: `hsl(${hue},55%,68%)` };
}

export function buildAccountMap(list) {
  const m = {};
  list.forEach((a) => {
    m[a.key] = a;
  });
  return m;
}

export function buildAeColors(list) {
  const c = {};
  list.forEach((a) => {
    if (!a.ae || c[a.ae]) return;
    if (a.aeBg && a.aeColor) c[a.ae] = { bg: a.aeBg, color: a.aeColor };
    else c[a.ae] = AE_COLOR_FALLBACK[a.ae] || hashColor(a.ae);
  });
  return c;
}

export function buildAllAes(list) {
  return [...new Set(list.map((a) => a.ae).filter(Boolean))].sort();
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
    overdue: { bg: "#2e0d0d", color: "#e87070" },
    today: { bg: "#0b2a20", color: "#3dcfa0" },
    soon: { bg: "#2e1f08", color: "#e8a44a" },
    upcoming: { bg: "#1a1e28", color: "#6a7a96" },
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
