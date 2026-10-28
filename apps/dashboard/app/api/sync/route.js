import path from "node:path";
import { guard, netDir, slpBackground } from "../slp";

export async function POST(req) {
  const [network, denied] = await guard(req);
  if (denied) return denied;
  const pid = slpBackground(["wallet", "-w", path.join(netDir(network), "wallet"), "sync"], path.join(netDir(network), "sync.log"));
  return Response.json({ started: true, pid });
}
