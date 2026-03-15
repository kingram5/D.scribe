import type { ReactNode } from "react";

interface PanelTitleProps {
  children: ReactNode;
}

export default function PanelTitle({ children }: PanelTitleProps) {
  return (
    <div className="nodum-panel-title">
      {children}
    </div>
  );
}
