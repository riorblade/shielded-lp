import { guard, runLog, slpBackground, stopRun } from "../slp";

export async function POST(req) {
  const [network, denied] = await guard(req);
  if (denied) return denied;
  // `slp exit` marks the slices and then runs the executor itself; avoid two executors.
  stopRun(network);
  const pid = slpBackground(["exit", "-n", network, "--all"], runLog(network));
  return Response.json({ started: true, pid });
}
