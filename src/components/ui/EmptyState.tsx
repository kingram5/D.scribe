"use client";
import Link from "next/link";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export default function EmptyState({ message, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div style={{
      padding: "80px 40px",
      textAlign: "center",
    }}>
      <p style={{
        fontSize: 15,
        color: "#7a7369",
        marginBottom: actionLabel ? 20 : 0,
      }}>
        {message}
      </p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="nodum-btn">
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button onClick={onAction} className="nodum-btn">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
