import { NETWORKS, hasBinary, walletExists } from "../slp";

export const dynamic = "force-dynamic";

export function GET() {
  const local = hasBinary();
  return Response.json({
    local,
    wallets: Object.fromEntries(NETWORKS.map((n) => [n, local && walletExists(n)])),
  });
}
