import OsBar from "@/components/ui/OsBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ perspective: "1000px", minHeight: "100vh" }}>
      <div className="nodum-env" />
      <OsBar />
      {children}
    </div>
  );
}
