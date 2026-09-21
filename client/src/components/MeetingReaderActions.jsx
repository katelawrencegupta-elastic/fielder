export default function MeetingReaderActions({
  archived = false,
  busy = false,
  onArchive,
  onUnarchive,
  onDelete,
  onMove,
  onClose,
}) {
  return (
    <div className="daily-reader-actions meeting-reader-actions">
      {onMove ? (
        <button type="button" disabled={busy} onClick={onMove}>
          Move
        </button>
      ) : null}
      {archived ? (
        <button type="button" disabled={busy} onClick={onUnarchive}>
          Unarchive
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={onArchive}>
          Archive
        </button>
      )}
      <button type="button" disabled={busy} onClick={onDelete}>
        Delete
      </button>
      {onClose ? (
        <button type="button" onClick={onClose}>
          Close
        </button>
      ) : null}
    </div>
  );
}
