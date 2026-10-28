// Read-only proxy for public THORChain data (works locally and when hosted).
import { poolAt, tipHeight } from "../../../lib/thor-history";
export const revalidate = 30;

const THORNODE = process.env.THORNODE_URL || "https://gateway.liquify.com/chain/thorchain_api";

export async function GET() {
  try {
    const get = (p) => fetch(THORNODE + p, { next: { revalidate: 30 } }).then((r) => r.json());
    const [pool, inbound, lps] = await Promise.all([
      get("/thorchain/pool/ZEC.ZEC"),
      get("/thorchain/inbound_addresses"),
      get("/thorchain/pool/ZEC.ZEC/liquidity_providers"),
    ]);
    const zec = inbound.find((i) => i.chain === "ZEC") ?? {};
    // Same pool one day (~14,400 blocks) ago, for the 24h change. Optional.
    const dayAgo = await tipHeight()
      .then((h) => poolAt(Math.floor(h / 600) * 600 - 14_400))
      .catch(() => null);
    return Response.json({
      status: pool.status,
      depth_zat: Number(pool.balance_asset),
      price_usd: Number(pool.asset_tor_price) / 1e8,
      lp_count: Array.isArray(lps) ? lps.length : null,
      price_24h_usd: dayAgo?.price ?? null,
      depth_24h_zat: dayAgo ? Math.round(dayAgo.depth * 1e8) : null,
      halted: Boolean(zec.halted || zec.chain_lp_actions_paused),
      vault: zec.address,
      dust_threshold: Number(zec.dust_threshold),
      outbound_fee: Number(zec.outbound_fee),
      fetched_at: Date.now() / 1000,
    });
  } catch (e) {
    return Response.json({ error: `THORChain unreachable: ${e.message}` }, { status: 502 });
  }
}
