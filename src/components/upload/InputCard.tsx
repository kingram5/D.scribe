"use client";

import type { ReactNode, KeyboardEvent } from "react";

interface InputCardProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  /** Accessible name. Falls back to the card's own text content when omitted. */
  label?: string;
}

export default function InputCard({ onClick, children, className = "", label }: InputCardProps) {
  // These cards are the only way into a project (upload / YouTube / brainstorm). As a bare
  // clickable div they were unreachable by keyboard and never announced as actionable, so a
  // keyboard-only user could not start at all. Button semantics are applied here rather than
  // swapping the element for <button>, which would fight the card's existing layout styles.
  const interactive = typeof onClick === "function";

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onClick?.();
    }
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      className={`input-card ${className}`}
    >
      {children}
    </div>
  );
}
