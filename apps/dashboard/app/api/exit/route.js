import { slpBackground } from "../slp";

export async function POST(req) {
  // A custom header forces a CORS preflight, so other websites cannot trigger this.
  if (req.headers.get("x-slp") !== "1") {
    return Response.json({ error: "missing x-slp header" }, { status: 403 });
  }
  if (!process.env.SLP_IDENTITY) {
    return Response.json(
      { error: "Set SLP_IDENTITY before starting the dashboard, or run `slp exit --all` in a terminal." },
      { status: 400 },
    );
  }
  const pid = slpBackground(["exit", "--all"], "exit.log");
  return Response.json({ started: true, pid, log: "exit.log" });
}
