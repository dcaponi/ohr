import { NextRequest, NextResponse } from "next/server";
import { indexCorpus } from "@/lib/indexer";
import { authorizeCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron-triggered full index. Wired but not scheduled to actually run — invoke
 * manually or point a scheduler here. Protected by CRON_SECRET if set.
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await indexCorpus();
  return NextResponse.json({
    trigger: "cron",
    indexedDocuments: results.length,
    totalChunks: results.reduce((n, r) => n + r.chunkCount, 0),
    results,
  });
}

export const GET = handle;
export const POST = handle;
