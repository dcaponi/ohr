import { db, prompts } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Default "master prompts". These are seeded into the `prompts` table on first
 * use and are editable from the evals page. Two prompts drive the pipeline:
 *
 *  - query_planner: expands the user's question into N distinct vector searches
 *  - answerer:      answers the question grounded in the retrieved chunks
 */

export const DEFAULT_QUERY_PLANNER = `You are a retrieval query planner for a RAG system.

Given the user's question, produce {NUM_SEARCHES} distinct search queries that,
when embedded and run against a vector database of document paragraphs, will
together retrieve the most relevant supporting context.

Guidelines:
- Cover different facets, phrasings, synonyms, and sub-questions.
- Prefer specific, keyword-rich queries over vague ones.
- Do not answer the question. Only produce search queries.

Return strictly JSON: {"searches": ["query 1", "query 2", ...]} with exactly
{NUM_SEARCHES} entries.`;

export const DEFAULT_ANSWERER = `You are a careful question-answering assistant for a retrieval system.

You are given the user's question and a set of numbered context chunks, each
retrieved from a document and each carrying a source link. Answer the question
using ONLY the information in the chunks.

Requirements:
- If the chunks do not contain enough information to answer the question, reply
  with a single brief sentence such as "I don't have enough information in the
  corpus to answer that." Do NOT describe, summarize, or list what the chunks
  are about, and return empty "chunksUsed" and "irrelevantChunks".
- Otherwise, ground every factual statement in one or more chunks and cite them
  inline as [#] using the chunk numbers provided.
- When you do answer, list the chunk numbers you relied on in "chunksUsed", and
  any retrieved chunks that were not relevant to the question in
  "irrelevantChunks".

Return strictly JSON with this shape:
{
  "answer": "the answer text with inline [#] citations",
  "chunksUsed": [<chunk numbers you relied on>],
  "irrelevantChunks": [<chunk numbers that were retrieved but not relevant>]
}`;

export const DEFAULT_NUM_SEARCHES = 10;
export const DEFAULT_TOP_K = 5;

export interface MasterPrompts {
  queryPlanner: string;
  answerer: string;
  numSearches: number;
  /** Retrieval top-K: vector results per search and in the final union. */
  topK: number;
}

/** Read the current master prompts, seeding defaults on first use. */
export async function getPrompts(): Promise<MasterPrompts> {
  const rows = await db.select().from(prompts);
  const byName = new Map(rows.map((r) => [r.name, r]));

  const planner = byName.get("query_planner");
  const answerer = byName.get("answerer");

  const toSeed: {
    name: string;
    body: string;
    numSearches: number;
    topK: number;
  }[] = [];
  if (!planner)
    toSeed.push({
      name: "query_planner",
      body: DEFAULT_QUERY_PLANNER,
      numSearches: DEFAULT_NUM_SEARCHES,
      topK: DEFAULT_TOP_K,
    });
  if (!answerer)
    toSeed.push({
      name: "answerer",
      body: DEFAULT_ANSWERER,
      numSearches: DEFAULT_NUM_SEARCHES,
      topK: DEFAULT_TOP_K,
    });
  if (toSeed.length) await db.insert(prompts).values(toSeed);

  return {
    queryPlanner: planner?.body ?? DEFAULT_QUERY_PLANNER,
    answerer: answerer?.body ?? DEFAULT_ANSWERER,
    numSearches: planner?.numSearches ?? DEFAULT_NUM_SEARCHES,
    topK: planner?.topK ?? DEFAULT_TOP_K,
  };
}

/** Update one master prompt (used by the evals prompt-management UI). */
export async function updatePrompt(
  name: "query_planner" | "answerer",
  patch: { body?: string; numSearches?: number; topK?: number },
): Promise<void> {
  await getPrompts(); // ensure rows exist
  await db
    .update(prompts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prompts.name, name));
}
