import { NextRequest, NextResponse } from "next/server";
import { searchChunks } from "@/lib/rag/search";

export const runtime = "nodejs";

/**
 * Vector search for the evals "expected paragraphs" tag picker.
 * GET /api/chunks/search?q=...[&k=25] → the top-k chunks nearest the query.
 * Embeds the query and does a pgvector cosine lookup (same retrieval path the
 * RAG pipeline uses), so the picker surfaces semantically relevant paragraphs.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ chunks: [] });

  const kParam = Number(req.nextUrl.searchParams.get("k"));
  const k = Number.isFinite(kParam) && kParam > 0 ? Math.min(kParam, 50) : 25;

  try {
    const results = await searchChunks(q, k);
    return NextResponse.json({
      chunks: results.map((c) => ({
        id: c.id,
        title: c.title,
        paragraphIndex: c.paragraphIndex,
        snippet: c.chunkText.slice(0, 200),
        sourceLink: c.sourceLink,
        score: c.score,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
