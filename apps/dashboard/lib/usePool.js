"use client";

import { useEffect, useState } from "react";

/** Live THORChain ZEC pool snapshot + history for a range ("24h" | "7d" | "1m"). */
export function usePool(range = "1m") {
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
    setHistory(null);
    fetch(`/api/history?range=${range}`)
      .then((r) => r.json())
      .then((h) => setHistory(h.points ?? []))
      .catch(() => setHistory([]));
  }, [range]);
  // End the series at the live thornode price so the chart and the stats agree.
  const last = history?.at(-1);
  const live = pool && last && pool.fetched_at > last.t + 60 ? { t: Math.floor(pool.fetched_at), price: pool.price_usd, depth: pool.depth_zat / 1e8 } : null;
  return { pool, history: live ? [...history, live] : history };
}

export const usd = (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
export const zecFmt = (v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ZEC`;
