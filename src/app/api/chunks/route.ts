import { NextRequest, NextResponse } from "next/server";
import { db, chunks, documents } from "@/db";
import { inArray, eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * Fetch chunk details by id, for expanding an eval row to show the retrieved
 * paragraphs (text + source link). GET /api/chunks?ids=a,b,c
 * Results are returned in the same order as the requested ids.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ chunks: [] });

  const rows = await db
    .select({
      id: chunks.id,
      title: documents.title,
      paragraphIndex: chunks.paragraphIndex,
      chunkText: chunks.chunkText,
      sourceLink: chunks.sourceLink,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(inArray(chunks.id, ids));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return NextResponse.json({ chunks: ordered });
}
