"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AreaChart from "../../components/AreaChart";
import { SPEEDUP, emptySim, preview, simExit, simPlan, simState, simTick } from "../../lib/sim";
import { usd, usePool, zecFmt } from "../../lib/usePool";
import "./app.css";

const LABEL = {
  PLANNED: "Scheduled",
  FUNDING_SENT: "Funding from shielded",
  FUNDED: "Funded",
  ADD_SENT: "Joining the pool",
  LP_ACTIVE: "Earning",
  WD_SENT: "Withdrawing",
  WD_RECEIVED: "Proceeds received",
  SHIELD_SENT: "Shielding back",
  CLOSED: "Back in your shielded balance",
  FAILED: "Failed",
};
// Five phases a user can follow; the nine internal states map onto them.
const PHASES = ["Fund", "Join pool", "Earning", "Withdraw", "Shield back"];
const PHASE_OF = { PLANNED: -1, FUNDING_SENT: 0, FUNDED: 0, ADD_SENT: 1, LP_ACTIVE: 2, WD_SENT: 3, WD_RECEIVED: 3, SHIELD_SENT: 4, CLOSED: 5, FAILED: -1 };
const SIZES = ["0.1", "0.5", "1", "5", "10"];
const SPACING = [
  ["1m-5m", "Minutes", "1–5 min apart", "Low, demo only"],
  ["30m-3h", "Hours", "30 min–3 h apart", "Good"],
  ["6h-48h", "Days", "6–48 h apart", "Best"],
];
const RANGES = [
  ["24h", "24H"],
  ["7d", "7D"],
  ["1m", "1M"],
];
const EXPLORER = {
  main: "https://mainnet.zcashexplorer.app/transactions/",
  test: "https://testnet.zcashexplorer.app/transactions/",
};
// Per-slice exit cost besides THORChain's outbound fee: withdraw tx fee + its payload + shield tx fee.
const EXIT_TX_COST = 15_000 + 16_000 + 15_000;

const fmt = (zat, digits) => {
  const n = Number(zat || 0) / 1e8;
  return n.toFixed(digits ?? (n !== 0 && Math.abs(n) < 0.01 ? 6 : 4));
};
const dur = (s) =>
  s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`;
const until = (secs) => {
  const d = secs - Date.now() / 1000;
  return d > 0 ? `in ${dur(d)}` : null;
};
const date = (secs) =>
  secs ? new Date(Number(secs) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const pct = (a, b) => (a && b ? ((a - b) / b) * 100 : null);

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

/** A "?" that explains a term on hover or keyboard focus. */
function Hint({ children }) {
  return (
    <span className="hint" tabIndex={0} aria-label={children}>
      ?<span className="tip" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

function Change({ value, suffix }) {
  if (value == null || !Number.isFinite(value)) return null;
  const flat = Math.abs(value) < 0.005;
  return (
    <b className={flat ? "flat" : value > 0 ? "up" : "down"}>
      {flat ? "" : value > 0 ? "▲ " : "▼ "}
      {Math.abs(value).toFixed(2)}%{suffix}
    </b>
  );
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function PoolStrip({ pool }) {
  return (
    <dl className="strip">
      <div>
        <dt>ZEC price</dt>
        <dd>
          {pool ? usd(pool.price_usd) : "…"} <Change value={pct(pool?.price_usd, pool?.price_24h_usd)} suffix=" 24h" />
        </dd>
      </div>
      <div>
        <dt>Pool depth</dt>
        <dd>
          {pool ? zecFmt(pool.depth_zat / 1e8) : "…"} <Change value={pct(pool?.depth_zat, pool?.depth_24h_zat)} suffix=" 24h" />
        </dd>
      </div>
      <div>
        <dt>Providers</dt>
        <dd>{pool?.lp_count ?? "…"}</dd>
      </div>
      <div>
        <dt>
          Exit fee <Hint>THORChain&apos;s fee for sending ZEC back when a slice withdraws. Charged once per slice.</Hint>
        </dt>
        <dd>{pool ? `${fmt(pool.outbound_fee, 5)} ZEC` : "…"}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd className={pool && !pool.halted ? "ok" : "bad"}>
          <span className="sdot" />
          {pool ? (pool.halted ? "Paused" : pool.status) : "…"}
        </dd>
      </div>
    </dl>
  );
}

function SliceRow({ slice, lp, unit, network, sim }) {
  const phase = PHASE_OF[slice.state];
  const next = ["CLOSED", "FAILED"].includes(slice.state) ? null : until(slice.scheduled_at);
  let status = LABEL[slice.state];
  if (slice.state === "PLANNED") status = next ? `Starts ${next}` : "Starting";
  else if (slice.state === "LP_ACTIVE") status = slice.exit_requested ? `Exit queued${next ? `, ${next}` : ""}` : "Earning";
  else if (next) status += `, next step ${next}`;
  return (
    <li className={`slice st-${slice.state.toLowerCase()}`}>
      <div className="s-top">
        <span className="s-id display">#{slice.id}</span>
        <span className="s-amt">
          {fmt(slice.denom, 2)} {unit}
        </span>
        <span className="s-state">{status}</span>
        {lp?.asset_redeem_value && (
          <span className="s-redeem">
            worth {fmt(lp.asset_redeem_value)} {unit}
          </span>
        )}
      </div>
      <ol className="phases" aria-label={`Phase: ${PHASES[phase] ?? status}`}>
        {PHASES.map((p, i) => (
          <li key={p} className={i < phase ? "done" : i === phase ? "now" : ""}>
            <span />
            {p}
          </li>
        ))}
      </ol>
      <div className="s-meta">
        <code title="This slice's own public address">{slice.address}</code>
        <span className="s-txs">
          {["fund", "add", "wd", "out", "shield"].map((k) => (
            <Tx key={k} network={network} simulated={sim} id={slice[`${k}_txid`]} label={{ wd: "withdraw", out: "outbound" }[k] ?? k} />
          ))}
        </span>
      </div>
      {(slice.error || slice.note) && <p className="note">{slice.error || slice.note}</p>}
    </li>
  );
}

export default function App() {
  const [env, setEnv] = useState(null);
  const [network, setNetwork] = useState("main");
  const [view, setView] = useState("position");
  const [side, setSide] = useState("add");
  const [metric, setMetric] = useState("price");
  const [range, setRange] = useState("7d");
  const [remote, setRemote] = useState(null);
  const [sims, setSims] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [address, setAddress] = useState(null);
  const [form, setForm] = useState({ amount: "0.3", denoms: "0.1", jitter: "1m-5m", reserve: "0.001" });
  const { pool, history } = usePool(range);

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
  const moving = rows.filter(({ slice }) => !["CLOSED", "FAILED", "LP_ACTIVE"].includes(slice.state)).length;
  const closed = rows.filter(({ slice }) => slice.state === "CLOSED").length;
  const shielded = data?.balance?.ironwood_spendable ?? 0;
  const depth = network === "main" ? pool?.depth_zat : null;
  const share = depth && agg?.deposited_zat ? (100 * agg.deposited_zat) / (depth + agg.deposited_zat) : 0;
  const inLp = (agg?.slices_in_lp ?? 0) > 0;
  const price = pool?.price_usd ?? 0;
  const deposited = agg?.deposited_zat ?? 0;
  const redeemable = agg?.redeemable_zat ?? 0;

  // Your slices on the price chart: average entry price and when each one joined.
  const joined = rows.filter(({ lp, slice }) => lp && slice.lp_since).map(({ slice }) => slice);
  const joinedKey = joined.map((s) => `${s.id}:${s.lp_since}`).join();
  const entry = useMemo(() => {
    if (network !== "main" || !joined.length || !history?.length || !price) return null;
    const last = history.at(-1).t;
    const at = (t) => (t > last ? price : history.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b)).price);
    const w = joined.reduce((s, x) => s + x.denom, 0);
    return { value: joined.reduce((s, x) => s + at(x.lp_since) * x.denom, 0) / w, label: "Your entry" };
  }, [network, joinedKey, history, price]); // eslint-disable-line react-hooks/exhaustive-deps
  const markers =
    network === "main" && history?.length ? joined.filter((s) => s.lp_since >= history[0].t).map((s) => ({ t: s.lp_since })) : [];

  const plan = useMemo(() => {
    try {
      return { ok: preview(form, depth) };
    } catch (e) {
      return { error: e.message };
    }
  }, [form, depth]);
  const amountZat = Math.round(Number(form.amount || 0) * 1e8) || 0;
  const span = plan.ok ? Math.max(1, plan.ok.slices.at(-1).scheduled_at - Date.now() / 1000) : 1;
  const exitFees = lpActive * ((pool?.outbound_fee ?? 0) + EXIT_TX_COST);

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
    }, "Started. Each slice moves at its own random time; follow them under Your slices.");

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
  // Keep ~0.02 ZEC aside for per-slice fees when using the quick buttons.
  const spendable = Math.max(0, shielded - 2_000_000);
  const setAmount = (zat) => {
    setConfirm(null);
    setForm({ ...form, amount: String(Math.floor(zat / 1e4) / 1e4) });
  };

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
          {sim ? (
            <span className="mode-chip" title="Wallet and transactions are simulated in your browser">
              Demo
            </span>
          ) : env?.wallets?.test ? (
            // Testnet is a developer mode: it only shows up once a ./test wallet exists.
            <Seg
              label="Network"
              value={network}
              onChange={setNetwork}
              options={[
                ["main", "Mainnet"],
                ["test", "Testnet (dev)"],
              ]}
            />
          ) : (
            <span className="mode-chip live">Mainnet</span>
          )}
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
          pool data is live. <a href="/#install">Install it</a> to use a real wallet.
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
                <p>THORChain native pool. You add ZEC only (single-sided).</p>
              </div>
            </div>
            <div className="badges">
              <span className={`badge ${inLp ? "good" : ""}`}>
                <span className="b-dot" />
                {inLp ? "In range" : "No position"}
                <Hint>THORChain pools use x·y=k at every price, so a position here is always in range and always earning fees.</Hint>
              </span>
              <span className="badge">
                Full range <Hint>There is no min/max price to set, unlike Uniswap v3. Your range is 0 → ∞.</Hint>
              </span>
              <span className="badge">{network === "main" ? "Live pool data" : "Simulated THORChain"}</span>
            </div>
          </section>

          <PoolStrip pool={pool} />

          {view === "position" ? (
            <>
              <section className="chart-card">
                <div className="chart-tools">
                  <Seg
                    label="Chart"
                    value={metric}
                    onChange={setMetric}
                    options={[
                      ["price", "Price"],
                      ["depth", "Liquidity"],
                    ]}
                  />
                  <Seg label="Period" value={range} onChange={setRange} options={RANGES} />
                </div>
                <AreaChart
                  key={metric}
                  points={history}
                  field={metric}
                  format={metric === "price" ? usd : zecFmt}
                  height={320}
                  hours={range !== "1m"}
                  period={`past ${RANGES.find(([v]) => v === range)[1]}`}
                  label={metric === "price" ? "ZEC price in the pool" : "ZEC liquidity in the pool"}
                  band={metric === "price" ? (inLp ? "Your range: 0 → ∞, always in range" : "Full range: 0 → ∞") : null}
                  entry={metric === "price" ? entry : null}
                  markers={metric === "price" ? markers : null}
                />
                {metric === "price" && entry && (
                  <p className="legend">
                    <span className="lg-entry" /> Your average entry {usd(entry.value)} <Change value={pct(price, entry.value)} suffix=" since" />
                    <span className="lg-join">▲</span> When your slices joined
                  </p>
                )}
              </section>

              <section className="position">
                <div className="sec-head">
                  <h2 className="display">Your position</h2>
                  {rows.length > 0 && (
                    <span className="counts mono">
                      {agg?.slices_in_lp ?? 0} earning / {moving} moving / {closed} closed
                    </span>
                  )}
                </div>
                <div className="stats">
                  <div>
                    <span>
                      Deposited <Hint>ZEC you added, summed over every slice still in the pool. Only you can add these up.</Hint>
                    </span>
                    <strong className="display">
                      {fmt(deposited, 4)} {unit}
                    </strong>
                    <em>{network === "main" && price ? usd((deposited / 1e8) * price) : " "}</em>
                  </div>
                  <div>
                    <span>
                      Value now <Hint>What you would get back if you withdrew now, before exit fees. Single-sided adds lose a little to slip.</Hint>
                    </span>
                    <strong className="display">
                      {fmt(redeemable, 4)} {unit}
                    </strong>
                    <em>{deposited ? <Change value={pct(redeemable, deposited)} suffix=" vs deposited" /> : " "}</em>
                  </div>
                  <div>
                    <span>
                      Slices in pool <Hint>Each slice is a separate position at its own address. Nothing on-chain links them.</Hint>
                    </span>
                    <strong className="display">{agg?.slices_in_lp ?? 0}</strong>
                    <em>{rows.length ? `of ${rows.length} planned` : " "}</em>
                  </div>
                  <div>
                    <span>
                      Pool share <Hint>Your part of all ZEC in the pool, which is also your part of the fees it earns.</Hint>
                    </span>
                    <strong className="display">{share ? `${share.toFixed(2)}%` : "0%"}</strong>
                    <em>{pool ? `of ${fmt(pool.depth_zat, 2)} ZEC` : " "}</em>
                  </div>
                </div>
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
                        moving > 0 && (
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
                {data?.running && <p className="running">Working: each slice moves on its own schedule.</p>}
                {rows.length === 0 ? (
                  <ol className="howto">
                    <li>Pick an amount on the right. It is split into equal slices.</li>
                    <li>Each slice gets a fresh address and joins the pool at its own random time.</li>
                    <li>Remove any time: every slice exits on its own and is shielded again.</li>
                  </ol>
                ) : (
                  <ul className="slice-list">
                    {rows.map(({ slice, lp }) => (
                      <SliceRow key={slice.id} slice={slice} lp={lp} unit={unit} network={network} sim={sim} />
                    ))}
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
              <h2 className="display">What anyone can see</h2>
              <p className="muted">
                Your slice addresses as Midgard shows them: separate small providers, sorted by address. Nothing here connects them
                to each other, to your total, or to your shielded wallet.
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
                <p>This app is the wallet. Run this once at the repo root: the seed is created here, encrypted to your identity file, and never leaves this machine. <a href="/#install">Full install steps</a>.</p>
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
                  <span className="lbl">You add</span>
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
                    <span>{network === "main" && price && !plan.error ? usd(Number(form.amount || 0) * price) : " "}</span>
                    <span>Shielded: {fmt(shielded)}</span>
                  </span>
                </label>
                <div className="quick">
                  {[
                    [0.25, "25%"],
                    [0.5, "50%"],
                    [1, "Max"],
                  ].map(([f, l]) => (
                    <button type="button" key={l} onClick={() => setAmount(spendable * f)}>
                      {l}
                    </button>
                  ))}
                </div>

                <fieldset className="opt">
                  <legend>
                    Slice size <Hint>Every slice has this exact size. Common sizes blend in with other providers.</Hint>
                  </legend>
                  <div className="chips">
                    {SIZES.map((s) => {
                      const n = Math.floor(amountZat / Math.round(Number(s) * 1e8));
                      return (
                        <button type="button" key={s} className={`${form.denoms === s ? "on" : ""} ${n ? "" : "none"}`} onClick={() => setForm({ ...form, denoms: s })}>
                          <strong>{s}</strong>
                          <small>
                            {n} slice{n === 1 ? "" : "s"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="opt">
                  <legend>
                    Time between slices <Hint>Longer gaps make the slices harder to link by timing. Use days for real funds.</Hint>
                  </legend>
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
                  <>
                    <div className="timeline" role="img" aria-label={`${plan.ok.slices.length} slices join over about ${dur(span)}`}>
                      <div className="tl-head">
                        <span>Now</span>
                        <span>
                          {plan.ok.slices.length} slices over ≈ {dur(span)}
                          {sim ? `, ${SPEEDUP}× faster here` : ""}
                        </span>
                      </div>
                      <div className="tl-line">
                        {plan.ok.slices.map((s, i) => (
                          <span key={i} style={{ left: `${Math.min(100, (100 * (s.scheduled_at - Date.now() / 1000)) / span)}%` }} />
                        ))}
                      </div>
                    </div>
                    <dl className="summary">
                      <dt>Slices</dt>
                      <dd>
                        {plan.ok.slices.length} × {fmt(plan.ok.slices[0].denom, 2)} {unit}
                      </dd>
                      <dt>
                        Total incl. fees <Hint>Slices plus a small reserve per slice for its Zcash network fees.</Hint>
                      </dt>
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
                      {plan.ok.largest_pct_of_depth != null && (
                        <>
                          <dt>
                            Est. slip per slice <Hint>Adding one side of the pool moves its price a little. Smaller slices slip less.</Hint>
                          </dt>
                          <dd className={plan.ok.largest_pct_of_depth > 2 ? "warn" : ""}>
                            ~{((100 * plan.ok.slices[0].denom) / (plan.ok.slices[0].denom + depth)).toFixed(2)}%
                          </dd>
                        </>
                      )}
                      <dt>Timing privacy</dt>
                      <dd>{SPACING.find(([v]) => v === form.jitter)?.[3]}</dd>
                    </dl>
                  </>
                )}
                {!plan.error && plan.ok.total_needed > shielded && (
                  <p className="warn">
                    You have {fmt(shielded)} {unit} shielded. Lower the amount or add funds first.
                  </p>
                )}

                {confirm === "add" ? (
                  <div className="confirm">
                    <p>
                      {plan.ok.slices.length} slices of {fmt(plan.ok.slices[0].denom, 2)} {unit}, each funded from your shielded balance
                      and added to THORChain at its own random time.
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
                    {fmt(deposited, 4)} {unit}
                  </dd>
                  <dt>Value now</dt>
                  <dd>
                    {fmt(redeemable, 4)} {unit}
                  </dd>
                  <dt>
                    Exit fees <Hint>THORChain&apos;s outbound fee plus two Zcash transactions (withdraw, shield back) per slice.</Hint>
                  </dt>
                  <dd>
                    −{fmt(exitFees)} {unit}
                  </dd>
                  <dt className="total">You get back, shielded</dt>
                  <dd className="total">
                    ≈ {fmt(Math.max(0, redeemable - exitFees))} {unit}
                  </dd>
                </dl>
                <p className="muted small">
                  {lpActive} slice{lpActive === 1 ? "" : "s"} withdraw from their own addresses at random times, then the proceeds go to
                  a fresh Ironwood address.
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
                    {lpActive ? "Withdraw all and shield" : "Nothing to withdraw yet"}
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
