"use client";

// PREVIEW-ONLY route for the Meet T.H.E.O lobby (design/theo-lobby branch).
// Public on purpose so the preview deploy can be eyeballed without the auth
// redirect bouncing to prod. STRIP THIS FILE + the /theo-preview PUBLIC_PATHS
// entry before merging to master.
import MeetTheoPanel from "@/components/upload/MeetTheoPanel";

export default function TheoPreview() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1A1610" }}>
      <MeetTheoPanel onBack={() => {}} onStart={() => {}} />
    </div>
  );
}
