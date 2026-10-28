"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AreaChart from "../../components/AreaChart";
import { SPEEDUP, emptySim, preview, simExit, simPlan, simState, simTick } from "../../lib/sim";
import { usd, usePool, zecFmt } from "../../lib/usePool";
import "./app.css";

const STEPS = [
  ["PLANNED", "Scheduled"],
  ["FUNDING_SENT", "Funding from shielded"],
  ["FUNDED", "Funded"],
  ["ADD_SENT", "Adding liquidity"],
  ["LP_ACTIVE", "Earning"],
  ["WD_SENT", "Withdrawing"],
  ["WD_RECEIVED", "Proceeds received"],
  ["SHIELD_SENT", "Shielding back"],
  ["CLOSED", "Shielded again"],
];
const LABEL = Object.fromEntries([...STEPS, ["FAILED", "Failed"]]);
const stepIndex = (s) => STEPS.findIndex(([k]) => k === s);
const SIZES = ["0.1", "0.5", "1", "5", "10"];
const SPACING = [
  ["1m-5m", "Minutes", "Demo speed"],
  ["30m-3h", "Hours", "Good"],
  ["6h-48h", "Days", "Most private"],
];
const EXPLORER = {
  main: "https://mainnet.zcashexplorer.app/transactions/",
  test: "https://testnet.zcashexplorer.app/transactions/",
};

const fmt = (zat, digits) => {
  const n = Number(zat || 0) / 1e8;
  return n.toFixed(digits ?? (n !== 0 && Math.abs(n) < 0.01 ? 6 : 4));
};
const until = (secs) => {
  const d = Math.round(secs - Date.now() / 1000);
  if (d <= 0) return null;
  return d < 120 ? `in ${d}s` : d < 7200 ? `in ${Math.round(d / 60)} min` : `in ${Math.round(d / 3600)} h`;
};
const date = (secs) =>
  secs ? new Date(Number(secs) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

async function post(path, network, body) {
  const r = await fetch(`/api/${path}?network=${network}`, {
    method: "POST",
    headers: { "x-slp": "1", "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function loadSims() {
  try {
    const s = JSON.parse(localStorage.getItem("slp-sim") || "null");
    if (s?.main && s?.test) return s;
  } catch {}
  return { main: emptySim("main"), test: emptySim("test") };
}

function Tx({ network, id, label, simulated }) {
  if (!id) return null;
  if (simulated) return <span title="Simulated transaction">{label}</span>;
  return (
    <a href={EXPLORER[network] + id} target="_blank" rel="noreferrer noopener" title={id}>
      {label} ↗
    </a>
  );
}

function Token({ sym }) {
  return (
    <span className={`token ${sym.toLowerCase()}`} aria-hidden="true">
      {sym === "ZEC" ? "ⓩ" : "ᚱ"}
    </span>
  );
}

export default function App() {
  const [env, setEnv] = useState(null);
  const [network, setNetwork] = useState("main");
  const [view, setView] = useState("position");
  const [side, setSide] = useState("add");
  const [chart, setChart] = useState("price");
  const [interval, setInterval_] = useState("day");
  const [remote, setRemote] = useState(null);
  const [sims, setSims] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [address, setAddress] = useState(null);
  const [form, setForm] = useState({ amount: "0.3", denoms: "0.1", jitter: "1m-5m", reserve: "0.001" });
  const { pool, history } = usePool(interval);

  const sim = env && !env.local;
  const unit = network === "test" ? "TAZ" : "ZEC";

  useEffect(() => {
    fetch("/api/env")
      .then((r) => r.json())
      .then(setEnv)
      .catch(() => setEnv({ local: false, wallets: {} }));
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/state?network=${network}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRemote(j);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [network]);

  useEffect(() => {
    if (!env?.local) return;
    setRemote(null);
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [env, load]);

  useEffect(() => {
    if (!sim) return;
    setSims((s) => s ?? loadSims());
    const t = setInterval(() => setSims((s) => s && { ...s, [network]: simTick(s[network], pool?.depth_zat) }), 1000);
    return () => clearInterval(t);
  }, [sim, network, pool?.depth_zat]);

  useEffect(() => {
    if (!sims) return;
    try {
      localStorage.setItem("slp-sim", JSON.stringify(sims));
    } catch {}
  }, [sims]);

  useEffect(() => {
    setConfirm(null);
    setAddress(null);
    setNotice(null);
  }, [network, side]);

  const data = sim ? sims && simState(sims[network]) : remote;
  const hasWallet = sim || env?.wallets?.[network];
  const rows = data?.status?.slices ?? [];
  const agg = data?.status?.aggregate;
  const observed = data?.observer ?? [];
  const lpActive = rows.filter(({ slice }) => slice.state === "LP_ACTIVE" && !slice.exit_requested).length;
  const pending = rows.filter(({ slice }) => !["CLOSED", "FAILED", "LP_ACTIVE"].includes(slice.state)).length;
  const shielded = data?.balance?.ironwood_spendable ?? 0;
  const depth = network === "main" ? pool?.depth_zat : null;
  const share = depth && agg?.deposited_zat ? (100 * agg.deposited_zat) / (depth + agg.deposited_zat) : 0;
  const inLp = (agg?.slices_in_lp ?? 0) > 0;

  const plan = useMemo(() => {
    try {
      return { ok: preview(form, depth) };
    } catch (e) {
      return { error: e.message };
    }
  }, [form, depth]);

  async function act(fn, ok) {
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      if (!sim) load();
    } catch (e) {
      setNotice(e.message);
    }
    setConfirm(null);
  }

  const addPrivately = () =>
    act(async () => {
      if (sim) {
        setSims((s) => ({ ...s, [network]: { ...simPlan(s[network], form, pool?.depth_zat).sim, running: true } }));
      } else {
        await post("plan", network, form);
        await post("run", network, { action: "start" });
      }
    }, "Plan saved and started. Each slice moves at its own random time.");

  const resume = () =>
    act(async () => {
      if (sim) setSims((s) => ({ ...s, [network]: { ...s[network], running: true } }));
      else await post("run", network, { action: "start" });
    });

  const pause = () =>
    act(async () => {
      if (sim) setSims((s) => ({ ...s, [network]: { ...s[network], running: false } }));
      else await post("run", network, { action: "stop" });
    });

  const exitAll = () =>
    act(async () => {
      if (sim) setSims((s) => ({ ...s, [network]: simExit(s[network]) }));
      else await post("exit", network);
    }, "Withdrawing. Each slice exits at its own random time, then shields back.");

  const showAddress = () =>
    act(async () => {
      if (sim) setAddress("Simulation: no real wallet to receive into.");
      else setAddress((await post("address", network)).address);
    });

  const sync = () => act(() => post("sync", network), "Sync started.");
  const resetSim = () => setSims((s) => ({ ...s, [network]: emptySim(network) }));

  const priceFmt = usd;
  const depthFmt = zecFmt;

  return (
    <div className="app">
      <header className="bar">
        <Link href="/" className="logo display">
          <svg width="24" height="24" viewBox="-50 -50 100 100" aria-hidden="true">
            <circle r="48" fill="#f4b728" />
            <path d="M-15-14H15L-15 14H15M0-22V-14M0 14V22" fill="none" stroke="#0d0c14" strokeWidth="9" strokeLinejoin="round" />
          </svg>
          shielded-lp
        </Link>
        <nav className="tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "position"} className={view === "position" ? "on" : ""} onClick={() => setView("position")}>
            My position
          </button>
          <button role="tab" aria-selected={view === "public"} className={view === "public" ? "on" : ""} onClick={() => setView("public")}>
            Public view
          </button>
        </nav>
        <div className="bar-right">
          <div className="seg" role="radiogroup" aria-label="Network">
            {[
              ["main", "Mainnet"],
              ["test", "Testnet"],
            ].map(([n, l]) => (
              <button key={n} role="radio" aria-checked={network === n} className={network === n ? "on" : ""} onClick={() => setNetwork(n)}>
                {l}
              </button>
            ))}
          </div>
          {hasWallet && (
            <span className="wallet-chip" title="Shielded, spendable">
              <span className="dot-shield" />
              {fmt(shielded)} {unit}
            </span>
          )}
        </div>
      </header>

      {sim && (
        <p className="sim-banner">
          Demo mode: the wallet and every transaction are simulated in your browser, {SPEEDUP}× faster than real time. THORChain
          pool data is live. <a href="https://github.com/riorblade/shielded-lp#run-it">Run it locally</a> to use a real wallet.
        </p>
      )}
      {error && <p className="error-banner">Could not read your slices: {error}</p>}

      <main className="grid">
        <div className="main-col">
          <section className="pos-head">
            <div className="pair">
              <span className="tokens">
                <Token sym="ZEC" />
                <Token sym="RUNE" />
              </span>
              <div>
                <h1 className="display">ZEC / RUNE</h1>
                <p>THORChain native pool · single-sided ZEC</p>
              </div>
            </div>
            <div className="badges">
              <span className={`badge ${inLp ? "good" : ""}`} title="THORChain pools use x·y=k across every price, so liquidity is always active.">
                <span className="b-dot" />
                {inLp ? "In range" : "No position"}
              </span>
              <span className="badge">Full range</span>
              <span className="badge">{network === "main" ? "Live THORChain" : "Simulated THORChain"}</span>
            </div>
          </section>

          {view === "position" ? (
            <>
              <section className="stats">
                <div>
                  <span>Your liquidity</span>
                  <strong className="display">
                    {fmt(agg?.deposited_zat, 4)} {unit}
                  </strong>
                  {pool && network === "main" && <em>{usd(((agg?.deposited_zat ?? 0) / 1e8) * pool.price_usd)}</em>}
                </div>
                <div>
                  <span>Redeemable now</span>
                  <strong className="display">
                    {fmt(agg?.redeemable_zat, 4)} {unit}
                  </strong>
                  <em>after slip, before exit fees</em>
                </div>
                <div>
                  <span>Unlinked slices</span>
                  <strong className="display">{agg?.slices_in_lp ?? 0}</strong>
                  <em>each its own address</em>
                </div>
                <div>
                  <span>Pool share</span>
                  <strong className="display">{share ? `${share.toFixed(2)}%` : "—"}</strong>
                  <em>{pool ? `of ${fmt(pool.depth_zat, 2)} ZEC` : ""}</em>
                </div>
              </section>

              <section className="chart-card">
                <div className="chart-tools">
                  <div className="seg small" role="tablist" aria-label="Chart">
                    <button className={chart === "price" ? "on" : ""} onClick={() => setChart("price")}>
                      Price
                    </button>
                    <button className={chart === "depth" ? "on" : ""} onClick={() => setChart("depth")}>
                      Liquidity
                    </button>
                  </div>
                  <div className="seg small" role="tablist" aria-label="Period">
                    <button className={interval === "hour" ? "on" : ""} onClick={() => setInterval_("hour")}>
                      7D
                    </button>
                    <button className={interval === "day" ? "on" : ""} onClick={() => setInterval_("day")}>
                      All
                    </button>
                  </div>
                </div>
                {chart === "price" ? (
                  <AreaChart
                    key={`p${interval}`}
                    points={history}
                    field="price"
                    format={priceFmt}
                    height={280}
                    label="ZEC price in the THORChain pool"
                    band="Your range: 0 → ∞ (full range, always in range)"
                  />
                ) : (
                  <AreaChart key={`d${interval}`} points={history} field="depth" format={depthFmt} height={280} label="ZEC liquidity in the pool" />
                )}
              </section>

              <section className="slices">
                <div className="sec-head">
                  <h2 className="display">Your slices</h2>
                  <div className="sec-actions">
                    {rows.length > 0 &&
                      (data?.running ? (
                        <button className="btn ghost sm" onClick={pause}>
                          Pause
                        </button>
                      ) : (
                        pending > 0 && (
                          <button className="btn ghost sm" onClick={resume}>
                            Resume
                          </button>
                        )
                      ))}
                    {sim && rows.length > 0 && (
                      <button className="btn ghost sm" onClick={resetSim}>
                        Reset demo
                      </button>
                    )}
                  </div>
                </div>
                {data?.running && <p className="running">Working: each slice moves at its own scheduled time.</p>}
                {rows.length === 0 ? (
                  <div className="empty">
                    <p>No liquidity yet. Use the panel on the right: choose an amount, a slice size and how far apart they start.</p>
                    <ol className="howto">
                      <li>Your shielded {unit} is split into equal slices.</li>
                      <li>Each slice gets a fresh address and joins the pool at its own time.</li>
                      <li>Withdraw any time: each slice exits and is shielded again.</li>
                    </ol>
                  </div>
                ) : (
                  <ul className="slice-list">
                    {rows.map(({ slice, lp }) => {
                      const at = stepIndex(slice.state);
                      const next = ["CLOSED", "FAILED"].includes(slice.state) ? null : until(slice.scheduled_at);
                      return (
                        <li key={slice.id} className={slice.state === "FAILED" ? "failed" : ""}>
                          <div className="s-top">
                            <span className="s-id display">#{slice.id}</span>
                            <span className="s-amt">
                              {fmt(slice.denom, 2)} {unit}
                            </span>
                            <span className={`s-state st-${slice.state.toLowerCase()}`}>
                              {LABEL[slice.state]}
                              {slice.exit_requested && slice.state === "LP_ACTIVE" ? ", exit queued" : ""}
                            </span>
                            <span className="s-next">{next ? `next ${next}` : ""}</span>
                          </div>
                          <div className="s-steps" role="img" aria-label={`Step ${at + 1} of ${STEPS.length}`}>
                            {STEPS.map(([k], i) => (
                              <span key={k} className={i < at ? "done" : i === at ? "now" : ""} />
                            ))}
                          </div>
                          <div className="s-meta">
                            <code>{slice.address}</code>
                            {lp?.asset_redeem_value && (
                              <span>
                                redeem {fmt(lp.asset_redeem_value)} {unit}
                              </span>
                            )}
                            <span className="s-txs">
                              {["fund", "add", "wd", "out", "shield"].map((k) => (
                                <Tx
                                  key={k}
                                  network={network}
                                  simulated={sim}
                                  id={slice[`${k}_txid`]}
                                  label={{ wd: "withdraw", out: "outbound" }[k] ?? k}
                                />
                              ))}
                            </span>
                          </div>
                          {(slice.error || slice.note) && <p className="note">{slice.error || slice.note}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data?.log?.length > 0 && (
                  <details className="log">
                    <summary>Activity log</summary>
                    <pre>{data.log.slice(-20).join("\n")}</pre>
                  </details>
                )}
              </section>
            </>
          ) : (
            <section className="public">
              <h2 className="display">What anyone can see on Midgard</h2>
              <p className="muted">
                These are your slice addresses as the public sees them: small, separate providers, sorted by address. Nothing
                here connects them to each other, to your total, or to your shielded wallet.
              </p>
              {observed.length === 0 ? (
                <p className="empty">Nothing public yet. Addresses appear once a deposit is sent.</p>
              ) : (
                <ul className="frags">
                  {observed.map(({ address: a, add_txid, midgard }) => {
                    const p = midgard?.pools?.[0];
                    return (
                      <li key={a}>
                        <code>{a}</code>
                        {p ? (
                          <dl>
                            <dt>Added</dt>
                            <dd>
                              {fmt(p.assetAdded, 4)} {unit}
                            </dd>
                            <dt>Withdrawn</dt>
                            <dd>
                              {fmt(p.assetWithdrawn, 4)} {unit}
                            </dd>
                            <dt>First seen</dt>
                            <dd>{date(p.dateFirstAdded)}</dd>
                          </dl>
                        ) : (
                          <p className="muted">Deposit sent, not indexed yet</p>
                        )}
                        <Tx network={network} simulated={sim} id={add_txid} label="deposit tx" />
                        <details>
                          <summary>Raw record</summary>
                          <pre>{JSON.stringify(midgard, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pool && (
                <p className="muted small">
                  For scale: the pool has {pool.lp_count} providers and {fmt(pool.depth_zat, 2)} ZEC right now.
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="side">
          <div className="box">
            <div className="box-tabs" role="tablist">
              <button role="tab" aria-selected={side === "add"} className={side === "add" ? "on" : ""} onClick={() => setSide("add")}>
                Add
              </button>
              <button role="tab" aria-selected={side === "remove"} className={side === "remove" ? "on" : ""} onClick={() => setSide("remove")}>
                Remove
              </button>
            </div>

            {env && !hasWallet ? (
              <div className="setup">
                <h3>Set up a {network === "main" ? "mainnet" : "testnet"} wallet</h3>
                <p>Run this once at the repo root. The seed is encrypted to your identity file and never leaves this machine.</p>
                <pre>{`./target/release/slp wallet -w ./${network}/wallet init \\\n  --name main -i ./${network}/identity.txt -n ${network}`}</pre>
                <p>Then reload this page.</p>
              </div>
            ) : side === "add" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!plan.error) setConfirm("add");
                }}
              >
                <label className="amount">
                  <span className="lbl">You provide</span>
                  <span className="amount-row">
                    <input
                      inputMode="decimal"
                      aria-label={`Amount in ${unit}`}
                      value={form.amount}
                      onChange={(e) => {
                        setConfirm(null);
                        setForm({ ...form, amount: e.target.value });
                      }}
                    />
                    <span className="amount-unit">
                      <Token sym="ZEC" /> {unit}
                    </span>
                  </span>
                  <span className="amount-foot">
                    <span>{pool && network === "main" && !plan.error ? usd(Number(form.amount || 0) * pool.price_usd) : ""}</span>
                    <span>
                      Shielded: {fmt(shielded)}{" "}
                      <button type="button" className="link" onClick={() => setForm({ ...form, amount: String(Math.max(0, (shielded - 2_000_000) / 1e8).toFixed(4)) })}>
                        Max
                      </button>
                    </span>
                  </span>
                </label>

                <fieldset className="opt">
                  <legend>Slice size</legend>
                  <div className="chips">
                    {SIZES.map((s) => (
                      <button type="button" key={s} className={form.denoms === s ? "on" : ""} onClick={() => setForm({ ...form, denoms: s })}>
                        {s}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="opt">
                  <legend>Time between slices</legend>
                  <div className="chips wide">
                    {SPACING.map(([v, l, d]) => (
                      <button type="button" key={v} className={form.jitter === v ? "on" : ""} onClick={() => setForm({ ...form, jitter: v })}>
                        <strong>{l}</strong>
                        <small>{d}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {plan.error ? (
                  <p className="note">{plan.error}</p>
                ) : (
                  <dl className="summary">
                    <dt>Slices</dt>
                    <dd>
                      {plan.ok.slices.length} × {fmt(plan.ok.slices[0].denom, 2)} {unit}
                    </dd>
                    <dt>Needed, incl. fees</dt>
                    <dd>
                      {fmt(plan.ok.total_needed)} {unit}
                    </dd>
                    {plan.ok.leftover > 0 && (
                      <>
                        <dt>Stays shielded</dt>
                        <dd>
                          {fmt(plan.ok.leftover)} {unit}
                        </dd>
                      </>
                    )}
                    <dt>Price range</dt>
                    <dd>Full range</dd>
                    {plan.ok.largest_pct_of_depth != null && (
                      <>
                        <dt>Est. slip per slice</dt>
                        <dd className={plan.ok.largest_pct_of_depth > 2 ? "warn" : ""}>
                          ~{((100 * plan.ok.slices[0].denom) / (plan.ok.slices[0].denom + depth)).toFixed(2)}%
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                {!plan.error && plan.ok.total_needed > shielded && (
                  <p className="warn">
                    You have {fmt(shielded)} {unit} shielded. Add funds first.
                  </p>
                )}

                {confirm === "add" ? (
                  <div className="confirm">
                    <p>
                      {plan.ok.slices.length} slices of {fmt(plan.ok.slices[0].denom, 2)} {unit} will each be funded from your shielded
                      balance and added to THORChain at their own random time.
                      {!sim && network === "main" ? " This moves real ZEC." : ""}
                    </p>
                    <button type="button" className="btn primary" onClick={addPrivately}>
                      Confirm and start
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                      Back
                    </button>
                  </div>
                ) : (
                  <button type="submit" className="btn primary" disabled={Boolean(plan.error) || plan.ok?.total_needed > shielded}>
                    Add liquidity privately
                  </button>
                )}
              </form>
            ) : (
              <div className="remove">
                <dl className="summary">
                  <dt>In the pool</dt>
                  <dd>
                    {fmt(agg?.deposited_zat, 4)} {unit}
                  </dd>
                  <dt>Redeemable</dt>
                  <dd>
                    {fmt(agg?.redeemable_zat, 4)} {unit}
                  </dd>
                  <dt>Slices to withdraw</dt>
                  <dd>{lpActive}</dd>
                  <dt>Exit fee per slice</dt>
                  <dd>{pool ? `~${fmt(pool.outbound_fee, 5)} ZEC` : "—"}</dd>
                </dl>
                <p className="muted small">
                  Each slice withdraws from its own address at a random time, then the proceeds are shielded to a fresh Ironwood
                  address.
                </p>
                {confirm === "exit" ? (
                  <div className="confirm">
                    <button className="btn primary" onClick={exitAll}>
                      Confirm: withdraw {lpActive} and shield
                    </button>
                    <button className="btn ghost" onClick={() => setConfirm(null)}>
                      Back
                    </button>
                  </div>
                ) : (
                  <button className="btn primary" disabled={!lpActive} onClick={() => setConfirm("exit")}>
                    Withdraw all and shield
                  </button>
                )}
              </div>
            )}
            {notice && <p className="notice">{notice}</p>}
          </div>

          {hasWallet && (
            <div className="box wallet">
              <h3 className="display">Wallet</h3>
              <dl className="summary">
                <dt>Shielded, spendable</dt>
                <dd>
                  {fmt(shielded)} {unit}
                </dd>
                <dt>Transparent</dt>
                <dd>
                  {fmt(data?.balance?.transparent_spendable)} {unit}
                </dd>
              </dl>
              <div className="row-btns">
                <button className="btn ghost sm" onClick={showAddress}>
                  Receive
                </button>
                {!sim && (
                  <button className="btn ghost sm" onClick={sync}>
                    Sync
                  </button>
                )}
              </div>
              {address && <code className="addr">{address}</code>}
              {data?.balance?.error && <p className="note">{data.balance.error}</p>}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
