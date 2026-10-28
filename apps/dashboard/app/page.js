"use client";

import { useEffect, useState } from "react";

const STEPS = [
  ["PLANNED", "Waiting to fund"],
  ["FUNDING_SENT", "Funding from shielded"],
  ["FUNDED", "Funded"],
  ["ADD_SENT", "Adding liquidity"],
  ["LP_ACTIVE", "Providing liquidity"],
  ["WD_SENT", "Withdrawing"],
  ["WD_RECEIVED", "Proceeds received"],
  ["SHIELD_SENT", "Shielding back"],
  ["CLOSED", "Shielded again"],
];
const LABEL = Object.fromEntries([...STEPS, ["FAILED", "Failed"]]);
const stepIndex = (s) => STEPS.findIndex(([k]) => k === s);

const zec = (zat) => (Number(zat || 0) / 1e8).toFixed(Number(zat) % 1e6 ? 4 : 2);
const short = (s) => (s ? `${s.slice(0, 8)}…${s.slice(-6)}` : "");
const date = (secs) =>
  secs ? new Date(Number(secs) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [exitMsg, setExitMsg] = useState(null);

  async function load() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function exitAll() {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    const r = await fetch("/api/exit", { method: "POST", headers: { "x-slp": "1" } });
    const j = await r.json();
    setExitMsg(r.ok ? `Withdrawal started. Progress is logged to ${j.log}.` : j.error);
    load();
  }

  const slices = data?.status.slices ?? [];
  const agg = data?.status.aggregate;
  const active = slices.filter(({ slice }) => slice.state === "LP_ACTIVE" && !slice.exit_requested).length;
  const observed = data?.observer ?? [];

  return (
    <main className="split">
      <section className="owner" aria-labelledby="owner-h">
        <h1 id="owner-h">Your position</h1>
        <p className="lede">Only you can add these up. Keys stay in your wallet.</p>

        <div className="total">
          <span className="amount">{zec(agg?.deposited_zat)}</span>
          <span className="unit">ZEC in the ZEC.ZEC pool</span>
        </div>
        <p className="sub">
          Spread over {agg?.slices_in_lp ?? 0} unlinked addresses. Redeemable now:{" "}
          {zec(agg?.redeemable_zat)} ZEC (asset side, before fees).
        </p>

        {error && <p className="error">Could not read slice state: {error}</p>}

        <ol className="slices">
          {slices.map(({ slice, lp }) => {
            const at = stepIndex(slice.state);
            return (
              <li key={slice.id} className={slice.state === "FAILED" ? "failed" : ""}>
                <div className="row">
                  <span className="name">Slice {slice.id}</span>
                  <span className="denom">{zec(slice.denom)} ZEC</span>
                  <span className="state">
                    {LABEL[slice.state]}
                    {slice.exit_requested && slice.state === "LP_ACTIVE" ? ", exit queued" : ""}
                  </span>
                </div>
                <div className="steps" role="img" aria-label={`Step ${at + 1} of ${STEPS.length}`}>
                  {STEPS.map(([k], i) => (
                    <span key={k} className={i < at ? "done" : i === at ? "now" : ""} />
                  ))}
                </div>
                <div className="meta">
                  <code>{slice.address}</code>
                  {lp?.asset_redeem_value && <span>redeem {zec(lp.asset_redeem_value)} ZEC</span>}
                </div>
                {(slice.error || slice.note) && <p className="note">{slice.error || slice.note}</p>}
              </li>
            );
          })}
        </ol>
        {data && slices.length === 0 && (
          <p className="empty">
            No slices yet. Plan some with <code>slp plan --amount 3 --denoms 1</code>, then <code>slp run</code>.
          </p>
        )}

        <div className="actions">
          <button onClick={exitAll} disabled={!active} className={confirming ? "confirm" : ""}>
            {confirming ? `Confirm: withdraw ${active} and shield` : "Withdraw all and shield"}
          </button>
          {confirming && (
            <button className="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          )}
        </div>
        {exitMsg && <p className="sub">{exitMsg}</p>}
        <p className="fine">
          Single-sided liquidity carries slip on entry and ZEC/RUNE price exposure. Fees are not guaranteed.
        </p>
      </section>

      <section className="observer" aria-labelledby="obs-h">
        <h2 id="obs-h">What the public sees</h2>
        <p className="lede">
          Midgard lists each address as its own small liquidity provider. Nothing on-chain ties them to one owner.
        </p>
        <ul className="fragments">
          {observed.map(({ address, midgard }) => {
            const p = midgard?.pools?.[0];
            return (
              <li key={address}>
                <code>{address}</code>
                {p ? (
                  <dl>
                    <dt>Added</dt>
                    <dd>{zec(p.assetAdded)} ZEC</dd>
                    <dt>Withdrawn</dt>
                    <dd>{zec(p.assetWithdrawn)} ZEC</dd>
                    <dt>First seen</dt>
                    <dd>{date(p.dateFirstAdded)}</dd>
                  </dl>
                ) : (
                  <p className="pending">Not indexed by Midgard yet</p>
                )}
                <details>
                  <summary>Raw Midgard response</summary>
                  <pre>{JSON.stringify(midgard, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
        {data && observed.length === 0 && (
          <p className="empty">Nothing public yet. Addresses appear here once their deposit reaches THORChain.</p>
        )}
      </section>
    </main>
  );
}
