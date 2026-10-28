"use client";

import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import AreaChart from "../components/AreaChart";
import { usd, usePool, zecFmt } from "../lib/usePool";
import "./landing.css";

// MotionSites assets (Vaultra hero globe, Crypto Vault mountain), hotlinked as their prompts specify.
const HERO_VIDEO = "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e71aea27-a808-4ae3-8231-a469d49285d4.mp4";
const HERO_STILL = "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/f1631235-0a76-464d-8f1d-2c4b48a997d5.jpg";
const CTA_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_235157_a2db1448-9c00-4add-bb3b-5a1e74991a32.mp4";
const CTA_STILL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_235213_406a82ca-a782-471c-8a1c-184a9176c232.png";
const REPO = "https://github.com/riorblade/shielded-lp";

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] } }),
};

function Reveal({ children, i = 0, className, as = "div" }) {
  const M = motion[as];
  return (
    <M className={className} variants={rise} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
      {children}
    </M>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 1 20 5v6c0 5-4 9-9 10C6 20 2 16 2 11V5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9h8M7 12h6M7 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Nav() {
  return (
    <motion.nav className="nav" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
      <a href="#top" className="logo">
        <Mark /> shielded-lp
      </a>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#views">Two views</a>
        <a href="#pool">Live pool</a>
        <a href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
      <Link href="/app" className="pill pill-light">
        Launch app
      </Link>
    </motion.nav>
  );
}

function Hero({ pool }) {
  const lines = ["Provide liquidity.", "Leave no trail."];
  return (
    <header className="hero" id="top">
      <div className="hero-media" aria-hidden="true">
        <img src={HERO_STILL} alt="" />
        <video src={HERO_VIDEO} autoPlay muted loop playsInline preload="auto" />
      </div>
      <div className="hero-inner">
        <motion.span className="chip" variants={rise} initial="hidden" animate="show" custom={1}>
          Zcash shielded pool × THORChain liquidity
        </motion.span>
        <h1>
          {lines.map((l, i) => (
            <motion.span key={l} className="line" variants={rise} initial="hidden" animate="show" custom={2 + i}>
              {l}
            </motion.span>
          ))}
        </h1>
        <motion.p className="hero-sub" variants={rise} initial="hidden" animate="show" custom={4}>
          Earn from THORChain's native ZEC pool without tying your shielded wallet, your size or your timing to a public
          position. Non-custodial: your keys never leave your machine.
        </motion.p>
        <motion.div className="hero-cta" variants={rise} initial="hidden" animate="show" custom={5}>
          <Link href="/app" className="pill pill-light">
            Launch app
          </Link>
          <a href="#how" className="pill pill-ghost">
            See how it works
          </a>
        </motion.div>
      </div>
      <motion.dl className="ticker" variants={rise} initial="hidden" animate="show" custom={6}>
        <div>
          <dt>ZEC price</dt>
          <dd>{pool ? usd(pool.price_usd) : "—"}</dd>
        </div>
        <div>
          <dt>THORChain ZEC pool</dt>
          <dd>{pool ? zecFmt(pool.depth_zat / 1e8) : "—"}</dd>
        </div>
        <div>
          <dt>Liquidity providers</dt>
          <dd>{pool?.lp_count ?? "—"}</dd>
        </div>
        <div>
          <dt>Pool status</dt>
          <dd>
            <span className={`dot ${pool && !pool.halted ? "live" : ""}`} />
            {pool ? (pool.halted ? "Paused" : pool.status) : "—"}
          </dd>
        </div>
      </motion.dl>
    </header>
  );
}

function Problem({ pool }) {
  return (
    <section className="problem">
      <Reveal as="h2">Today, providing liquidity means publishing your wallet.</Reveal>
      <div className="problem-grid">
        <Reveal i={1} className="problem-copy">
          <p>
            Zcash has no smart contracts, so native ZEC liquidity lives on THORChain. THORChain only reads transparent ZEC: a
            position belongs to the <code>t1…</code> address that deposited it, and anyone can look it up.
          </p>
          <p>
            So a shielded holder who wants to provide liquidity has to step into the open with their whole stack, at one
            moment, from one address. Most don't. The pool stays shallow
            {pool ? `: ${zecFmt(pool.depth_zat / 1e8)} today` : ""}.
          </p>
        </Reveal>
        <Reveal i={2} className="exposed">
          <div className="exposed-card" aria-hidden="true">
            <span className="mono">t1Wh4le…9xQ</span>
            <strong>500.00 ZEC</strong>
            <span>added 14:02 UTC</span>
          </div>
          <svg viewBox="0 0 300 120" className="trace" aria-hidden="true">
            <motion.path
              d="M150 0 C150 60 40 50 40 120 M150 0 C150 60 260 50 260 120 M150 0 V120"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.6, ease: "easeInOut" }}
            />
          </svg>
          <div className="exposed-tags">
            <span>size</span>
            <span>timing</span>
            <span>history</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- How it works: a scroll-driven story ----------

const STEPS = [
  ["Start shielded", "Your ZEC sits in Zcash's Ironwood shielded pool. Balance and history are invisible to everyone."],
  ["Split into standard sizes", "The amount is cut into sizes everyone uses (for example 1 ZEC), each with its own random start time."],
  ["Each slice joins alone", "Every slice gets a fresh address from your seed, is funded from the shielded pool, and adds single-sided liquidity to THORChain."],
  ["Exit back into the dark", "On exit each slice withdraws from its own address and is shielded again to a fresh Ironwood address."],
];
const COINS = 5;
const SHIELD = { x: 110, y: 230 };
const THOR = { x: 440, y: 230 };

function coinPos(step, i) {
  const a = (i / COINS) * Math.PI * 2 - Math.PI / 2;
  if (step === 1) return { x: 290, y: 90 + i * 70 };
  if (step === 2) return { x: THOR.x + Math.cos(a) * 62, y: THOR.y + Math.sin(a) * 62 };
  return { x: SHIELD.x + Math.cos(a) * 18, y: SHIELD.y + Math.sin(a) * 18 };
}

function HowItWorks() {
  const ref = useRef(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(3, Math.floor(v * 4))));
  const bar = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section className="how" id="how" ref={ref}>
      <div className="how-sticky">
        <div className="how-copy">
          <h2>How it works</h2>
          <ol>
            {STEPS.map(([t, d], i) => (
              <li key={t} className={i === step ? "on" : ""} aria-current={i === step ? "step" : undefined}>
                <span className="n">{i + 1}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="how-bar">
            <motion.span style={{ width: bar }} />
          </div>
        </div>
        <svg className="how-viz" viewBox="0 0 600 460" role="img" aria-label={`Step ${step + 1}: ${STEPS[step][0]}`}>
          <defs>
            <radialGradient id="glow">
              <stop offset="0%" stopColor="#E0B94C" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#E0B94C" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={SHIELD.x} cy={SHIELD.y} r="86" className="ring" />
          <circle cx={THOR.x} cy={THOR.y} r="92" className="ring thor" />
          <text x={SHIELD.x} y={SHIELD.y + 120} className="viz-label">
            Ironwood shielded pool
          </text>
          <text x={THOR.x} y={THOR.y + 126} className="viz-label">
            THORChain ZEC.ZEC
          </text>
          <motion.circle
            cx={SHIELD.x}
            cy={SHIELD.y}
            fill="url(#glow)"
            animate={{ r: step === 0 || step === 3 ? 70 : 30, opacity: step === 0 || step === 3 ? 1 : 0.4 }}
            transition={{ duration: 0.8 }}
          />
          {step >= 2 &&
            Array.from({ length: COINS }, (_, i) => {
              const p = coinPos(2, i);
              return (
                <motion.line
                  key={`l${i}`}
                  x1={SHIELD.x}
                  y1={SHIELD.y}
                  x2={p.x}
                  y2={p.y}
                  className="flow"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1, opacity: step === 2 ? 1 : 0 }}
                  transition={{ duration: 0.6, delay: i * 0.25 }}
                />
              );
            })}
          {Array.from({ length: COINS }, (_, i) => {
            const p = coinPos(step, i);
            return (
              <motion.g key={i} initial={false} animate={{ x: p.x, y: p.y }} transition={{ duration: 0.9, delay: step === 1 ? 0 : i * 0.22, ease: [0.22, 1, 0.36, 1] }}>
                <circle r="15" className="coin" />
                <text className="coin-t" dy="4">
                  1
                </text>
                <AnimatePresence>
                  {step === 1 && (
                    <motion.text key="t" className="coin-side" x="26" dy="4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {`starts +${[7, 23, 41, 66, 90][i]} min`}
                    </motion.text>
                  )}
                  {step === 2 && (
                    <motion.text
                      key="a"
                      className="coin-side mono"
                      x={i < 3 ? 24 : -24}
                      textAnchor={i < 3 ? "start" : "end"}
                      dy="4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {["t1Kq…", "t1Vb…", "t1Ra…", "t1Ms…", "t1Ye…"][i]}
                    </motion.text>
                  )}
                </AnimatePresence>
              </motion.g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

// ---------- Two views: the core idea, interactive ----------

const CARDS = [
  { a: "t1Kq8sZ…4fA", z: 1, d: "Oct 12", mine: true },
  { a: "t1JVSs2…qutEK", z: 0.115, d: "Oct 4", mine: false },
  { a: "t1Vb3nP…xW2", z: 1, d: "Oct 13", mine: true },
  { a: "t1S3MY7…RCHsm", z: 0.3, d: "Oct 26", mine: false },
  { a: "t1Ra9Lc…m7Q", z: 1, d: "Oct 15", mine: true },
  { a: "t1MKZNe…n1oM", z: 0.037, d: "Oct 26", mine: false },
  { a: "t1Ms2Hd…pK0", z: 1, d: "Oct 18", mine: true },
  { a: "t1R391R…b9yWU", z: 18, d: "Oct 3", mine: false },
  { a: "t1Ye7Tg…cV5", z: 1, d: "Oct 21", mine: true },
];

function TwoViews() {
  const [owner, setOwner] = useState(false);
  const shown = owner ? [...CARDS].sort((a, b) => b.mine - a.mine) : CARDS;
  const total = CARDS.filter((c) => c.mine).reduce((s, c) => s + c.z, 0);
  return (
    <section className="views" id="views">
      <Reveal as="h2">Same chain. Two very different pictures.</Reveal>
      <Reveal i={1} as="p" className="section-sub">
        Midgard lists every position on its own. Only your wallet knows which ones belong together.
      </Reveal>
      <div className="toggle" role="tablist" aria-label="Choose a view">
        <button role="tab" aria-selected={!owner} className={!owner ? "on" : ""} onClick={() => setOwner(false)}>
          What the public sees
        </button>
        <button role="tab" aria-selected={owner} className={owner ? "on" : ""} onClick={() => setOwner(true)}>
          What you see
        </button>
      </div>
      <LayoutGroup>
        <motion.ul className={`cards ${owner ? "owner" : ""}`} layout>
          {shown.map((c) => (
            <motion.li key={c.a} layout transition={{ type: "spring", stiffness: 260, damping: 30 }} className={owner ? (c.mine ? "mine" : "other") : ""}>
              <span className="mono">{c.a}</span>
              <strong>{c.z.toFixed(c.z < 1 ? 3 : 2)} ZEC</strong>
              <span>first added {c.d}</span>
            </motion.li>
          ))}
        </motion.ul>
        <AnimatePresence mode="wait">
          <motion.p key={owner ? "o" : "p"} className="views-note" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {owner
              ? `Five of these are yours: ${total.toFixed(2)} ZEC in one private position, assembled only on your machine.`
              : "Nine small, unrelated providers. No link between them, and none to a shielded wallet."}
          </motion.p>
        </AnimatePresence>
      </LayoutGroup>
      <p className="fine">Illustration. Gray entries mirror real ZEC positions on Midgard; gold ones are a sample plan.</p>
    </section>
  );
}

function LivePool({ pool, history }) {
  return (
    <section className="live" id="pool">
      <Reveal as="h2">A real pool, live.</Reveal>
      <Reveal i={1} as="p" className="section-sub">
        THORChain launched its native ZEC pool on Oct 2, 2026. These numbers come straight from thornode and Midgard.
      </Reveal>
      <div className="live-grid">
        <Reveal i={1}>
          <AreaChart points={history} field="price" format={usd} label="ZEC price in the pool, USD" />
        </Reveal>
        <Reveal i={2}>
          <AreaChart points={history} field="depth" format={zecFmt} label="ZEC liquidity in the pool" />
        </Reveal>
      </div>
      <dl className="live-stats">
        <div>
          <dt>Providers today</dt>
          <dd>{pool?.lp_count ?? "—"}</dd>
        </div>
        <div>
          <dt>Inbound vault</dt>
          <dd className="mono">{pool?.vault ? `${pool.vault.slice(0, 10)}…` : "—"}</dd>
        </div>
        <div>
          <dt>Withdraw outbound fee</dt>
          <dd>{pool ? `${(pool.outbound_fee / 1e8).toFixed(5)} ZEC` : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

const TABLE = [
  ["Which shielded wallet funded the slices", "Hidden", "Shielded → transparent hides the sender"],
  ["Your total liquidity", "Hidden", "Only per-slice sizes are public, and nothing links them"],
  ["Each slice's amount and address", "Public", "Visible on Zcash and Midgard, by design"],
  ["Links between slices", "Weakened", "Standard sizes, random timing, fresh addresses"],
  ["Where the money goes after exit", "Hidden", "Shielded again to a fresh Ironwood address"],
  ["Timing patterns", "Partly", "The pool has few providers; use days of spacing for real funds"],
];

function Privacy() {
  return (
    <section className="privacy">
      <Reveal as="h2">What stays private, honestly.</Reveal>
      <Reveal i={1} as="p" className="section-sub">
        THORChain only reads transparent ZEC, so each slice briefly steps into the open. The claim is unlinkable liquidity,
        not invisible liquidity.
      </Reveal>
      <div className="table" role="table">
        {TABLE.map(([what, level, why], i) => (
          <Reveal key={what} i={i * 0.5} className="tr">
            <span role="cell">{what}</span>
            <span role="cell" className={`lvl ${level.toLowerCase()}`}>
              {level}
            </span>
            <span role="cell" className="why">
              {why}
            </span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const STACK = [
  ["No vault, no custody", "There is no contract and no server holding funds. Every transaction is built and signed from your own seed, on your machine."],
  ["Ironwood-ready", "Built on librustzcash and zcash-devtool: v6 transactions, ZIP-317 fees, shielding into the NU6.3 Ironwood pool."],
  ["Checked before it signs", "Pool status, halt flags, memo size and the exact outputs are verified before anything is broadcast."],
];

function Stack() {
  return (
    <section className="stack">
      {STACK.map(([t, d], i) => (
        <Reveal key={t} i={i} className="stack-card">
          <h3>{t}</h3>
          <p>{d}</p>
        </Reveal>
      ))}
    </section>
  );
}

function Cta() {
  return (
    <section className="cta">
      <div className="cta-media" aria-hidden="true">
        <img src={CTA_STILL} alt="" />
        <video src={CTA_VIDEO} autoPlay muted loop playsInline preload="none" />
      </div>
      <Reveal as="h2">Your liquidity. Nobody's business.</Reveal>
      <Reveal i={1} className="hero-cta">
        <Link href="/app" className="pill pill-light">
          Launch app
        </Link>
        <a href={REPO} className="pill pill-ghost" target="_blank" rel="noreferrer">
          Read the code
        </a>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  const { pool, history } = usePool("day");
  return (
    <div className="landing">
      <Nav />
      <Hero pool={pool} />
      <Problem pool={pool} />
      <HowItWorks />
      <TwoViews />
      <LivePool pool={pool} history={history} />
      <Privacy />
      <Stack />
      <Cta />
      <footer className="foot">
        <span>
          <Mark /> shielded-lp
        </span>
        <span>Built for Zecathon 2026. Single-sided liquidity carries slip and price exposure; returns are not guaranteed.</span>
        <a href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
