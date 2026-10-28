import { guard, startRun, stopRun } from "../slp";

export async function POST(req) {
  const [network, denied] = await guard(req);
  if (denied) return denied;
  const { action } = await req.json();
  if (action === "start") return Response.json({ running: true, pid: startRun(network) });
  if (action === "stop") return Response.json({ running: false, pid: stopRun(network) });
  return Response.json({ error: "action must be start or stop" }, { status: 400 });
}
