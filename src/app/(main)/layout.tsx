import OsBar from "@/components/ui/OsBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .ds-main-layout { overflow-y: auto !important; overflow-x: hidden !important; height: auto !important; min-height: 100vh !important; }
        }
      `}</style>
      <div className="ds-main-layout" style={{ perspective: "1000px", height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="nodum-env" />
        <OsBar />
        {children}
      </div>
    </>
  );
}
