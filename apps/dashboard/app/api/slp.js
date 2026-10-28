// Runs the local `slp` binary. The dashboard never talks to any service itself:
// only `slp` calls lightwalletd and the THORChain APIs.
import { execFile, spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";

const cwd = process.env.SLP_CWD || path.resolve(process.cwd(), "../..");
const bin = process.env.SLP_BIN || path.join(cwd, "target/release/slp");

export function slpJson(args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, timeout: 60_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim().split("\n").pop() || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("slp returned invalid JSON"));
      }
    });
  });
}

// Detached so the withdrawal keeps running if the dashboard stops.
export function slpBackground(args, logName) {
  const log = openSync(path.join(cwd, logName), "a");
  const child = spawn(bin, args, { cwd, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  return child.pid;
}
