"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SPEEDUP, emptySim, preview, simExit, simPlan, simState, simTick } from "../lib/sim";

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

const SPACING = [
  ["1m-5m", "Minutes apart (demo)"],
  ["30m-3h", "Hours apart"],
  ["6h-48h", "Days apart (most private)"],
];
const EXPLORER = {
  main: "https://mainnet.zcashexplorer.app/transactions/",
  test: "https://testnet.zcashexplorer.app/transactions/",
};
const NETWORKS = [
  ["main", "Mainnet"],
  ["test", "Testnet"],
];

const zec = (zat, digits) => {
  const n = Number(zat || 0) / 1e8;
  return n.toFixed(digits ?? (n !== 0 && Math.abs(n) < 0.01 ? 6 : 4));
};
const date = (secs) =>
  secs ? new Date(Number(secs) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const until = (secs) => {
  const d = Math.round(secs - Date.now() / 1000);
  if (d <= 0) return null;
  return d < 120 ? `in ${d}s` : d < 7200 ? `in ${Math.round(d / 60)} min` : `in ${Math.round(d / 3600)} h`;
};

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
  if (simulated) return <span title="Simulated transaction">{label} {id.slice(0, 8)}</span>;
  return (
    <a href={EXPLORER[network] + id} target="_blank" rel="noreferrer noopener">
      {label} {id.slice(0, 8)}
    </a>
  );
}

export default function Page() {
  const [env, setEnv] = useState(null);
  const [network, setNetwork] = useState("main");
  const [remote, setRemote] = useState(null);
  const [sims, setSims] = useState(null);
  const [pool, setPool] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [address, setAddress] = useState(null);
  const [form, setForm] = useState({ amount: "0.3", denoms: "0.1", jitter: "1m-5m", reserve: "0.001" });

  const sim = env && !env.local;
  const unit = network === "test" ? "TAZ" : "ZEC";

  // Mode and live pool data.
  useEffect(() => {
    fetch("/api/env")
      .then((r) => r.json())
      .then(setEnv)
      .catch(() => setEnv({ local: false, wallets: {} }));
    const loadPool = () =>
      fetch("/api/pool")
        .then((r) => r.json())
        .then((p) => !p.error && setPool(p))
        .catch(() => {});
    loadPool();
    const t = setInterval(loadPool, 30_000);
    return () => clearInterval(t);
  }, []);

  // Local mode: poll `slp` through the API.
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

  // Simulation mode: advance the in-browser executor once a second.
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
  }, [network]);

  const data = sim ? sims && simState(sims[network]) : remote;
  const hasWallet = sim || env?.wallets?.[network];
  const rows = data?.status?.slices ?? [];
  const agg = data?.status?.aggregate;
  const observed = data?.observer ?? [];
  const lpActive = rows.filter(({ slice }) => slice.state === "LP_ACTIVE" && !slice.exit_requested).length;
  const pending = rows.filter(({ slice }) => !["CLOSED", "FAILED", "LP_ACTIVE"].includes(slice.state)).length;
  const shielded = data?.balance?.ironwood_spendable ?? 0;

  const plan = useMemo(() => {
    try {
      return { ok: preview(form, network === "main" ? pool?.depth_zat : null) };
    } catch (e) {
      return { error: e.message };
    }
  }, [form, pool?.depth_zat, network]);

  async function run(fn, ok) {
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

  const savePlan = () =>
    run(async () => {
      if (sim) {
        setSims((s) => ({ ...s, [network]: simPlan(s[network], form, pool?.depth_zat).sim }));
      } else {
        await post("plan", network, form);
      }
    }, "Plan saved. Nothing moves until you start it.");

  const setRunning = (on) =>
    run(async () => {
      if (sim) setSims((s) => ({ ...s, [network]: { ...s[network], running: on } }));
      else await post("run", network, { action: on ? "start" : "stop" });
    });

  const exitAll = () =>
    run(async () => {
      if (sim) setSims((s) => ({ ...s, [network]: simExit(s[network]) }));
      else await post("exit", network);
    }, "Withdrawing. Each slice exits at its own random time, then shields back.");

  const showAddress = () =>
    run(async () => {
      if (sim) setAddress("Simulation: there is no wallet to receive into.");
      else setAddress((await post("address", network)).address);
    });

  const sync = () => run(() => post("sync", network), "Sync started. Progress appears in the activity log.");

  const resetSim = () => setSims((s) => ({ ...s, [network]: emptySim(network) }));

  const planForm = (
            <form
              className="panel plan"
              onSubmit={(e) => {
                e.preventDefault();
                savePlan();
              }}
            >
              <h2>New plan</h2>
              <div className="fields">
                <label>
                  Amount ({unit})
                  <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </label>
                <label>
                  Slice sizes ({unit})
                  <input value={form.denoms} onChange={(e) => setForm({ ...form, denoms: e.target.value })} />
                </label>
                <label>
                  Spacing
                  <select value={form.jitter} onChange={(e) => setForm({ ...form, jitter: e.target.value })}>
                    {SPACING.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fee reserve per slice
                  <input inputMode="decimal" value={form.reserve} onChange={(e) => setForm({ ...form, reserve: e.target.value })} />
                </label>
              </div>
              <p className="hint">Use sizes other people use too, so your slices look like theirs. Longer spacing hides timing better.</p>
              {plan.error ? (
                <p className="note">{plan.error}</p>
              ) : (
                <div className="preview">
                  <p>
                    {plan.ok.slices.length} slices: {plan.ok.slices.map((s) => zec(s.denom, 2)).join(" + ")} {unit}. Needs{" "}
                    {zec(plan.ok.total_needed)} {unit} shielded including reserves
                    {plan.ok.leftover ? `; ${zec(plan.ok.leftover)} ${unit} stays shielded` : ""}.
                  </p>
                  {plan.ok.largest_pct_of_depth != null && (
                    <p className={plan.ok.largest_pct_of_depth > 2 ? "warn" : ""}>
                      Largest slice is {plan.ok.largest_pct_of_depth.toFixed(2)}% of pool depth. Single-sided adds pay slip and carry
                      ZEC/RUNE price exposure.
                    </p>
                  )}
                  {plan.ok.total_needed > shielded && (
                    <p className="warn">
                      Wallet holds {zec(shielded)} {unit} shielded. Fund it before starting.
                    </p>
                  )}
                </div>
              )}
              <button type="submit" disabled={Boolean(plan.error)}>
                Save plan
              </button>
            </form>
  );

  return (
    <main className="split">
      <section className="owner" aria-labelledby="owner-h">
        <header className="top">
          <span className="brand">shielded-lp</span>
          <span className="tag">{env == null ? "" : sim ? "Simulation" : "Local wallet"}</span>
        </header>

        <div className="modes" role="radiogroup" aria-label="Network">
          {NETWORKS.map(([n, label]) => (
            <button key={n} role="radio" aria-checked={network === n} className={network === n ? "on" : ""} onClick={() => setNetwork(n)}>
              {label}
            </button>
          ))}
        </div>
        <p className="banner">
          {sim
            ? `This hosted demo simulates the wallet and every transaction, ${SPEEDUP}× faster than real time. THORChain pool numbers are live. Run it locally to use your own wallet.`
            : network === "main"
              ? "Mainnet: real ZEC into THORChain's live ZEC.ZEC pool. Keys never leave this machine."
              : "Testnet: real Zcash testnet transactions. THORChain has no testnet, so a vault key from your own seed plays its part."}
        </p>

        <h1 id="owner-h">Your position</h1>
        <p className="lede">Only you can add these up.</p>
        <div className="total">
          <span className="amount">{zec(agg?.deposited_zat, 2)}</span>
          <span className="unit">{unit} providing liquidity</span>
        </div>
        <p className="sub">
          Spread over {agg?.slices_in_lp ?? 0} unlinked addresses. Redeemable now: {zec(agg?.redeemable_zat)} {unit}, before
          withdrawal fees.
        </p>

        {error && <p className="error">Could not read slice state: {error}</p>}

        {env && !hasWallet ? (
          <div className="panel">
            <h2>No {network === "main" ? "mainnet" : "testnet"} wallet yet</h2>
            <p className="sub">Create one in a terminal at the repo root. The seed is encrypted to your identity file and never leaves this machine.</p>
            <pre className="cmd">{`./target/release/slp wallet -w ./${network}/wallet init \\\n  --name main -i ./${network}/identity.txt -n ${network}`}</pre>
          </div>
        ) : (
          <>
            <div className="wallet">
              <div>
                <span className="k">Shielded, spendable</span>
                <span className="v">
                  {zec(shielded)} {unit}
                </span>
              </div>
              <div>
                <span className="k">Transparent</span>
                <span className="v">
                  {zec(data?.balance?.transparent_spendable)} {unit}
                </span>
              </div>
              <div className="wallet-actions">
                <button className="ghost" onClick={showAddress}>
                  Receive
                </button>
                {!sim && (
                  <button className="ghost" onClick={sync}>
                    Sync
                  </button>
                )}
              </div>
            </div>
            {data?.balance?.error && <p className="note">Wallet: {data.balance.error}</p>}
            {address && (
              <p className="address">
                <code>{address}</code>
              </p>
            )}


            {rows.length > 0 && (
            <div className="actions">
              {data?.running ? (
                <button onClick={() => setRunning(false)}>Pause</button>
              ) : confirm === "run" ? (
                <>
                  <button className="confirm" onClick={() => setRunning(true)}>
                    Confirm: start {pending} slice{pending === 1 ? "" : "s"}
                  </button>
                  <button className="ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button disabled={!pending} onClick={() => (!sim && network === "main" ? setConfirm("run") : setRunning(true))}>
                  Start
                </button>
              )}
              {confirm === "exit" ? (
                <>
                  <button className="confirm" onClick={exitAll}>
                    Confirm: withdraw {lpActive} and shield
                  </button>
                  <button className="ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="secondary" disabled={!lpActive} onClick={() => setConfirm("exit")}>
                  Withdraw all and shield
                </button>
              )}
              {sim && rows.length > 0 && (
                <button className="ghost" onClick={resetSim}>
                  Reset simulation
                </button>
              )}
            </div>
            )}
            {data?.running && <p className="sub running">Executor running. Each slice moves at its own scheduled time.</p>}
            {notice && <p className="sub">{notice}</p>}
          </>
        )}

        <ol className="slices">
          {rows.map(({ slice, lp }) => {
            const at = stepIndex(slice.state);
            const next = ["CLOSED", "FAILED"].includes(slice.state) ? null : until(slice.scheduled_at);
            return (
              <li key={slice.id} className={slice.state === "FAILED" ? "failed" : ""}>
                <div className="row">
                  <span className="name">Slice {slice.id}</span>
                  <span className="denom">
                    {zec(slice.denom, 2)} {unit}
                  </span>
                  <span className="state">
                    {LABEL[slice.state]}
                    {slice.exit_requested && slice.state === "LP_ACTIVE" ? ", exit queued" : ""}
                    {next ? `, next step ${next}` : ""}
                  </span>
                </div>
                <div className="steps" role="img" aria-label={`Step ${at + 1} of ${STEPS.length}: ${LABEL[slice.state]}`}>
                  {STEPS.map(([k], i) => (
                    <span key={k} className={i < at ? "done" : i === at ? "now" : ""} />
                  ))}
                </div>
                <div className="meta">
                  <code>{slice.address}</code>
                  {lp?.asset_redeem_value && (
                    <span>
                      redeem {zec(lp.asset_redeem_value)} {unit}
                    </span>
                  )}
                </div>
                <div className="txs">
                  {["fund", "add", "wd", "out", "shield"].map((k) => (
                    <Tx key={k} network={network} simulated={sim} id={slice[`${k}_txid`]} label={{ wd: "withdraw", out: "outbound" }[k] ?? k} />
                  ))}
                </div>
                {(slice.error || slice.note) && <p className="note">{slice.error || slice.note}</p>}
              </li>
            );
          })}
        </ol>

        {hasWallet &&
          (rows.length ? (
            <details className="more">
              <summary>Plan more slices</summary>
              {planForm}
            </details>
          ) : (
            planForm
          ))}

        {data?.log?.length > 0 && (
          <details className="log">
            <summary>Activity ({data.log.length})</summary>
            <pre>{data.log.slice(-20).join("\n")}</pre>
          </details>
        )}

        <p className="fine">
          Non-custodial: no vault, no server holding funds. Every transaction is built and signed from your own seed. Single-sided
          liquidity carries slip on entry and price exposure; fees are not guaranteed.
        </p>
      </section>

      <section className="observer" aria-labelledby="obs-h">
        <h2 id="obs-h">What the public sees</h2>
        <p className="lede">
          Each address shows up as its own small liquidity provider. Nothing on-chain ties them to one owner or to a shielded wallet.
        </p>

        <div className="pool">
          <h3>THORChain ZEC pool, live</h3>
          {pool ? (
            <dl>
              <dt>Depth</dt>
              <dd>{zec(pool.depth_zat, 2)} ZEC</dd>
              <dt>Providers</dt>
              <dd>{pool.lp_count ?? "—"}</dd>
              <dt>ZEC price</dt>
              <dd>${pool.price_usd.toFixed(2)}</dd>
              <dt>Status</dt>
              <dd>{pool.halted ? "Paused" : pool.status}</dd>
            </dl>
          ) : (
            <p className="pending">Loading from thornode…</p>
          )}
        </div>

        <ul className="fragments">
          {observed.map(({ address: a, add_txid, midgard }) => {
            const p = midgard?.pools?.[0];
            return (
              <li key={a}>
                <code>{a}</code>
                {p ? (
                  <dl>
                    <dt>Added</dt>
                    <dd>
                      {zec(p.assetAdded, 4)} {unit}
                    </dd>
                    <dt>Withdrawn</dt>
                    <dd>
                      {zec(p.assetWithdrawn, 4)} {unit}
                    </dd>
                    <dt>First seen</dt>
                    <dd>{date(p.dateFirstAdded)}</dd>
                  </dl>
                ) : (
                  <p className="pending">Deposit sent, not indexed yet</p>
                )}
                <div className="txs">
                  <Tx network={network} simulated={sim} id={add_txid} label="deposit tx" />
                </div>
                <details>
                  <summary>Raw record</summary>
                  <pre>{JSON.stringify(midgard, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
        {data && observed.length === 0 && <p className="empty">Nothing public yet. Addresses appear here once a deposit is sent.</p>}
      </section>
    </main>
  );
}
