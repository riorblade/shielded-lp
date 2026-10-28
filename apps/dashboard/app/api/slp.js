// Runs the local `slp` binary. The browser never talks to Zcash or THORChain directly:
// only `slp` (and the read-only /api/pool proxy) does.
import { execFile, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const cwd = process.env.SLP_CWD || path.resolve(process.cwd(), "../..");
const bin = process.env.SLP_BIN || path.join(cwd, "target/release/slp");

export const NETWORKS = ["main", "test"];
export const hasBinary = () => existsSync(bin);
export const netDir = (network) => path.join(cwd, network);
export const walletExists = (network) => existsSync(path.join(netDir(network), "wallet", "keys.toml"));

export function slpJson(args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, timeout: 120_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim().split("\n").filter((l) => !l.includes(" INFO ")).pop() || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("slp returned invalid JSON"));
      }
    });
  });
}

// Detached so long jobs keep running if the dashboard stops.
export function slpBackground(args, logFile) {
  const log = openSync(logFile, "a");
  const child = spawn(bin, args, { cwd, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  return child.pid;
}

const pidFile = (network) => path.join(netDir(network), "run.pid");
export const runLog = (network) => path.join(netDir(network), "run.log");

export function runningPid(network) {
  try {
    const pid = Number(readFileSync(pidFile(network), "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

export function startRun(network) {
  if (runningPid(network)) return runningPid(network);
  const pid = slpBackground(["run", "-n", network], runLog(network));
  writeFileSync(pidFile(network), String(pid));
  return pid;
}

export function stopRun(network) {
  const pid = runningPid(network);
  if (pid) process.kill(pid, "SIGTERM");
  return pid;
}

export function tail(file, lines = 40) {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l && !l.includes(" INFO ") && !l.includes(" DEBUG "))
      .slice(-lines);
  } catch {
    return [];
  }
}

/** Shared guard for every route that changes something. */
export async function guard(req) {
  // A custom header forces a CORS preflight, so other websites cannot trigger actions.
  if (req.headers.get("x-slp") !== "1") return [null, Response.json({ error: "missing x-slp header" }, { status: 403 })];
  const network = new URL(req.url).searchParams.get("network");
  if (!NETWORKS.includes(network)) return [null, Response.json({ error: "network must be main or test" }, { status: 400 })];
  if (!hasBinary()) return [null, Response.json({ error: "No local slp binary: this is the hosted simulation." }, { status: 400 })];
  return [network, null];
}

export const fail = (e) => Response.json({ error: e.message }, { status: 500 });
