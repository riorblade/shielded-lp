// In-browser simulation of `slp` for the hosted demo: no wallet, no keys, no network
// calls except the public THORChain pool numbers. Produces the same JSON shapes as
// `slp status --json` / `slp observer --json` so the UI cannot tell the difference.

export const ZAT = 100_000_000;
export const SPEEDUP = 60; // one real minute of jitter = one simulated second

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const pick = (s, n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => s[b % s.length]).join("");
const fakeAddr = (network) => (network === "main" ? "t1" : "tm") + pick(B58, 33);
const fakeTxid = () => pick("0123456789abcdef", 64);
const rand = (a, b) => a + Math.random() * (b - a);

export function parseZec(s) {
  if (!/^\d{0,6}(\.\d{0,8})?$/.test(String(s).trim()) || String(s).trim() === "") throw new Error(`invalid amount '${s}'`);
  const [w, f = ""] = String(s).trim().split(".");
  return Number(w || 0) * ZAT + Number(f.padEnd(8, "0"));
}

const UNIT = { s: 1, m: 60, h: 3600, d: 86400 };
export function parseJitter(s) {
  const m = /^(\d+)([smhd])-(\d+)([smhd])$/.exec(s);
  if (!m) throw new Error(`invalid spacing '${s}'`);
  const a = m[1] * UNIT[m[2]];
  const b = m[3] * UNIT[m[4]];
  if (a > b) throw new Error("spacing min is greater than max");
  return [a, b];
}

/** Greedy split, largest denomination first (same as crates/slp/src/slp/planner.rs). */
export function split(total, denoms) {
  let left = total;
  const out = [];
  for (const d of [...denoms].sort((a, b) => b - a).filter((d) => d > 0)) {
    while (left >= d) {
      out.push(d);
      left -= d;
    }
  }
  return { slices: out, leftover: left };
}

export function preview({ amount, denoms, jitter, reserve }, depth, now = Date.now() / 1000, speedup = 1) {
  const { slices, leftover } = split(parseZec(amount), denoms.split(",").map(parseZec));
  if (!slices.length) throw new Error("amount is smaller than the smallest denomination");
  const [a, b] = parseJitter(jitter);
  const res = parseZec(reserve);
  let t = now;
  return {
    saved: false,
    slices: slices.map((denom) => ({ denom, scheduled_at: (t += rand(a, b) / speedup) })),
    reserve_per_slice: res,
    total_needed: slices.reduce((s, d) => s + d + res, 0),
    leftover,
    pool_depth: depth ?? null,
    largest_pct_of_depth: depth ? (100 * slices[0]) / depth : null,
  };
}

export function emptySim(network) {
  return { network, slices: [], log: [], running: false, balance: 1 * ZAT, nextId: 0 };
}

const FUND_FEE = 10_000;
const TX_FEE = 15_000;
const OUTBOUND_FEE = 44_132;

export function simPlan(sim, params, depth) {
  const p = preview(params, depth, Date.now() / 1000, SPEEDUP);
  if (p.total_needed + FUND_FEE * p.slices.length > sim.balance) {
    throw new Error("The simulated wallet holds 1 ZEC. Plan a smaller amount.");
  }
  const slices = p.slices.map((s, i) => ({
    id: sim.nextId + i,
    address: fakeAddr(sim.network),
    denom: s.denom,
    reserve: p.reserve_per_slice,
    scheduled_at: s.scheduled_at,
    state: "PLANNED",
    exit_requested: false,
  }));
  return {
    sim: { ...sim, slices: [...sim.slices, ...slices], nextId: sim.nextId + slices.length },
    result: { ...p, saved: true, slices: slices.map((s) => ({ ...s })) },
  };
}

export function simExit(sim) {
  let t = Date.now() / 1000;
  const slices = sim.slices.map((s) => {
    if (["CLOSED", "FAILED"].includes(s.state) || s.exit_requested) return s;
    const next = { ...s, exit_requested: true };
    if (s.state === "LP_ACTIVE") next.scheduled_at = t += rand(60, 600) / SPEEDUP;
    return next;
  });
  return { ...sim, slices, running: true };
}

/** Advances every due slice by one state, like one pass of `slp run`. */
export function simTick(sim, depth) {
  if (!sim.running) return sim;
  const now = Date.now() / 1000;
  let balance = sim.balance;
  const log = [...sim.log];
  const after = (sec) => now + sec;
  const slices = sim.slices.map((s0) => {
    const s = { ...s0 };
    if (s.scheduled_at > now || ["CLOSED", "FAILED"].includes(s.state)) return s;
    if (s.state === "LP_ACTIVE" && !s.exit_requested) return s;
    const before = s.state;
    switch (s.state) {
      case "PLANNED":
        balance -= s.denom + s.reserve + FUND_FEE;
        s.fund_txid = fakeTxid();
        s.state = "FUNDING_SENT";
        s.scheduled_at = after(rand(3, 6));
        break;
      case "FUNDING_SENT":
        s.state = "FUNDED";
        s.scheduled_at = after(1);
        break;
      case "FUNDED":
        s.add_txid = fakeTxid();
        s.state = "ADD_SENT";
        s.scheduled_at = after(rand(5, 9));
        break;
      case "ADD_SENT": {
        // Single-sided add: the redeemable ZEC is reduced by slip against pool depth.
        const d = depth || 21.9 * ZAT;
        s.redeem = Math.round((s.denom * d) / (d + s.denom));
        s.lp_since = now;
        s.state = "LP_ACTIVE";
        break;
      }
      case "LP_ACTIVE":
        s.wd_txid = fakeTxid();
        s.state = "WD_SENT";
        s.scheduled_at = after(rand(5, 9));
        break;
      case "WD_SENT":
        s.out_txid = fakeTxid();
        s.state = "WD_RECEIVED";
        s.scheduled_at = after(rand(60, 600) / SPEEDUP);
        break;
      case "WD_RECEIVED":
        s.shield_txid = fakeTxid();
        s.shield_to = "u1" + pick(B58, 60).toLowerCase() + "…";
        s.state = "SHIELD_SENT";
        s.scheduled_at = after(rand(3, 6));
        break;
      case "SHIELD_SENT": {
        const leftoverReserve = s.reserve - 3 * TX_FEE - 16_000;
        balance += (s.redeem ?? s.denom) - OUTBOUND_FEE + leftoverReserve;
        s.state = "CLOSED";
        break;
      }
    }
    if (s.state !== before) log.push(`slice #${s.id} ${before} -> ${s.state}`);
    return s;
  });
  const busy = slices.some(
    (s) => !["CLOSED", "FAILED"].includes(s.state) && !(s.state === "LP_ACTIVE" && !s.exit_requested),
  );
  if (!busy && sim.running) log.push("Nothing left to do.");
  return { ...sim, slices, balance, log: log.slice(-40), running: busy };
}

/** Same shape as the local /api/state response. */
export function simState(sim) {
  const open = (s) => s.state === "LP_ACTIVE" || (s.state === "WD_SENT" && !s.out_txid);
  const rows = sim.slices.map((s) => ({
    slice: s,
    lp: open(s)
      ? { units: "1", asset_deposit_value: String(s.denom), asset_redeem_value: String(s.redeem ?? s.denom) }
      : null,
  }));
  const inLp = rows.filter((r) => r.lp);
  return {
    network: sim.network,
    wallet: true,
    balance: { ironwood_spendable: sim.balance, transparent_spendable: 0, total: sim.balance },
    running: sim.running,
    log: sim.log,
    status: {
      slices: rows,
      aggregate: {
        slices_in_lp: inLp.length,
        deposited_zat: inLp.reduce((a, r) => a + r.slice.denom, 0),
        redeemable_zat: inLp.reduce((a, r) => a + Number(r.lp.asset_redeem_value), 0),
      },
    },
    observer: sim.slices
      .filter((s) => s.add_txid)
      .sort((a, b) => a.address.localeCompare(b.address))
      .map((s) => ({
        address: s.address,
        add_txid: s.add_txid,
        midgard: s.lp_since
          ? {
              pools: [
                {
                  pool: "ZEC.ZEC",
                  assetAddress: s.address,
                  assetAdded: String(s.denom),
                  assetWithdrawn: String(s.out_txid ? s.denom : 0),
                  dateFirstAdded: String(Math.floor(s.lp_since)),
                },
              ],
            }
          : null,
      })),
  };
}
