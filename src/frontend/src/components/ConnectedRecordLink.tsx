// Phase 14 (Group 2) — the one reusable "Connected Records" link: a name
// that's normally shown as plain text (a vendor, a project, ...) becomes
// clickable when the caller has a real id + navigation callback for it.
// Falls back to plain text when no callback is supplied (e.g. permission
// gates it, or the id is missing) so it's always a safe drop-in
// replacement for the plain string that was there before.

interface ConnectedRecordLinkProps {
  label: string;
  onClick?: () => void;
  "data-ocid"?: string;
}

export function ConnectedRecordLink({
  label,
  onClick,
  "data-ocid": dataOcid,
}: ConnectedRecordLinkProps) {
  if (!onClick) return <span>{label}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-primary hover:underline font-medium text-left"
      data-ocid={dataOcid}
    >
      {label}
    </button>
  );
}
