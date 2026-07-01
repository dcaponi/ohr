import { NextResponse } from "next/server";
import { scanFreshness, runFreshnessScan } from "@/lib/freshness";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * App-facing freshness endpoint (unauthenticated, like /api/index) for the UI
 * button. The CRON_SECRET-protected scheduler variant lives at
 * /api/cron/freshness.
 *
 * GET  → dry-run scan: which docs are stale (indexed version != drive version).
 * POST → scan and re-index anything stale.
 */
export async function GET() {
  try {
    return NextResponse.json({ scanned: await scanFreshness() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const { scanned, reindexed } = await runFreshnessScan();
    return NextResponse.json({ scanned, reindexed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
