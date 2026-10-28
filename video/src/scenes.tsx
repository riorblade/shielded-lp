import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { C, DISPLAY, MONO, SANS } from "./theme";
import { Body, Callout, Coin, Cut, Cuts, Footage, Ghost, Line, Mono, Pop, SceneCtx, cutStarts, useSpring, useT } from "./ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const PAD = { padding: "0 150px" };

const Slam: React.FC<{ size: number; color: string; children: React.ReactNode; at?: number }> = ({ size, color, children, at = 0 }) => {
  const p = useSpring(at, 14, 0.5);
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 0.9,
        color,
        textTransform: "uppercase",
        transform: `scale(${1.35 - 0.35 * p})`,
        opacity: Math.min(1, p * 2),
        filter: `blur(${(1 - p) * 10}px)`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

// ---------- 1. Hook ----------

const Tag: React.FC<{ at: number; children: string }> = ({ at, children }) => {
  const p = useSpring(at, 12, 0.5);
  return (
    <div
      style={{
        padding: "18px 40px",
        border: `4px solid ${C.pink}`,
        borderRadius: 999,
        fontFamily: DISPLAY,
        fontSize: 84,
        color: C.pink,
        transform: `scale(${0.4 + 0.6 * p}) rotate(${(1 - p) * -8}deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      {children}
    </div>
  );
};

export const Hook: React.FC = () => {
  const { beat } = useT();
  const b = [0, beat(0.17), beat(0.36)];
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Cuts at={b}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <Slam size={460} color={C.zec}>
            500 ZEC.
          </Slam>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: C.zec }}>
          <Slam size={330} color={C.ink}>
            One deposit.
          </Slam>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 46 }}>
          <Pop at={0}>
            <div style={{ padding: "36px 56px", borderRadius: 28, background: C.ink2, border: `2px dashed ${C.pink}`, textAlign: "center" }}>
              <Mono size={22}>Midgard / ZEC.ZEC liquidity provider</Mono>
              <div style={{ fontFamily: MONO, fontSize: 46, color: C.paper, margin: "18px 0 6px" }}>t1Wh4leQx8…Lp9xQ</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 170, color: C.zec, lineHeight: 1 }}>500.00 ZEC</div>
              <Body size={30}>first added 28 Oct, 14:02 UTC</Body>
            </div>
          </Pop>
          <div style={{ display: "flex", gap: 36 }}>
            <Tag at={beat(0.62) - beat(0.36)}>Size</Tag>
            <Tag at={beat(0.74) - beat(0.36)}>Timing</Tag>
            <Tag at={beat(0.88) - beat(0.36)}>History</Tag>
          </div>
        </AbsoluteFill>
      </Cuts>
    </AbsoluteFill>
  );
};

// ---------- 2. Problem ----------

const ROWS = [
  ["t1JVSs2…qutEK", "0.115"],
  ["t1S3MY7…RCHsm", "0.300"],
  ["t1MKZNe…n1oM", "0.037"],
  ["t1R391R…b9yWU", "18.00"],
  ["t1Wh4le…Lp9xQ", "500.0"],
  ["t1Kd02a…Wq81", "2.000"],
];

const Count: React.FC<{ to: number; at: number; dur: number; digits?: number; style?: React.CSSProperties }> = ({ to, at, dur, digits = 2, style }) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [at, at + dur], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <span style={style}>{v.toFixed(digits)}</span>;
};

export const Problem: React.FC = () => {
  const { beat, f } = useT();
  const b = [0, beat(0.27), beat(0.48), beat(0.8)];
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Cuts at={b}>
        <AbsoluteFill style={{ background: C.zec, justifyContent: "center", ...PAD }}>
          <Line at={2} size={330} color={C.ink}>
            Zcash
          </Line>
          <Pop at={8}>
            <Body size={52} color={C.ink}>
              The strongest privacy in crypto.
            </Body>
          </Pop>
          <div style={{ position: "relative", marginTop: 50, alignSelf: "flex-start" }}>
            <Line at={beat(0.12)} size={130} color={C.ink}>
              No smart contracts.
            </Line>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "52%",
                height: 14,
                background: C.pink,
                width: `${interpolate(f, [beat(0.17), beat(0.17) + 10], [0, 100], clamp)}%`,
              }}
            />
          </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", ...PAD }}>
          <Ghost>Pool</Ghost>
          <Pop at={0}>
            <Mono size={30}>Native ZEC liquidity lives on</Mono>
          </Pop>
          <Line at={4} size={360} color={C.thor}>
            THORChain
          </Line>
          <Pop at={14}>
            <Body size={44}>ZEC.ZEC pool, live since Oct 2, 2026.</Body>
          </Pop>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", ...PAD }}>
          <Line at={0} size={150}>
            It only reads
          </Line>
          <Line at={5} size={150} color={C.pink}>
            transparent ZEC.
          </Line>
          <div style={{ marginTop: 50, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 60px", width: 1500 }}>
            {ROWS.map(([a, z], i) => (
              <Pop key={a} at={12 + i * 4} from={20}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 26px", borderRadius: 16, background: C.ink2, border: `2px dashed ${C.pink}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 30, color: C.paper }}>{a}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 40, color: C.zec }}>{z} ZEC</span>
                </div>
              </Pop>
            ))}
          </div>
          <Pop at={34}>
            <Mono size={26} color={C.pink} style={{ marginTop: 30 }}>
              Public on Midgard. Anyone can look it up.
            </Mono>
          </Pop>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", ...PAD }}>
          <Mono size={30}>So private holders stay out. The whole pool:</Mono>
          <div style={{ fontFamily: DISPLAY, fontSize: 520, lineHeight: 0.9, color: C.zec }}>
            <Count to={22.13} at={0} dur={22} />
          </div>
          <Line at={10} size={110}>
            ZEC. That&apos;s it.
          </Line>
        </AbsoluteFill>
      </Cuts>
    </AbsoluteFill>
  );
};

// ---------- 3. What exists today ----------

const OPTIONS = [
  ["One address", "Deposit from a single t-address.", "Publishes everything"],
  ["Bridge or custodian", "Wrap ZEC on another chain.", "Someone else holds your keys"],
  ["Split by hand", "Shuffle through addresses yourself.", "Same sizes, same minutes, exit in the open"],
];

export const Options: React.FC = () => {
  const { beat } = useT();
  const at = [beat(0.14), beat(0.36), beat(0.62)];
  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", ...PAD }}>
      <div style={{ display: "flex", gap: 40, alignItems: "baseline" }}>
        <Line at={0} size={120}>
          Three ways in.
        </Line>
        <Line at={6} size={120} color={C.pink}>
          All of them leak.
        </Line>
      </div>
      <div style={{ marginTop: 60 }}>
        {OPTIONS.map(([t, d, v], i) => (
          <Pop key={t} at={at[i]}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 640px", alignItems: "center", gap: 30, padding: "30px 0", borderTop: `2px solid ${C.line}` }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 120, lineHeight: 0.8, color: [C.zec, C.thor, C.violet][i] }}>0{i + 1}</span>
              <div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: C.paper }}>{t}</div>
                <Body size={34}>{d}</Body>
              </div>
              <Stamp at={at[i] + 14}>{v}</Stamp>
            </div>
          </Pop>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Stamp: React.FC<{ at: number; children: string }> = ({ at, children }) => {
  const p = useSpring(at, 11, 0.45);
  return (
    <div
      style={{
        justifySelf: "end",
        padding: "14px 26px",
        borderRadius: 16,
        border: `4px solid ${C.pink}`,
        color: C.pink,
        fontFamily: DISPLAY,
        fontSize: 44,
        lineHeight: 1.05,
        textTransform: "uppercase",
        textAlign: "right",
        transform: `scale(${1.5 - 0.5 * p}) rotate(-3deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      ✕ {children}
    </div>
  );
};

// ---------- 4. The idea ----------

const ADDRS = ["t1Kq…4fA", "t1Vb…xW2", "t1Ra…m7Q", "t1Ms…pK0", "t1Ye…cV5"];

export const Idea: React.FC = () => {
  const { beat, fps } = useT();
  const f = useCurrentFrame();
  const split = spring({ frame: f - beat(0.35), fps, config: { damping: 16, mass: 0.9 } });
  const labels = interpolate(f, [beat(0.5), beat(0.5) + 10], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.zec }}>
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center" }}>
        <Line at={0} size={330} color={C.ink} style={{ display: "inline-block" }}>
          Shielded
        </Line>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 470, display: "flex", justifyContent: "center" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              display: "grid",
              justifyItems: "center",
              gap: 14,
              transform: `translateX(${(i - 2) * 330 * split}px) translateY(${(2 - i) * -16 * (1 - split)}px) rotate(${(i - 2) * 8 * split}deg)`,
              zIndex: 5 - Math.abs(i - 2),
            }}
          >
            <Coin size={210} style={{ filter: "drop-shadow(0 22px 26px rgba(13,12,20,.3))" }} />
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, color: C.ink, opacity: labels }}>{ADDRS[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 150, right: 150, bottom: 80, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Pop at={beat(0.05)}>
          <div style={{ fontFamily: DISPLAY, fontSize: 64, color: C.ink, textTransform: "uppercase", lineHeight: 1 }}>A Zcash wallet for THORChain liquidity</div>
          <Body size={36} color={C.ink} style={{ maxWidth: 900, marginTop: 10 }}>
            Self-custody. One shielded balance becomes many small, unlinked positions.
          </Body>
        </Pop>
        <Pop at={beat(0.78)}>
          <div style={{ fontFamily: DISPLAY, fontSize: 90, color: C.ink, textTransform: "uppercase" }}>shielded-lp</div>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 5. How it works ----------

const STEPS = [
  ["Split", "Standard sizes everyone uses"],
  ["Space out", "Each slice at its own random time"],
  ["Join alone", "Fresh address, then THORChain"],
  ["Exit in the dark", "Shield back to fresh Ironwood"],
];
const STEP_COLORS = [C.zec, C.thor, C.violet, C.pink];
const TIMES = ["+7h", "+19h", "+26h", "+38h", "+45h"];

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const How: React.FC = () => {
  const { beat, fps } = useT();
  const f = useCurrentFrame();
  const at = [beat(0.04), beat(0.26), beat(0.45), beat(0.76)];
  let step = 0;
  at.forEach((a, k) => {
    if (f >= a) step = k;
  });
  const sp = (k: number, i = 0, stag = 4) => spring({ frame: f - at[k] - i * stag, fps, config: { damping: 18, mass: 0.8 } });

  // Coin positions inside a 940x640 stage, chained phase by phase.
  const coins = [0, 1, 2, 3, 4].map((i) => {
    let x = 470,
      y = 300,
      s = 1.6,
      label = "5";
    const p0 = sp(0, 0);
    x = lerp(x, 110 + i * 180, p0);
    s = lerp(s, 0.9, p0);
    if (p0 > 0.3) label = "1";
    const p1 = sp(1, i);
    x = lerp(x, [90, 270, 380, 640, 830][i], p1);
    y = lerp(y, 430, p1);
    const p2 = sp(2, i, 6);
    x = lerp(x, 790, p2);
    y = lerp(y, 125 + i * 78, p2);
    const p3 = sp(3, i, 6);
    x = lerp(x, 130, p3);
    y = lerp(y, 125 + i * 78, p3);
    return { x, y, s, label, p2, p3 };
  });
  const zones = sp(2, 0);
  const line = sp(1, 0);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <div style={{ position: "absolute", left: 150, top: 200 }}>
        <Mono size={24} style={{ marginBottom: 30 }}>
          Four moves
        </Mono>
        {STEPS.map(([t, d], i) => (
          <div key={t} style={{ display: "flex", gap: 30, alignItems: "center", padding: "22px 0", borderTop: `2px solid ${C.line}`, opacity: i === step ? 1 : i < step ? 0.45 : 0.18 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 110, lineHeight: 0.85, color: STEP_COLORS[i], width: 120 }}>0{i + 1}</span>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 48, color: C.paper }}>{t}</div>
              <Body size={28}>{d}</Body>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 900, top: 230, width: 940, height: 640 }}>
        {/* zones */}
        <div style={{ position: "absolute", left: 30, top: 90, width: 200, height: 460, borderRadius: 26, background: C.zec, opacity: zones * 0.95, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 18 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 34, color: C.ink, textTransform: "uppercase" }}>{step === 3 ? "Ironwood" : "Shielded"}</span>
        </div>
        <div style={{ position: "absolute", left: 700, top: 90, width: 200, height: 460, borderRadius: 26, background: C.thor, opacity: zones * 0.95, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 18 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 34, color: C.ink, textTransform: "uppercase" }}>THORChain</span>
        </div>
        {/* timeline */}
        <div style={{ position: "absolute", left: 40, right: 40, top: 430, height: 4, background: C.ink3, transform: `scaleX(${line})`, transformOrigin: "left", opacity: 1 - zones }} />
        {coins.map((c, i) => (
          <React.Fragment key={i}>
            {step === 1 && (
              <span style={{ position: "absolute", left: c.x - 40, top: 500, width: 80, textAlign: "center", fontFamily: MONO, fontSize: 24, color: C.thor, opacity: sp(1, i) }}>
                {TIMES[i]}
              </span>
            )}
            {step >= 2 && (
              <span
                style={{
                  position: "absolute",
                  left: 400,
                  top: 125 + i * 78 - 18,
                  width: 150,
                  padding: "4px 0",
                  textAlign: "center",
                  borderRadius: 999,
                  border: `2px dashed ${C.pink}`,
                  fontFamily: MONO,
                  fontSize: 22,
                  color: C.paper,
                  opacity: step === 2 ? Math.min(1, c.p2 * 2) : 1 - c.p3,
                }}
              >
                {ADDRS[i]}
              </span>
            )}
            <div style={{ position: "absolute", left: c.x - 50 * c.s, top: c.y - 50 * c.s }}>
              <Coin size={100 * c.s} label={c.label} gold={step === 3 && c.p3 > 0.6 ? C.zec : C.zec} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- 6. Demo: landing ----------

const LANDING: Cut[] = [
  { src: "clips/landing.mp4", from: 2.2, to: 6.6, speed: 2.2 },
  { src: "clips/landing.mp4", from: 27.0, to: 31.5, speed: 1.6, zoom: [[960, 560, 1.05], [960, 560, 1.1]] },
  { src: "clips/landing.mp4", from: 31.5, to: 34.0, speed: 1.1, zoom: [[960, 520, 1.1], [960, 600, 1.18]] },
  { src: "clips/landing.mp4", from: 34.3, to: 37.4, speed: 1.3, zoom: [[650, 420, 1.3], [760, 480, 1.18]] },
  { src: "clips/landing.mp4", from: 21.4, to: 26.4, speed: 1.9, zoom: [[960, 470, 1.15], [960, 620, 1.22]] },
];
const LANDING_CALLOUTS = ["One balance, five slices", "Public view: nine strangers", "Your view: five are you", "Live from THORChain", "Install in five steps"];

export const Landing: React.FC = () => {
  const { frames: total } = React.useContext(SceneCtx);
  const starts = cutStarts(LANDING, total);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Ghost top={-60}>Landing</Ghost>
      <Footage cuts={LANDING} total={total} url="shielded-lp.vercel.app" />
      {LANDING_CALLOUTS.map((t, i) => (
        <CalloutSlot key={t} at={starts[i]} until={starts[i + 1] ?? total}>
          {t}
        </CalloutSlot>
      ))}
    </AbsoluteFill>
  );
};

const CalloutSlot: React.FC<{ at: number; until: number; children: React.ReactNode }> = ({ at, until, children }) => {
  const f = useCurrentFrame();
  if (f < at || f >= until) return null;
  return (
    <Callout at={at + 4} style={{ left: 110, top: 960 }}>
      {children}
    </Callout>
  );
};

// ---------- 7. Demo: terminal ----------

type Block = { cmd: string; out: string[]; hl?: number[] };
const BLOCKS: Block[] = [
  {
    cmd: "slp --help",
    out: [
      "plan      Split an amount into standard-denomination slices and schedule them",
      "run       Execute pending slice actions until nothing is due (resumable)",
      "status    Show every slice and the owner's aggregate private position",
      "exit      Withdraw LP slices and auto-shield the proceeds back to Ironwood",
      "observer  Show only what a public observer sees on Midgard",
    ],
  },
  {
    cmd: "slp wallet -w ./main/wallet init --name main -i ./main/identity.txt -n main",
    out: ["INFO slp::remote: Connecting to zec.rocks:443", "Generating a new age identity to encrypt the mnemonic phrase"],
    hl: [1],
  },
  {
    cmd: "slp address -n main",
    out: ["u18ujz6zta6kshsptzj9nq8az6syt9h546kwp457e009gvvupyflkv00rqqst48wev9…"],
    hl: [0],
  },
  {
    cmd: "slp plan -n main --amount 5 --denoms 1 --jitter 6h-48h --dry-run",
    out: [
      "Pool ZEC.ZEC depth: 22.13169018 ZEC. Largest slice is 4.5% of depth;",
      "single-sided adds incur slip and price exposure.",
      "slice #0     1.00000000 ZEC  at +727m45s   (preview)",
      "slice #1     1.00000000 ZEC  at +2064m19s  (preview)",
      "slice #2     1.00000000 ZEC  at +4368m29s  (preview)",
      "slice #3     1.00000000 ZEC  at +5951m04s  (preview)",
      "slice #4     1.00000000 ZEC  at +7646m40s  (preview)",
      "Preview: 5 slices; needs 5.00500000 ZEC shielded (incl. reserves).",
    ],
    hl: [0, 2, 3, 4, 5, 6],
  },
  {
    cmd: "cargo test --release slp::",
    out: [
      "test slp::planner::tests::splits_and_parses ... ok",
      "test slp::store::tests::roundtrip ... ok",
      "test slp::thor::tests::memos_and_outbounds ... ok",
      "test slp::chain::tests::tex_decodes_to_same_hash_p2pkh ... ok",
      "test slp::chain::tests::slice_keys_are_deterministic_and_distinct ... ok",
      "test slp::chain::tests::builds_thorchain_add_with_op_return ... ok",
      "test slp::chain::tests::builds_shield_to_ironwood ... ok",
      "test result: ok. 7 passed; 0 failed",
    ],
    hl: [5, 6, 7],
  },
];
const TERM_STEPS = ["Commands", "Wallet", "Address", "Plan", "Proof"];
const LH = 40;

export const Terminal: React.FC = () => {
  const { beat } = useT();
  const f = useCurrentFrame();
  const at = [beat(0.0), beat(0.18), beat(0.35), beat(0.46), beat(0.72)];
  // Build the visible line list.
  type L = { text: string; kind: "cmd" | "out" | "hl" | "blank"; typed?: number };
  const lines: L[] = [];
  let active = 0;
  BLOCKS.forEach((b, k) => {
    const t = f - at[k];
    if (t < 0) return;
    active = k;
    const typed = Math.min(b.cmd.length, Math.floor(t * 3.2));
    lines.push({ text: b.cmd, kind: "cmd", typed });
    const doneAt = Math.ceil(b.cmd.length / 3.2) + 5;
    b.out.forEach((o, j) => {
      if (t >= doneAt + j * 3) lines.push({ text: o, kind: b.hl?.includes(j) ? "hl" : "out" });
    });
    lines.push({ text: "", kind: "blank" });
  });
  const VISIBLE = 18;
  const overflow = Math.max(0, lines.length - VISIBLE);
  const scroll = overflow * LH; // jumps line by line, like a real terminal
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Ghost top={-60}>Terminal</Ghost>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 130,
          width: 1290,
          height: 860,
          borderRadius: 26,
          background: "#0a0910",
          boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 0 2px ${C.ink3}`,
          overflow: "hidden",
        }}
      >
        <div style={{ height: 50, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", background: C.ink2 }}>
          {[C.pink, C.zec, C.thor].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c, opacity: 0.85 }} />
          ))}
          <span style={{ marginLeft: 18, fontFamily: MONO, fontSize: 18, color: C.dim }}>shielded-lp — zsh</span>
        </div>
        <div style={{ position: "relative", height: 810, overflow: "hidden", padding: "22px 30px" }}>
          <div style={{ transform: `translateY(${-scroll}px)` }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  height: LH,
                  fontFamily: MONO,
                  fontSize: 22,
                  whiteSpace: "pre",
                  fontVariantLigatures: "none",
                  fontFeatureSettings: '"liga" 0, "calt" 0',
                  color: l.kind === "cmd" ? C.paper : l.kind === "hl" ? C.zec : C.dim,
                  fontWeight: l.kind === "cmd" ? 600 : 400,
                }}
              >
                {l.kind === "cmd" ? (
                  <>
                    <span style={{ color: C.thor }}>$ </span>
                    {l.text.slice(0, l.typed)}
                    {l.typed! < l.text.length && <span style={{ background: C.paper }}> </span>}
                  </>
                ) : (
                  l.text
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 1460, top: 160, width: 400 }}>
        {TERM_STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", gap: 22, alignItems: "baseline", padding: "16px 0", borderTop: `2px solid ${C.line}`, opacity: i === active ? 1 : i < active ? 0.4 : 0.15 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 80, lineHeight: 0.9, color: [C.dim, C.zec, C.thor, C.violet, C.pink][i] }}>0{i}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 64, color: C.paper, textTransform: "uppercase" }}>{s}</span>
          </div>
        ))}
        <Pop at={at[1] + 30}>
          <Body size={30} style={{ marginTop: 30 }}>
            {["Built on the official Zcash libraries.", "Seed created and encrypted here.", "Fresh shielded address to fund.", "5 × 1 ZEC, hours apart, slip vs live depth.", "Real v6 tx with the THORChain memo, shield back to Ironwood."][active]}
          </Body>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 8. Demo: app ----------

const A = "clips/app.mp4";
const APP: Cut[] = [
  { src: A, from: 0.3, to: 8.0, speed: 2.0, zoom: [[960, 540, 1], [740, 560, 1.25]] },
  { src: A, from: 8.0, to: 12.1, speed: 1.4, zoom: [[740, 700, 1.45], [700, 720, 1.5]] },
  { src: A, from: 14.3, to: 24.4, speed: 1.6, zoom: [[1400, 360, 1.7], [1400, 620, 1.55]] },
  { src: A, from: 24.4, to: 29.0, speed: 2.0, zoom: [[1400, 860, 1.6], [1400, 900, 1.6]] },
  { src: A, from: 29.1, to: 57.5, speed: 7, zoom: [[740, 560, 1.25], [740, 560, 1.25]] },
  { src: A, from: 57.6, to: 62.1, speed: 1.1, zoom: [[700, 420, 1.3], [520, 300, 1.9]] },
  { src: A, from: 62.2, to: 66.4, speed: 1.1, zoom: [[900, 700, 1.5], [1000, 700, 2.0]] },
  { src: A, from: 70.3, to: 80.4, speed: 3, zoom: [[740, 500, 1.2], [740, 500, 1.2]] },
  { src: A, from: 80.4, to: 88.7, speed: 3, zoom: [[1400, 400, 1.55], [1400, 520, 1.55]] },
  { src: A, from: 88.8, to: 128.0, speed: 16, zoom: [[740, 560, 1.25], [740, 560, 1.25]] },
  { src: "clips/closed.mp4", from: 1.2, to: 4.8, speed: 1.6, zoom: [[740, 600, 1.25], [740, 560, 1.25]] },
  { src: "clips/closed.mp4", from: 5.0, to: 8.8, speed: 1.8, zoom: [[1500, 200, 1.6], [1720, 110, 2.2]] },
];
const APP_CALLOUTS = [
  "Live THORChain data",
  "A real chart",
  "Amount, size, spacing",
  "Confirm",
  "Each slice on its own",
  "Always in range",
  "Your entry on the chart",
  "Public view: strangers",
  "Remove",
  "Each slice exits alone",
  "Back in your shielded balance",
  "Shielded again",
];

export const App: React.FC = () => {
  const { frames: total } = React.useContext(SceneCtx);
  const starts = cutStarts(APP, total);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Ghost top={-60}>The app</Ghost>
      <Footage cuts={APP} total={total} url="shielded-lp.vercel.app/app" />
      {APP_CALLOUTS.map((t, i) => (
        <CalloutSlot key={t} at={starts[i]} until={starts[i + 1] ?? total}>
          {t}
        </CalloutSlot>
      ))}
    </AbsoluteFill>
  );
};

// ---------- 9. CTA ----------

export const Cta: React.FC = () => {
  const { beat } = useT();
  const bounce = useSpring(beat(0.05), 9, 0.6);
  return (
    <AbsoluteFill style={{ background: C.zec, justifyContent: "center", ...PAD }}>
      <div style={{ position: "absolute", right: 90, bottom: 60, transform: `scale(${bounce}) rotate(${(1 - bounce) * -40}deg)` }}>
        <Coin size={230} />
      </div>
      <Line at={0} size={200} color={C.ink}>
        Your liquidity.
      </Line>
      <Line at={7} size={200} color={C.ink}>
        Nobody&apos;s business.
      </Line>
      <div style={{ display: "flex", gap: 40, marginTop: 70 }}>
        <Pop at={beat(0.38)}>
          <div style={{ padding: "26px 40px", borderRadius: 24, background: C.ink, color: C.paper }}>
            <Mono size={22} color={C.zec}>
              Try the demo
            </Mono>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 46, whiteSpace: "nowrap" }}>shielded-lp.vercel.app</div>
          </div>
        </Pop>
        <Pop at={beat(0.62)}>
          <div style={{ padding: "26px 40px", borderRadius: 24, border: `4px solid ${C.ink}`, color: C.ink }}>
            <Mono size={22} color={C.ink}>
              Install it
            </Mono>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 46, whiteSpace: "nowrap" }}>github.com/riorblade/shielded-lp</div>
          </div>
        </Pop>
      </div>
      <Pop at={beat(0.8)}>
        <Mono size={24} color={C.ink} style={{ marginTop: 50 }}>
          Built for Zecathon 2026 / Private Markets / open source
        </Mono>
      </Pop>
    </AbsoluteFill>
  );
};
