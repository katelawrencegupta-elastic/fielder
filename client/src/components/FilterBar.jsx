import { isMeetingOnlyAccount } from "../helpers.js";

export default function FilterBar({
  accounts,
  aes,
  aeColors,
  allLabels,
  pocs = [],
  filters,
  onChange,
}) {
  const { ae, account, label, pocId } = filters;
  const accountOptions = [...accounts]
    .filter((a) => !isMeetingOnlyAccount(a.key))
    .filter((a) => !ae || a.ae === ae)
    .sort((a, b) =>
      (a.label || a.key || "").localeCompare(b.label || b.key || "", undefined, {
        sensitivity: "base",
      })
    );
  const hasActive = ae || account || label || pocId != null;

  const pocOptions = [...pocs].sort((a, b) => {
    const aArch = a.status === "archived" ? 1 : 0;
    const bArch = b.status === "archived" ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    return (a.title || a.folderName || "").localeCompare(b.title || b.folderName || "", undefined, {
      sensitivity: "base",
    });
  });

  const labelOptions = [...(allLabels || [])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  function set(patch) {
    onChange({ ...filters, ...patch });
  }

  return (
    <div className="filter-bar">
      <div className="filter-row filter-row-compact">
        <div className="filter-group">
          <span className="filter-label">AE</span>
          <div className="filter-chips">
            <button
              type="button"
              className={`chip ${!ae ? "active" : ""}`}
              onClick={() => set({ ae: null, account: null })}
            >
              All
            </button>
            {aes.map((name) => {
              const colors = aeColors[name] || { color: "var(--color-accent)" };
              const active = ae === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip ae-chip ${active ? "active" : ""}`}
                  style={
                    active
                      ? { color: colors.color, background: colors.bg, borderColor: colors.color }
                      : undefined
                  }
                  onClick={() => set({ ae: active ? null : name, account: null })}
                >
                  {name.replace(" (Tim)", "").split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Account</span>
          <select
            className="filter-select"
            value={account || ""}
            onChange={(e) => set({ account: e.target.value || null })}
          >
            <option value="">All accounts</option>
            {accountOptions.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">POC</span>
          <select
            className="filter-select"
            value={pocId ?? ""}
            onChange={(e) =>
              set({ pocId: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">All POCs</option>
            <option value="-1">No POC</option>
            {pocOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.status === "archived" ? `[archived] ${p.title || p.folderName}` : p.title || p.folderName}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">Label</span>
          <select
            className="filter-select"
            value={label || ""}
            onChange={(e) => set({ label: e.target.value || null })}
          >
            <option value="">All labels</option>
            {labelOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {hasActive && (
          <button
            type="button"
            className="chip"
            onClick={() => set({ ae: null, account: null, label: null, pocId: null })}
            style={{ marginLeft: "auto" }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
