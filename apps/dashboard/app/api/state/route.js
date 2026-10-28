import path from "node:path";
import { NETWORKS, hasBinary, netDir, runLog, runningPid, slpJson, tail, walletExists } from "../slp";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const network = new URL(req.url).searchParams.get("network");
  if (!NETWORKS.includes(network)) return Response.json({ error: "network must be main or test" }, { status: 400 });
  if (!hasBinary()) return Response.json({ error: "hosted" }, { status: 400 });
  const wallet = walletExists(network);
  const [status, observer, balance] = await Promise.all([
    slpJson(["status", "-n", network, "--json"]),
    slpJson(["observer", "-n", network, "--json"]),
    wallet
      ? slpJson(["wallet", "-w", path.join(netDir(network), "wallet"), "balance", "--json"]).catch((e) => ({ error: e.message }))
      : null,
  ]).catch((e) => [null, null, { error: e.message }]);
  return Response.json({
    network,
    wallet,
    balance,
    status,
    observer: observer ?? [],
    running: Boolean(runningPid(network)),
    log: [...tail(runLog(network), 30), ...tail(path.join(netDir(network), "sync.log"), 5)],
  });
}
