// Voiceover: one audio file per scene in public/vo/<id>.mp3, durations in src/vo.json.
// `node scripts/vo.mjs`          -> generate a scratch track with macOS `say`, then measure
// `node scripts/vo.mjs --measure` -> only measure (after dropping in real voice files)
// `node scripts/vo.mjs --studio`  -> generate with the global `voiceover` CLI (VoiceStudio clone), then measure
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const lines = JSON.parse(readFileSync("src/script.json", "utf8"));
const studio = process.argv.includes("--studio");
const measureOnly = process.argv.includes("--measure") || studio;
// This video is fast-paced: 1.15x keeps the cloned voice natural while landing near 3 minutes.
if (studio) execFileSync("voiceover", ["-f", "src/script.json", "-d", "public/vo", "--speed", process.env.SPEED || "1.15"], { stdio: "inherit" });
const VOICE = process.env.VOICE || "Samantha";
const RATE = process.env.RATE || "190";
// `say` mispronounces a few words; the files for a real voice should use the script text as is.
const speak = (t) => t.replace(/\bZEC\b/g, "zeck").replace(/THORChain/g, "Thor chain").replace(/DEX/g, "decks");
const tmp = mkdtempSync(path.join(tmpdir(), "vo-"));
const out = {};
for (const { id, text } of lines) {
  const mp3 = `public/vo/${id}.mp3`;
  if (!measureOnly) {
    const aiff = path.join(tmp, `${id}.aiff`);
    execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aiff, speak(text)]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ac", "1", "-ar", "44100", "-b:a", "192k", mp3]);
  }
  if (!existsSync(mp3)) throw new Error(`missing ${mp3}`);
  const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString());
  out[id] = +d.toFixed(2);
  console.log(id.padEnd(9), `${d.toFixed(1)}s`, `${text.split(/\s+/).length} words`);
}
writeFileSync("src/vo.json", JSON.stringify(out, null, 2));
console.log("total", Object.values(out).reduce((a, b) => a + b, 0).toFixed(1), "s");
