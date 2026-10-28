// Read-only proxy for Midgard pool history: price, depth and providers over time.
export const revalidate = 300;

const MIDGARD = process.env.MIDGARD_URL || "https://gateway.liquify.com/chain/thorchain_midgard";

export async function GET(req) {
  const interval = new URL(req.url).searchParams.get("interval") === "hour" ? "hour" : "day";
  const count = interval === "hour" ? 168 : 60;
  try {
    const r = await fetch(`${MIDGARD}/v2/history/depths/ZEC.ZEC?interval=${interval}&count=${count}`, {
      next: { revalidate: 300 },
    });
    const { intervals } = await r.json();
    const points = intervals
      .map((i) => ({
        t: Number(i.startTime),
        price: Number(i.closePriceUSD || i.assetPriceUSD),
        depth: Number(i.assetDepth) / 1e8,
        members: Number(i.membersCount),
        luvi: Number(i.luvi),
      }))
      // Skip the bootstrap days before the pool held real liquidity: their prices are noise.
      .filter((p) => p.price > 0 && p.depth >= 5);
    return Response.json({ interval, points });
  } catch (e) {
    return Response.json({ error: `Midgard unreachable: ${e.message}` }, { status: 502 });
  }
}
