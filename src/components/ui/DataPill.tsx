interface DataPillProps {
  label: string;
  metric: string;
  accentColor?: string;
}

export default function DataPill({ label, metric, accentColor = "#191816" }: DataPillProps) {
  return (
    <div style={{
      borderLeft: `3px solid ${accentColor}`,
      background: "linear-gradient(90deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)",
      borderRadius: "var(--radius-sm)",
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#191816", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, fontWeight: 600, color: "#7a7369" }}>{metric}</div>
    </div>
  );
}
