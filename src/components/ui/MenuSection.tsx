"use client";
import Link from "next/link";

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  nested?: boolean;
  statusDot?: string;
  meta?: string;
}

interface MenuSectionProps {
  title?: string;
  items: MenuItem[];
}

export default function MenuSection({ title, items }: MenuSectionProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {title && (
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, color: "#a0978a", marginBottom: 8, padding: "0 10px" }}>
          {title}
        </div>
      )}
      {items.map((item, i) => {
        const content = (
          <>
            {item.statusDot && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.statusDot, marginRight: 8, flexShrink: 0 }} />
            )}
            {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.meta && (
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-manrope), sans-serif", fontSize: 11, fontWeight: 500, color: "#a0978a" }}>
                {item.meta}
              </span>
            )}
          </>
        );

        const className = `nodum-menu-item${item.active ? " active" : ""}`;
        const style: React.CSSProperties = item.nested ? { paddingLeft: 28 } : {};

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} className={className} style={style}>
              {content}
            </Link>
          );
        }

        return (
          <div key={item.label} className={className} style={style} onClick={item.onClick}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
