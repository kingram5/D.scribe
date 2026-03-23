"use client";
import { useEffect, useState } from "react";

export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((data) => setBalance(data.balance ?? null))
      .catch(() => setBalance(null));
  }, []);

  return {
    balance,
    isLow: balance !== null && balance <= 3,
    isEmpty: balance !== null && balance <= 0,
    refresh: () => {
      fetch("/api/credits")
        .then((r) => r.json())
        .then((data) => setBalance(data.balance ?? null))
        .catch(() => {});
    },
  };
}
