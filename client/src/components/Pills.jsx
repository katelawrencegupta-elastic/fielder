import { useEffect, useRef, useState } from "react";
import { formatDueDate, pillColor, pillStyle } from "../helpers.js";

export function AccountPill({ akey, accountMap, onChange }) {
  const a = accountMap[akey] || { bg: "#1a1e28", color: "#6a7a96", long: akey || "—" };
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!onChange) {
    return <span style={pillStyle(a.bg, a.color)}>{a.long || a.label || akey}</span>;
  }

  const options = Object.values(accountMap).sort(
    (x, y) => (x.ae || "").localeCompare(y.ae || "") || x.label.localeCompare(y.label)
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...pillStyle(a.bg, a.color), border: "none", cursor: "pointer" }}
        title="Reassign account"
      >
        {a.long || a.label || akey}{" "}
        <span style={{ marginLeft: 2, opacity: 0.6, fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            padding: 4,
            minWidth: 170,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,.5)",
          }}
        >
          {options.map((o) => (
            <div
              key={o.key}
              onMouseDown={() => {
                onChange(o.key);
                setOpen(false);
              }}
              style={{
                padding: "5px 8px",
                fontSize: 11,
                cursor: "pointer",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: o.key === akey ? "var(--color-text)" : "var(--color-text-mid)",
                background: o.key === akey ? "var(--color-accent-dim)" : "transparent",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color, flexShrink: 0 }} />
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AePill({ ae, aeBg, aeColor }) {
  if (!ae) return null;
  return (
    <span style={{ ...pillStyle(aeBg || "#1a1e28", aeColor || "#6a7a96"), fontStyle: "italic" }} title="AE">
      {ae}
    </span>
  );
}

export function DueDatePill({ dueDate, onClear }) {
  const fmt = formatDueDate(dueDate);
  const [hov, setHov] = useState(false);
  if (!fmt) return null;
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={pillStyle(fmt.bg, fmt.color)}
    >
      {fmt.label}
      {onClear && hov && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: fmt.color, padding: 0, fontSize: 11 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function LabelPill({ label, onRemove }) {
  const [hov, setHov] = useState(false);
  const c = pillColor(label);
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={pillStyle(c.bg, c.color)}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(label);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: c.color,
            padding: 0,
            fontSize: 11,
            opacity: hov ? 0.9 : 0.5,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function AddLabelInput({ onAdd, existing, all }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const ref = useRef(null);
  const sug = (all || []).filter(
    (l) => !(existing || []).includes(l) && l.toLowerCase().includes(val.toLowerCase())
  );

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 40);
  }, [open]);

  const submit = (v) => {
    const s = (v || val).trim();
    if (s) {
      onAdd(s);
      setVal("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 5,
          border: "1px dashed var(--color-border)",
          background: "transparent",
          color: "var(--color-text-dim)",
          whiteSpace: "nowrap",
        }}
      >
        + label
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Label…"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setVal("");
          }
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setVal("");
          }, 150)
        }
        style={{ fontSize: 11, padding: "2px 8px", width: 90 }}
      />
      {sug.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 20,
            marginTop: 2,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            minWidth: 130,
            boxShadow: "0 4px 16px rgba(0,0,0,.4)",
          }}
        >
          {sug.slice(0, 6).map((s) => (
            <div
              key={s}
              onMouseDown={() => submit(s)}
              style={{ padding: "6px 12px", fontSize: 11, cursor: "pointer", color: "var(--color-text)" }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }) {
  if (!status) return null;
  const c = pillColor(status);
  return <span style={pillStyle(c.bg, c.color)}>{status.replace(/_/g, " ")}</span>;
}
