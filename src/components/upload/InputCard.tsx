"use client";

import type { ReactNode } from "react";

interface InputCardProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export default function InputCard({ onClick, children, className = "" }: InputCardProps) {
  return (
    <div
      onClick={onClick}
      className={`input-card ${className}`}
    >
      {children}
    </div>
  );
}
