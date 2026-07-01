import { db } from "@/db";
import { sql } from "drizzle-orm";
import { embed, toVectorLiteral } from "@/lib/embeddings";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  title: string;
  type: string;
  paragraphIndex: number;
  chunkText: string;
  sourceLink: string;
  /** cosine similarity in [0,1]; higher is closer */
  score: number;
}

/** Vector search for the top-k chunks nearest to a query string. */
export async function searchChunks(
  query: string,
  k: number,
): Promise<RetrievedChunk[]> {
  const vec = toVectorLiteral(await embed(query));
  return searchByVector(vec, k);
}

/** Vector search given an already-computed embedding literal. */
export async function searchByVector(
  vecLiteral: string,
  k: number,
): Promise<RetrievedChunk[]> {
  const rows = await db.execute<{
    id: string;
    document_id: string;
    title: string;
    type: string;
    paragraph_index: number;
    chunk_text: string;
    source_link: string;
    score: number;
  }>(sql`
    SELECT c.id,
           c.document_id,
           d.title,
           d.type,
           c.paragraph_index,
           c.chunk_text,
           c.source_link,
           1 - (c.embedding <=> ${vecLiteral}::vector) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vecLiteral}::vector
    LIMIT ${k}
  `);

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    title: r.title,
    type: r.type,
    paragraphIndex: r.paragraph_index,
    chunkText: r.chunk_text,
    sourceLink: r.source_link,
    score: Number(r.score),
  }));
}

/**
 * Multi-query retrieval: embed each search, take top-k per search, dedupe across
 * searches (keeping the best score per chunk), then return the top-k of the
 * union. This is the retrieval half of the two-prompt pipeline.
 */
export async function multiSearch(
  searches: string[],
  k: number,
): Promise<RetrievedChunk[]> {
  const perSearch = await Promise.all(
    searches.map((s) => searchChunks(s, k)),
  );

  const best = new Map<string, RetrievedChunk>();
  for (const results of perSearch) {
    for (const c of results) {
      const existing = best.get(c.id);
      if (!existing || c.score > existing.score) best.set(c.id, c);
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
