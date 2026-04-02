import OsBar from "@/components/ui/OsBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ perspective: "1000px", height: "100vh", overflow: "hidden" }}>
      <div className="nodum-env" />
      <OsBar />
      {children}
    </div>
  );
}
