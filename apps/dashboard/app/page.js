"use client";

import { AnimatePresence, LayoutGroup, motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import AreaChart from "../components/AreaChart";
import { usd, usePool, zecFmt } from "../lib/usePool";
import "./landing.css";

const REPO = "https://github.com/riorblade/shielded-lp";

function Coin({ size = 100 }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true" className="coin">
      <circle r="48" fill="#0d0c14" />
      <circle r="40" fill="none" stroke="#f4b728" strokeWidth="5" />
      <path d="M-15-14H15L-15 14H15M0-22V-14M0 14V22" fill="none" stroke="#f4b728" strokeWidth="7" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

// ---------- Hero: one balance splits into five unlinked slices as you scroll ----------

const SLICE_ADDR = ["t1Kq…4fA", "t1Vb…xW2", "t1Ra…m7Q", "t1Ms…pK0", "t1Ye…cV5"];

function HeroCoin({ p, i }) {
  const spread = (i - 2) * 19; // vw
  const x = useTransform(p, [0, 0.7], ["0vw", `${spread}vw`]);
  const y = useTransform(p, [0, 0.7], [(2 - i) * -14, 0]);
  const rotate = useTransform(p, [0, 0.7], [0, (i - 2) * 8]);
  const label = useTransform(p, [0.55, 0.8], [0, 1]);
  return (
    <motion.div className="hero-coin" style={{ x, y, rotate, zIndex: 5 - Math.abs(i - 2) }}>
      <Coin size={180} />
      <motion.span className="mono" style={{ opacity: label }}>
        {SLICE_ADDR[i]}
      </motion.span>
    </motion.div>
  );
}

function Hero({ pool }) {
  const ref = useRef(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const word = useTransform(p, [0, 0.7], ["0%", "-8%"]);
  return (
    <header className="hero" id="top" ref={ref}>
      <div className="hero-sticky">
        <nav className="nav">
          <a href="#top" className="logo display">
            <Coin size={26} /> shielded-lp
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#wallet">The wallet</a>
            <a href="#install">Install</a>
            <a href="#pool">Live pool</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <Link href="/app" className="pill">
            Try the demo
          </Link>
        </nav>

        <motion.h1 className="hero-word display" style={{ y: word }} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1 }}>
          Shielded
        </motion.h1>

        <div className="hero-coins">
          {[0, 1, 2, 3, 4].map((i) => (
            <HeroCoin key={i} p={p} i={i} />
          ))}
        </div>

        <div className="hero-foot">
          <div>
            <h2 className="display">A Zcash wallet for THORChain liquidity</h2>
            <p>
              Self-custody, on your own computer. It splits your shielded ZEC into unlinked slices so nobody can tie the position
              back to you.
            </p>
            <p className="ticker mono">
              ZEC {pool ? usd(pool.price_usd) : "…"} / pool {pool ? zecFmt(pool.depth_zat / 1e8) : "…"} / {pool?.lp_count ?? "…"} LPs
              <span className={`live-dot ${pool && !pool.halted ? "on" : ""}`} />
            </p>
          </div>
          <div className="hero-ctas">
            <a href="#install" className="big-link display">
              Install <Arrow />
            </a>
            <Link href="/app" className="small-link">
              or try the demo in your browser
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------- Why ----------

const LEAKS = [
  ["Size", "500 ZEC, one line on Midgard."],
  ["Timing", "Added 14:02 UTC, minutes after a shielded withdrawal."],
  ["History", "Every earlier and later move of that address."],
];

function Why({ pool }) {
  return (
    <section className="why">
      <span className="ghost display" aria-hidden="true">
        Public
      </span>
      <p className="eyebrow mono">Why it exists</p>
      <h2 className="display">
        THORChain reads only transparent ZEC.
        <span className="grad"> So every LP publishes their wallet.</span>
      </h2>
      <p className="lede">
        Zcash has no smart contracts, so native ZEC liquidity lives on THORChain. A position belongs to the <code>t1</code> address
        that deposited it, and anyone can look it up. Most shielded holders stay out, and the pool stays shallow
        {pool ? `: ${zecFmt(pool.depth_zat / 1e8)} today` : ""}.
      </p>

      <div className="leaks">
        <p className="eyebrow mono">What one deposit tells the world</p>
        {LEAKS.map(([w, d], i) => (
          <div className="leak" key={w}>
            <span className="mono n">0{i + 1}</span>
            <motion.h3
              className="display"
              initial={{ color: "rgba(244,183,40,0)" }}
              whileInView={{ color: "rgba(244,183,40,1)" }}
              viewport={{ margin: "-40% 0px -40% 0px" }}
              transition={{ duration: 0.35 }}
            >
              {w}
            </motion.h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- How it works ----------

const STEPS = [
  ["Split", "Your shielded amount is cut into standard sizes that everyone uses, like 1 ZEC.", "5 ZEC  →  5 × 1 ZEC"],
  ["Space out", "Each slice gets its own random start time: minutes for a demo, days for real money.", "+7 min   +23 min   +41 min"],
  ["Join alone", "Each slice is funded from the shielded pool to a fresh address, then adds single-sided ZEC to THORChain.", "t1Kq…  t1Vb…  t1Ra…"],
  ["Exit in the dark", "On exit every slice withdraws from its own address and is shielded again to a fresh Ironwood address.", "→ u1… Ironwood"],
];

function How() {
  return (
    <section className="how" id="how">
      <p className="eyebrow mono">How it works</p>
      <ol>
        {STEPS.map(([t, d, ex], i) => (
          <motion.li key={t} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}>
            <span className={`num display c${i}`}>0{i + 1}</span>
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
            <code>{ex}</code>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

// ---------- The wallet ----------

const WALLET = [
  ["Your keys", "A 24-word seed is created on your computer and stored encrypted with a key file only you hold. No account, no sign-up, no server, no custody."],
  ["Your slices", "Every slice address is derived from that same seed, one index per slice. Back up the seed and one small database file and you can recover every position."],
  ["Your app", "The app runs at 127.0.0.1 on your machine. It talks to Zcash through a public lightwalletd server and reads THORChain's public API. Nothing else sees your keys."],
];

function Wallet() {
  return (
    <section className="wallet-sec" id="wallet">
      <p className="eyebrow mono">The wallet</p>
      <h2 className="display">
        It is a wallet.
        <br />
        It lives on your machine.
      </h2>
      <ul className="facts">
        {WALLET.map(([t, d], i) => (
          <li key={t}>
            <span className={`num display c${i}`}>0{i + 1}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ul>
      <p className="aside">
        <strong>Why no &ldquo;Connect wallet&rdquo; button?</strong> Zcash wallets do not yet let a website ask for these
        transactions (a deposit with a THORChain memo from a fresh address), so shielded-lp is the wallet. You fund it from the
        wallet you already use, like Zashi, Ywallet or an exchange.
      </p>
    </section>
  );
}

// ---------- Install ----------

const INSTALL = [
  ["Get the code and build it", "Takes a few minutes the first time.", "git clone https://github.com/riorblade/shielded-lp\ncd shielded-lp\ncargo build --release"],
  [
    "Create your wallet",
    "Press Enter at the prompt to generate a new 24-word seed. It is encrypted to main/identity.txt.",
    "./target/release/slp wallet -w ./main/wallet init \\\n  --name main -i ./main/identity.txt -n main",
  ],
  [
    "Write down your seed",
    "Copy the 24 words to paper. Also back up main/identity.txt and, once you add liquidity, main/slices.sqlite.",
    "./target/release/slp wallet -w ./main/wallet display-mnemonic \\\n  -i ./main/identity.txt --enable",
  ],
  ["Start the app", "Then open http://127.0.0.1:3000/app in your browser.", "cd apps/dashboard\npnpm install\npnpm dev"],
  ["Fund it and add liquidity", "Click Receive for a shielded address, send ZEC to it from any wallet, then Add liquidity privately. Start with a small amount.", null],
];

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Install() {
  return (
    <section className="install" id="install">
      <p className="eyebrow mono">Install</p>
      <h2 className="display">Five steps to your own copy.</h2>
      <p className="lede">
        Needs macOS or Linux, <a href="https://rustup.rs">Rust</a>, Node 20+ and <a href="https://pnpm.io">pnpm</a>. Just want
        to see it work? <Link href="/app">The demo</Link> runs the same app in your browser with a simulated wallet and no
        install.
      </p>
      <ol>
        {INSTALL.map(([t, d, cmd], i) => (
          <li key={t}>
            <span className={`num display c${i % 4}`}>0{i + 1}</span>
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
            {cmd && (
              <div className="cmd">
                <div className="cmd-bar">
                  <span className="mono">Terminal</span>
                  <Copy text={cmd} />
                </div>
                <pre>
                  <code>{cmd}</code>
                </pre>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="warning">
        This is hackathon software on Zcash mainnet. Use amounts you can afford to lose, and keep your seed offline.
      </p>
    </section>
  );
}

// ---------- Two views ----------

const ROWS = [
  { a: "t1Kq8sZ…4fA", z: 1, d: "Oct 12", mine: true },
  { a: "t1JVSs2…qutEK", z: 0.115, d: "Oct 4" },
  { a: "t1Vb3nP…xW2", z: 1, d: "Oct 13", mine: true },
  { a: "t1S3MY7…RCHsm", z: 0.3, d: "Oct 26" },
  { a: "t1Ra9Lc…m7Q", z: 1, d: "Oct 15", mine: true },
  { a: "t1MKZNe…n1oM", z: 0.037, d: "Oct 26" },
  { a: "t1Ms2Hd…pK0", z: 1, d: "Oct 18", mine: true },
  { a: "t1R391R…b9yWU", z: 18, d: "Oct 3" },
  { a: "t1Ye7Tg…cV5", z: 1, d: "Oct 21", mine: true },
];

function Views() {
  const [owner, setOwner] = useState(false);
  const rows = owner ? [...ROWS].sort((a, b) => Boolean(b.mine) - Boolean(a.mine)) : ROWS;
  return (
    <motion.section className="views" id="views" animate={{ backgroundColor: owner ? "#f4b728" : "#8a7cf8" }} transition={{ duration: 0.5 }}>
      <div className="corner mono">
        <span>ZEC.ZEC pool on Midgard</span>
        <span>Sample data</span>
      </div>
      <div className="switch" role="tablist" aria-label="Choose a view">
        <button role="tab" aria-selected={!owner} className={!owner ? "on" : ""} onClick={() => setOwner(false)}>
          Public view
        </button>
        <button role="tab" aria-selected={owner} className={owner ? "on" : ""} onClick={() => setOwner(true)}>
          Your view
        </button>
      </div>
      <AnimatePresence mode="wait">
        <motion.h2
          key={owner ? "o" : "p"}
          className="display"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.35 }}
        >
          {owner ? "Five of them are you." : "Nine strangers."}
        </motion.h2>
      </AnimatePresence>
      <p className="views-sub">
        {owner
          ? "5.00 ZEC in one private position. Only your machine knows these rows belong together."
          : "Small, unrelated providers. Nothing links them to each other or to a shielded wallet."}
      </p>
      <LayoutGroup>
        <ul className="rows">
          {rows.map((r) => (
            <motion.li key={r.a} layout transition={{ type: "spring", stiffness: 300, damping: 32 }} className={owner && r.mine ? "mine" : ""}>
              <code>{r.a}</code>
              <span className="display">{r.z.toFixed(r.z < 1 ? 3 : 2)} ZEC</span>
              <span className="d">{r.d}</span>
            </motion.li>
          ))}
        </ul>
      </LayoutGroup>
    </motion.section>
  );
}

// ---------- Live pool ----------

function Live({ pool, history }) {
  const [field, setField] = useState("depth");
  return (
    <section className="live" id="pool">
      <p className="eyebrow mono">Live from thornode and Midgard</p>
      <div className="live-head">
        <div>
          <strong className="display">{pool ? (pool.depth_zat / 1e8).toFixed(2) : "…"}</strong>
          <span>ZEC in THORChain&apos;s native pool, live since Oct 2, 2026.</span>
        </div>
        <dl>
          <div>
            <dt>ZEC price</dt>
            <dd className="display">{pool ? usd(pool.price_usd) : "…"}</dd>
          </div>
          <div>
            <dt>Providers</dt>
            <dd className="display">{pool?.lp_count ?? "…"}</dd>
          </div>
          <div>
            <dt>Exit fee</dt>
            <dd className="display">{pool ? `${(pool.outbound_fee / 1e8).toFixed(5)}` : "…"}</dd>
          </div>
        </dl>
      </div>
      <div className="switch dark" role="tablist" aria-label="Chart">
        <button className={field === "depth" ? "on" : ""} onClick={() => setField("depth")}>
          Liquidity
        </button>
        <button className={field === "price" ? "on" : ""} onClick={() => setField("price")}>
          Price
        </button>
      </div>
      <AreaChart
        key={field}
        points={history}
        field={field}
        format={field === "price" ? usd : zecFmt}
        height={300}
        label={field === "price" ? "ZEC price in the pool, USD" : "ZEC liquidity in the pool"}
      />
    </section>
  );
}

// ---------- Privacy ----------

const TABLE = [
  ["Which shielded wallet funded the slices", "Hidden", "Shielded to transparent hides the sender."],
  ["Your total liquidity", "Hidden", "Only per-slice sizes are public, and nothing links them."],
  ["Where the money goes after exit", "Hidden", "Shielded again to a fresh Ironwood address."],
  ["Links between slices", "Weakened", "Standard sizes, random timing, fresh addresses."],
  ["Timing patterns", "Partly", "The pool has few providers. Use days of spacing for real funds."],
  ["Each slice's amount and address", "Public", "Visible on Zcash and Midgard, by design."],
];

function Privacy() {
  return (
    <section className="privacy">
      <p className="eyebrow mono">The honest version</p>
      <h2 className="display">Unlinkable, not invisible.</h2>
      <p className="lede">
        THORChain only reads transparent ZEC, so each slice briefly steps into the open. What we hide is the link between the
        slices and you.
      </p>
      <ul>
        {TABLE.map(([what, level, why]) => (
          <li key={what}>
            <span className="what">{what}</span>
            <span className={`lvl display ${level.toLowerCase()}`}>{level}</span>
            <span className="why-t">{why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cta() {
  return (
    <section className="cta">
      <h2 className="display">
        Your liquidity.
        <br />
        Nobody&apos;s business.
      </h2>
      <div className="cta-row">
        <p>
          No vault, no custody, no server. Every transaction is built and signed from your own seed, on your machine, and checked
          before it is broadcast.
        </p>
        <div className="hero-ctas">
          <a href="#install" className="big-link display">
            Install <Arrow />
          </a>
          <Link href="/app" className="small-link">
            or try the demo in your browser
          </Link>
        </div>
      </div>
      <footer className="foot mono">
        <span>shielded-lp / Zecathon 2026</span>
        <span>Single-sided liquidity carries slip and price exposure. Returns are not guaranteed.</span>
        <a href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </section>
  );
}

export default function Landing() {
  const { pool, history } = usePool("1m");
  return (
    <div className="landing">
      <Hero pool={pool} />
      <Why pool={pool} />
      <How />
      <Wallet />
      <Install />
      <Views />
      <Live pool={pool} history={history} />
      <Privacy />
      <Cta />
    </div>
  );
}
