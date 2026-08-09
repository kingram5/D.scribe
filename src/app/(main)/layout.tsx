import OsBar from "@/components/ui/OsBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .ds-main-layout { overflow-y: auto !important; overflow-x: hidden !important; height: auto !important; min-height: 100vh !important; }
          /* On desktop this shell is viewport-height, so perspective is harmless. On mobile
             the rules above let it grow to content height — and perspective makes it a
             containing block for fixed descendants, which pins the bottom step nav to the
             document instead of the screen (invisible until you scroll to the very bottom on
             any long page). Nothing here depends on inherited perspective: the 3D book cards
             declare their own. */
          .ds-perspective-shell { perspective: none !important; }
        }
      `}</style>
      <div className="ds-main-layout" style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="nodum-env" />
        <OsBar />
        <div className="ds-perspective-shell" style={{ flex: 1, perspective: "1000px", minHeight: 0, overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </>
  );
}
