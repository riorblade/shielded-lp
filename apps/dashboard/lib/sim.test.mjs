// Simulator check: plan -> run -> exit ends with every slice shielded again. Run: pnpm test
import assert from "node:assert";
import * as S from "./sim.js";
let now = 1_000_000;
Date.now = () => now * 1000;
const depth = 21.9 * S.ZAT;
assert.deepEqual(S.split(S.parseZec("0.35"), [S.parseZec("0.1")]), { slices: [1e7, 1e7, 1e7], leftover: 5e6 });
let { sim } = S.simPlan(S.emptySim("main"), { amount: "0.3", denoms: "0.1", jitter: "1m-5m", reserve: "0.001" }, depth);
sim = { ...sim, running: true };
for (let i = 0; i < 400 && sim.running; i++) { now += 1; sim = S.simTick(sim, depth); }
let st = S.simState(sim);
assert.equal(st.status.aggregate.slices_in_lp, 3, "all three in LP");
assert.equal(st.observer.length, 3);
sim = S.simExit(sim);
for (let i = 0; i < 400 && sim.running; i++) { now += 1; sim = S.simTick(sim, depth); }
st = S.simState(sim);
assert.ok(sim.slices.every((s) => s.state === "CLOSED"), sim.slices.map((s) => s.state).join());
assert.ok(st.balance.total < S.ZAT && st.balance.total > 0.99 * S.ZAT, String(st.balance.total));
console.log("sim ok; final simulated balance", st.balance.total / S.ZAT, "log tail:", sim.log.slice(-3));
