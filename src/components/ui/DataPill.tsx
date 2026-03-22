interface DataPillProps {
  label: string;
  metric: string;
  accentColor?: string;
}

export default function DataPill({ label, metric, accentColor = "#E05D3A" }: DataPillProps) {
  return (
    <div style={{
      borderLeft: `3px solid ${accentColor}`,
      background: "linear-gradient(90deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)",
      borderRadius: "var(--radius-sm)",
      padding: "10px 14px",
    }}>
      <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 20, fontWeight: 700, color: "#191816", lineHeight: 1 }}>{metric}</div>
      <div style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 11, fontWeight: 500, color: "#7a7369", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}
