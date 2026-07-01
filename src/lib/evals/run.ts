import { db, evals, type Eval } from "@/db";
import { eq, desc } from "drizzle-orm";
import { answerQuestion } from "@/lib/rag/pipeline";
import { computeMetrics } from "@/lib/evals/metrics";
import { judgeRelevancy, judgeGroundedness } from "@/lib/evals/judge";

/**
 * Run a single eval case end to end and persist the results back onto its row:
 *  1. load the eval (question + gold chunk ids)
 *  2. run the RAG pipeline to get an answer + retrieved chunks
 *  3. score retrieval (precision/recall) against the gold set
 *  4. run the LLM-as-judge for relevancy and groundedness
 *  5. write everything + lastRunAt back to the row and return it
 */
export async function runEval(evalId: string): Promise<Eval> {
  const [row] = await db.select().from(evals).where(eq(evals.id, evalId));
  if (!row) throw new Error(`Eval ${evalId} not found`);

  const result = await answerQuestion(row.question);

  const retrievedChunkIds = result.retrieved.map((c) => c.id);
  const { precision, recall } = computeMetrics(
    retrievedChunkIds,
    row.expectedChunkIds,
  );

  // Groundedness is judged against the chunks the answerer actually relied on
  // (its citations); fall back to all retrieved chunks if it cited nothing.
  const referencedTexts = result.chunksUsed.length
    ? result.chunksUsed.map((c) => c.snippet)
    : result.retrieved.map((c) => c.chunkText);

  const [judgeRelevancyResult, judgeGroundednessResult] = await Promise.all([
    judgeRelevancy(row.question, result.answer),
    judgeGroundedness(result.answer, referencedTexts),
  ]);

  const [updated] = await db
    .update(evals)
    .set({
      generatedAnswer: result.answer,
      retrievedChunkIds,
      precision,
      recall,
      judgeRelevancy: judgeRelevancyResult,
      judgeGroundedness: judgeGroundednessResult,
      lastRunAt: new Date(),
    })
    .where(eq(evals.id, evalId))
    .returning();

  return updated;
}

// Cap concurrency so 20 evals × ~4 model calls each don't stampede the API into
// rate limits. High enough to be clearly parallel, low enough to stay healthy.
const RUN_CONCURRENCY = 6;

/** Run every saved eval case in parallel (bounded), returning the updated rows. */
export async function runAllEvals(): Promise<Eval[]> {
  const rows = await db
    .select({ id: evals.id })
    .from(evals)
    .orderBy(desc(evals.createdAt));

  const results: Eval[] = new Array(rows.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= rows.length) return;
      results[i] = await runEval(rows[i].id);
    }
  }
  const pool = Array.from(
    { length: Math.min(RUN_CONCURRENCY, rows.length) },
    worker,
  );
  await Promise.all(pool);
  return results;
}
