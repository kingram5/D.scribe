"use client";

export default function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.1)", borderTopColor: "#191816", animation: "spin 1s linear infinite" }} />
    </div>
  );
}
