import { slpJson } from "../slp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [status, observer] = await Promise.all([
      slpJson(["status", "--json"]),
      slpJson(["observer", "--json"]),
    ]);
    return Response.json({ status, observer });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
