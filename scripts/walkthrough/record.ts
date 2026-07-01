import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Record the walkthrough as a video, driven by an absolute timeline derived from
 * the narration clip durations, so the concatenated narration audio lines up
 * with the on-screen actions. Each scene's visual cue is scheduled at the
 * cumulative start offset of its narration clip.
 *
 * Usage: npx tsx scripts/walkthrough/record.ts <workDir> [baseUrl]
 */
const WORK = process.argv[2];
const BASE = process.argv[3] ?? "http://localhost:3000";
if (!WORK) throw new Error("pass a work dir");

const scenes: { id: string }[] = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "scenes.json"), "utf8"),
);
const durations: Record<string, number> = JSON.parse(
  fs.readFileSync(path.join(WORK, "durations.json"), "utf8"),
);

// Cumulative start offset (ms) of each scene.
const startAt: Record<string, number> = {};
let acc = 0;
for (const s of scenes) {
  startAt[s.id] = Math.round(acc * 1000) / 1;
  acc += durations[s.id];
}
const TOTAL_MS = Math.round(acc * 1000);

const VID_DIR = path.join(WORK, "video");
fs.rmSync(VID_DIR, { recursive: true, force: true });
fs.mkdirSync(VID_DIR, { recursive: true });

const Q =
  "What methanol production rate and selectivity did the NiZn intermetallic " +
  "catalyst achieve for sunlight-driven CO2 hydrogenation at atmospheric pressure?";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VID_DIR, size: { width: 1280, height: 800 } },
  });
  // Hide the Next.js dev-mode indicator badge so it doesn't show in the video.
  await context.addInitScript(() => {
    const hide = () => {
      if (document.getElementById("__hidepw")) return;
      const s = document.createElement("style");
      s.id = "__hidepw";
      s.textContent =
        "nextjs-portal,[data-next-badge-root],[data-next-badge]," +
        "#__next-build-watcher,#__next-prerender-indicator{display:none!important}";
      (document.head || document.documentElement).appendChild(s);
    };
    document.addEventListener("DOMContentLoaded", hide);
    hide();
  });

  const page = await context.newPage();
  const recStart = Date.now();

  const elapsed = () => Date.now() - recStart;
  /** Wait until absolute offset `ms`, then run fn. */
  const at = async (ms: number, fn: () => Promise<void>) => {
    const wait = ms - elapsed();
    if (wait > 0) await page.waitForTimeout(wait);
    await fn().catch((e) => console.error("cue error @", ms, e?.message));
  };
  const off = (id: string) => startAt[id];

  /** Navigate via the nav bar, falling back to a hard goto if the click misses. */
  const goNav = async (href: string, label: string) => {
    try {
      await page.locator(`nav a[href="${href}"]`).click({ timeout: 4000 });
      await page.waitForURL(`**${href === "/" ? "/" : href}`, { timeout: 4000 });
    } catch {
      await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    }
    await page.waitForLoadState("networkidle").catch(() => {});
  };

  // --- intro: load the empty Ask page
  await at(off("intro"), async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByPlaceholder(/Ask a question/i).waitFor();
  });

  // --- type: type the question
  await at(off("type"), async () => {
    const ta = page.getByPlaceholder(/Ask a question/i);
    await ta.click();
    await ta.pressSequentially(Q, { delay: 22 });
  });

  // --- pipeline: send; answer loads during this scene
  await at(off("pipeline"), async () => {
    await page.getByRole("button", { name: "Send" }).click();
  });

  // --- answer: ensure the answer is rendered, scroll to it
  await at(off("answer"), async () => {
    await page
      .getByRole("button", { name: /Chunks used/i })
      .waitFor({ timeout: 25000 })
      .catch(() => {});
    await page.mouse.wheel(0, 200);
  });

  // --- chunks: expand "Chunks used" and reveal the source links
  await at(off("chunks"), async () => {
    const btn = page.getByRole("button", { name: /Chunks used/i }).first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(400);
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, 260);
  });
  // mid-scene: also open "Retrieved chunks"
  await at(off("chunks") + 6500, async () => {
    await page
      .getByRole("button", { name: /Retrieved chunks/i })
      .first()
      .click()
      .catch(() => {});
    await page.mouse.wheel(0, 220);
  });

  // --- drive: browse the mock Google Drive, then open a document
  await at(off("drive"), async () => {
    await goNav("/drive", "Drive");
    await page.locator('a[href^="/drive/"]').first().waitFor({ timeout: 6000 });
  });
  await at(off("drive") + 7000, async () => {
    try {
      await page.locator('a[href^="/drive/"]').first().click({ timeout: 4000 });
      await page.waitForLoadState("networkidle");
    } catch {
      await page.goto(`${BASE}/drive/paper-0005`, { waitUntil: "networkidle" });
    }
    await page.mouse.wheel(0, 300);
  });

  // --- prompts: master prompts + Top-K on the evals page
  await at(off("prompts"), async () => {
    await goNav("/evals", "Evals");
    await page
      .getByText(/Search prompt \(query planner\)/i)
      .scrollIntoViewIfNeeded()
      .catch(() => {});
  });
  await at(off("prompts") + 13000, async () => {
    // nudge down to show the Top-K / number-of-searches controls
    await page.getByText(/Top K:/i).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, 120);
  });

  // --- metrics: first show the results table (precision/recall/relevancy/
  // grounded columns), then expand a row and reveal the groundedness breakdown.
  await at(off("metrics"), async () => {
    await page.locator("table").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.evaluate(() => window.scrollBy(0, -60));
  });
  // after precision/recall narration, expand a row
  await at(off("metrics") + 15000, async () => {
    await page.locator("tr.eval-row").first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.locator("td.eval-expand").first().scrollIntoViewIfNeeded().catch(() => {});
  });
  // reveal the groundedness per-statement breakdown during the last narration
  for (let i = 1; i <= 4; i++) {
    await at(off("metrics") + 19000 + i * 5000, async () => {
      await page.mouse.wheel(0, 300);
    });
  }

  // --- outro: back to Ask
  await at(off("outro"), async () => {
    await goNav("/", "Ask");
  });

  // hold to the end of the narration
  const tail = TOTAL_MS - elapsed();
  if (tail > 0) await page.waitForTimeout(tail);

  const video = page.video();
  await context.close(); // finalizes the file
  await browser.close();

  const src = await video!.path();
  const dest = path.join(WORK, "screen.webm");
  fs.copyFileSync(src, dest);
  console.log(`video: ${dest}`);
  console.log(`timeline total: ${(TOTAL_MS / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
