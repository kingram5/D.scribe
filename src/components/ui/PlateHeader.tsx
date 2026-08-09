/**
 * Numbered plate header — the print-shop card annotation from the
 * resonant-adoption pass. Renders "01 / RECORD" on the left and an optional
 * status/meta slot on the right, both in the mono label voice.
 */
export default function PlateHeader({
  num,
  label,
  right,
  accent = false,
}: {
  num: string;
  label: string;
  right?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <header className="plate-head">
      <span className="ds-label">
        {num} / {label}
      </span>
      {right != null && (
        <span className={`ds-label${accent ? " ds-label--accent" : ""}`}>{right}</span>
      )}
    </header>
  );
}
