import { fail, guard, slpJson } from "../slp";

const ZEC = /^\d{1,6}(\.\d{1,8})?$/;
const DENOMS = /^\d{1,6}(\.\d{1,8})?(,\d{1,6}(\.\d{1,8})?){0,9}$/;
const JITTER = /^\d{1,5}[smhd]-\d{1,5}[smhd]$/;

export async function POST(req) {
  const [network, denied] = await guard(req);
  if (denied) return denied;
  const { amount, denoms, jitter, reserve, dryRun } = await req.json();
  if (!ZEC.test(amount) || !DENOMS.test(denoms) || !JITTER.test(jitter) || !ZEC.test(reserve)) {
    return Response.json({ error: "Check the amount, denominations, spacing and reserve." }, { status: 400 });
  }
  const args = ["plan", "-n", network, "--amount", amount, "--denoms", denoms, "--jitter", jitter, "--reserve", reserve, "--json"];
  try {
    return Response.json(await slpJson(dryRun ? [...args, "--dry-run"] : args));
  } catch (e) {
    return fail(e);
  }
}
