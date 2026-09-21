import { useMemo, useState } from "react";

const ACCOUNT_ONLY = "__account_only__";

export default function MeetingMoveDialog({
  open,
  accounts = [],
  pocs = [],
  initialAccount = "",
  initialPoc = "",
  count = 1,
  busy = false,
  onClose,
  onConfirm,
}) {
  const activeAccounts = useMemo(
    () => (accounts || []).filter((a) => a && a.key && a.active !== false),
    [accounts]
  );
  const knownAccountKeys = useMemo(
    () => new Set(activeAccounts.map((a) => a.key)),
    [activeAccounts]
  );
  // Unaligned folders (e.g. live-captions) are not Fielder accounts — don't
  // preselect them or the <select> looks set while Move no-ops.
  const defaultAccount = knownAccountKeys.has(initialAccount)
    ? initialAccount
    : activeAccounts[0]?.key || "";
  const [account, setAccount] = useState(defaultAccount);
  const accountPocs = useMemo(
    () =>
      (pocs || []).filter(
        (p) =>
          p &&
          p.status !== "archived" &&
          p.account === account &&
          (p.folderName || p.folder_name)
      ),
    [pocs, account]
  );
  const [pocChoice, setPocChoice] = useState(() => {
    if (!initialPoc) return ACCOUNT_ONLY;
    const folders = (pocs || [])
      .filter((p) => p && p.account === defaultAccount)
      .map((p) => p.folderName || p.folder_name)
      .filter(Boolean);
    return folders.includes(initialPoc) ? initialPoc : ACCOUNT_ONLY;
  });

  if (!open) return null;

  function onAccountChange(next) {
    setAccount(next);
    setPocChoice(ACCOUNT_ONLY);
  }

  async function submit(e) {
    e.preventDefault();
    if (!account || busy) return;
    const poc = pocChoice === ACCOUNT_ONLY ? "" : pocChoice;
    await onConfirm?.({ account, poc });
  }

  const title = count > 1 ? `Move ${count} meetings` : "Move meeting";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(ev) => ev.stopPropagation()} onSubmit={submit}>
        <h2>{title}</h2>
        <p className="modal-help">
          Reassign {count > 1 ? "these transcripts" : "this transcript"} to a Fielder account and
          optional POC. Files move on disk.
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="meeting-move-account">Account</label>
          <select
            id="meeting-move-account"
            required
            value={account}
            disabled={busy}
            onChange={(e) => onAccountChange(e.target.value)}
          >
            {!account ? <option value="">Select account…</option> : null}
            {activeAccounts.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label || a.long || a.key}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="meeting-move-poc">POC</label>
          <select
            id="meeting-move-poc"
            value={pocChoice}
            disabled={busy || !account}
            onChange={(e) => setPocChoice(e.target.value)}
          >
            <option value={ACCOUNT_ONLY}>This account (no POC)</option>
            {accountPocs.map((p) => {
              const folder = p.folderName || p.folder_name;
              return (
                <option key={p.id || folder} value={folder}>
                  {p.title || folder}
                </option>
              );
            })}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !account}>
            {busy ? "Moving…" : count > 1 ? `Move ${count}` : "Move"}
          </button>
        </div>
      </form>
    </div>
  );
}
