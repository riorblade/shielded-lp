// Screen recorder for the demo video: drives headless Chrome over CDP, moves a real
// mouse (so hovers, tooltips and the chart crosshair show), draws a visible cursor,
// and records with Page.startScreencast. Writes <out>.mp4 and <out>.markers.json.
// Usage: node scripts/rec.mjs <script.mjs> <out-prefix>
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const [scriptPath, out] = process.argv.slice(2);
const W = 1920, H = 1080, PORT = 9334;
const frameDir = `${out}-frames`;
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, "--hide-scrollbars",
  `--user-data-dir=${process.env.PROFILE || out + "-profile"}`, "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  await sleep(250);
  try {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const p = t.find((x) => x.type === "page");
    if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
  } catch {}
}
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const frames = [];
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  } else if (d.method === "Page.screencastFrame") {
    const { data, metadata, sessionId } = d.params;
    const file = `f_${String(frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(path.join(frameDir, file), Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    send("Page.screencastFrameAck", { sessionId });
  }
});
const send = (method, params = {}) => new Promise((r) => {
  pending.set(++id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

// Visible cursor + helpers, installed in every document.
const BOOT = `
(() => {
  const add = () => {
    if (document.getElementById('__c')) return;
    const c = document.createElement('div');
    c.id = '__c';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 2.5l14 8.2-6.1 1.6-3 5.9z" fill="#fff" stroke="#0d0c14" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'0px', top:'0px', zIndex:2147483647, pointerEvents:'none', transform:'translate(960px,600px)', filter:'drop-shadow(0 3px 6px rgba(0,0,0,.45))'});
    document.documentElement.appendChild(c);
    const r = document.createElement('div');
    r.id = '__r';
    Object.assign(r.style, {position:'fixed', width:'56px', height:'56px', borderRadius:'50%', border:'3px solid #f4b728', zIndex:2147483646, pointerEvents:'none', opacity:'0', left:'0', top:'0'});
    document.documentElement.appendChild(r);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
  window.__cur = (x, y) => { const c = document.getElementById('__c'); if (c) c.style.transform = 'translate(' + (x - 6) + 'px,' + (y - 4) + 'px)'; };
  window.__ripple = (x, y) => { const r = document.getElementById('__r'); if (!r) return; r.style.left = (x - 28) + 'px'; r.style.top = (y - 28) + 'px'; r.animate([{opacity:1, transform:'scale(.4)'},{opacity:0, transform:'scale(1.4)'}], {duration: 450, easing:'ease-out'}); };
  window.__scroll = (y, ms) => new Promise((done) => { const s = scrollY, t0 = performance.now(); const f = (t) => { const p = Math.min(1, (t - t0) / ms); const e = p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2; window.scrollTo({top: s + (y - s) * e, behavior: 'instant'}); p < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  window.__find = (q) => { const all = [...document.querySelectorAll('button, a, [role=tab], [role=radio], input, .hint')]; return all.find((e) => e.textContent.trim().toLowerCase().startsWith(q.toLowerCase()) && e.getBoundingClientRect().width > 0) || document.querySelector(q); };
})();`;
await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: BOOT });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let mx = 960, my = 600;
const markers = {};
let t0 = null;
const now = () => Date.now() / 1000;
const api = {
  sleep,
  ev,
  async goto(url, wait = 3000) {
    await send("Page.navigate", { url });
    await sleep(wait);
    await ev(`window.__cur(${mx},${my})`);
  },
  async start() {
    await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    t0 = now();
  },
  mark(name) {
    markers[name] = +(now() - t0).toFixed(2);
    console.log("mark", name, markers[name]);
  },
  async move(x, y, ms = 550) {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = mx, sy = my;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps, e = 1 - Math.pow(1 - p, 3);
      mx = sx + (x - sx) * e;
      my = sy + (y - sy) * e;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
      await ev(`window.__cur(${mx},${my})`);
      await sleep(ms / steps);
    }
  },
  async at(q) {
    return ev(`(() => { const e = window.__find(${JSON.stringify(q)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  },
  async hover(q, ms) {
    const p = await api.at(q);
    if (!p) return console.log("NOT FOUND", q);
    await api.move(p.x, p.y, ms);
  },
  async click(q, ms = 550) {
    const p = await api.at(q);
    if (!p) return console.log("NOT FOUND", q);
    await api.move(p.x, p.y, ms);
    await sleep(120);
    await ev(`window.__ripple(${p.x},${p.y})`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await sleep(250);
  },
  async type(text, perChar = 90) {
    for (const ch of text) {
      await send("Input.insertText", { text: ch });
      await sleep(perChar);
    }
  },
  async selectAll() {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 4, commands: ["selectAll"] });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 4 });
  },
  async scrollTo(y, ms = 1200) {
    await ev(`window.__scroll(${typeof y === "number" ? y : `(${y})`}, ${ms})`);
  },
  async scrollToId(idName, offset = 0, ms = 1200) {
    await api.scrollTo(`document.getElementById(${JSON.stringify(idName)}).getBoundingClientRect().top + scrollY + ${offset}`, ms);
  },
};

const { default: run } = await import(path.resolve(scriptPath));
await run(api);
await sleep(600);
await send("Page.stopScreencast");
await sleep(300);
ws.close();
chrome.kill();

// Variable-rate frames -> constant 30 fps mp4.
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
  lines.push(`file '${frames[i].file}'`, `duration ${Math.max(dur, 0.001).toFixed(4)}`);
}
lines.push(`file '${frames.at(-1).file}'`);
writeFileSync(path.join(frameDir, "list.txt"), lines.join("\n"));
// Markers are relative to the first frame.
const first = frames[0].t;
const offset = t0 - first;
for (const k of Object.keys(markers)) markers[k] = +(markers[k] + offset).toFixed(2);
writeFileSync(`${out}.markers.json`, JSON.stringify(markers, null, 2));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(frameDir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "fast", `${out}.mp4`]);
console.log("frames", frames.length, "->", `${out}.mp4`, "duration", (frames.at(-1).t - first).toFixed(1), "s");
