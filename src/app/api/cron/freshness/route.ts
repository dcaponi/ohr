import { NextRequest, NextResponse } from "next/server";
import { runFreshnessScan, scanFreshness } from "@/lib/freshness";
import { authorizeCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET  → dry-run scan: report which docs are stale (indexed version != drive version).
 * POST → scan and re-index anything stale.
 * Protected by CRON_SECRET if set.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ scanned: await scanFreshness() });
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { scanned, reindexed } = await runFreshnessScan();
  return NextResponse.json({ scanned, reindexed });
}
