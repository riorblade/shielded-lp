// Read-only pool history (price and depth over time) for the charts.
import { RANGES, history } from "../../../lib/thor-history";

export const revalidate = 300;

export async function GET(req) {
  const range = new URL(req.url).searchParams.get("range");
  try {
    return Response.json({ range, ...(await history(range in RANGES ? range : "1m")) });
  } catch (e) {
    return Response.json({ error: `THORChain history unreachable: ${e.message}` }, { status: 502 });
  }
}
