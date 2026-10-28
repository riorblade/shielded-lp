import { fail, guard, slpJson } from "../slp";

export async function POST(req) {
  const [network, denied] = await guard(req);
  if (denied) return denied;
  try {
    return Response.json(await slpJson(["address", "-n", network, "--json"]));
  } catch (e) {
    return fail(e);
  }
}
