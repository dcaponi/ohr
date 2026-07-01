import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import OpenAI from "openai";

/**
 * Generate narration audio (one mp3 per scene) via OpenAI TTS and record each
 * clip's duration, so the Playwright recorder can hold each scene for exactly
 * as long as its narration, and the audio can be re-assembled in sync.
 *
 * Usage: npx tsx scripts/walkthrough/build-audio.ts <outDir>
 */
const OUT = process.argv[2];
if (!OUT) throw new Error("pass an output dir");
const AUDIO = path.join(OUT, "audio");
fs.mkdirSync(AUDIO, { recursive: true });

interface Scene {
  id: string;
  text: string;
}
const scenes: Scene[] = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "scenes.json"), "utf8"),
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function durationSec(file: string): number {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]).toString().trim();
  return Number(out);
}

async function main() {
  const durations: Record<string, number> = {};
  for (const scene of scenes) {
    const file = path.join(AUDIO, `${scene.id}.mp3`);
    const res = await client.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: scene.text,
    });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const d = durationSec(file);
    durations[scene.id] = d;
    console.log(`${scene.id}: ${d.toFixed(2)}s`);
  }
  fs.writeFileSync(
    path.join(OUT, "durations.json"),
    JSON.stringify(durations, null, 2),
  );
  const total = Object.values(durations).reduce((a, b) => a + b, 0);
  console.log(`\ntotal narration: ${total.toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
