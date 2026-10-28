// Pool history for the charts. Midgard first; if it is down, sample thornode at past
// block heights (thornode serves archive state), so the charts never go blank.
const MIDGARD = process.env.MIDGARD_URL || "https://gateway.liquify.com/chain/thorchain_midgard";
const THORNODE = process.env.THORNODE_URL || "https://gateway.liquify.com/chain/thorchain_api";

// range -> Midgard interval/count, and the thornode fallback: span in hours, sample count
export const RANGES = {
  "24h": { interval: "hour", count: 24, hours: 24, samples: 24 },
  "7d": { interval: "hour", count: 168, hours: 168, samples: 42 },
  "1m": { interval: "day", count: 31, hours: 744, samples: 31 },
};

const json = async (url, revalidate) => {
  const r = await fetch(url, { next: { revalidate } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// The first days of the pool were bootstrap noise; skip points with under 5 ZEC of depth.
const keep = (p) => p.price > 0 && p.depth >= 5;

async function fromMidgard({ interval, count }) {
  const { intervals } = await json(`${MIDGARD}/v2/history/depths/ZEC.ZEC?interval=${interval}&count=${count}`, 300);
  return intervals
    .map((i) => ({
      t: Number(i.startTime),
      price: Number(i.closePriceUSD || i.assetPriceUSD),
      depth: Number(i.assetDepth) / 1e8,
    }))
    .filter(keep);
}

const blockTime = async (h) =>
  Date.parse((await json(`${THORNODE}/cosmos/base/tendermint/v1beta1/blocks/${h}`, 86400)).block.header.time) / 1000;

export const poolAt = async (h) => {
  const p = await json(`${THORNODE}/thorchain/pool/ZEC.ZEC${h ? `?height=${h}` : ""}`, h ? 86400 : 30);
  return { price: Number(p.asset_tor_price) / 1e8, depth: Number(p.balance_asset) / 1e8 };
};

export async function tipHeight() {
  const blocks = await json(`${THORNODE}/thorchain/lastblock`, 30);
  return Number(blocks[0].thorchain);
}

async function fromThornode({ hours, samples }) {
  // ~6 s blocks: 600 per hour. Round the tip to the hour so cached heights are reused.
  const tip = Math.floor((await tipHeight()) / 600) * 600;
  const span = hours * 600;
  const [tTip, tOld] = await Promise.all([blockTime(tip), blockTime(tip - span)]);
  const heights = Array.from({ length: samples + 1 }, (_, i) => tip - span + Math.round((span * i) / samples));
  const out = [];
  for (let i = 0; i < heights.length; i += 8) {
    const batch = await Promise.all(heights.slice(i, i + 8).map((h) => poolAt(h).catch(() => null)));
    batch.forEach((p, j) => {
      const h = heights[i + j];
      if (p) out.push({ t: Math.round(tOld + ((tTip - tOld) * (h - (tip - span))) / span), ...p });
    });
  }
  return out.filter(keep);
}

export async function history(range) {
  const r = RANGES[range] ?? RANGES["1m"];
  try {
    const points = await fromMidgard(r);
    if (points.length > 2) return { source: "midgard", points };
  } catch {}
  return { source: "thornode", points: await fromThornode(r) };
}
