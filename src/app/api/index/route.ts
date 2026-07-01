import { NextResponse } from "next/server";
import { indexCorpus } from "@/lib/indexer";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Manual indexing trigger: pull the whole corpus and (re)index it. */
export async function POST() {
  try {
    const results = await indexCorpus();
    const totalChunks = results.reduce((n, r) => n + r.chunkCount, 0);
    return NextResponse.json({
      indexedDocuments: results.length,
      totalChunks,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
