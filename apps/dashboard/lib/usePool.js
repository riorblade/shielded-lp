"use client";

import { useEffect, useState } from "react";

/** Live THORChain ZEC pool snapshot + history, refreshed in the background. */
export function usePool(interval = "day") {
  const [pool, setPool] = useState(null);
  const [history, setHistory] = useState(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/pool")
        .then((r) => r.json())
        .then((p) => !p.error && setPool(p))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    fetch(`/api/history?interval=${interval}`)
      .then((r) => r.json())
      .then((h) => setHistory(h.points ?? []))
      .catch(() => setHistory([]));
  }, [interval]);
  return { pool, history };
}

export const usd = (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
export const zecFmt = (v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ZEC`;
