/**
 * Retrieval quality metrics for an eval case: how well the chunks the pipeline
 * retrieved match the "gold" chunks a user hand-picked as expected/relevant.
 */
export interface RetrievalMetrics {
  /** |retrieved ∩ expected| / |retrieved| — how much of what we fetched was relevant. */
  precision: number;
  /** |retrieved ∩ expected| / |expected| — how much of the relevant set we fetched. */
  recall: number;
}

/**
 * Compute context precision & recall from chunk-id sets.
 *
 * Edge cases:
 *  - precision is 0 when nothing was retrieved (no relevant hits over an empty set).
 *  - recall is 1 when nothing was expected: with no gold chunks required there is
 *    nothing to miss, so recall is trivially perfect.
 */
export function computeMetrics(
  retrievedChunkIds: string[],
  expectedChunkIds: string[],
): RetrievalMetrics {
  const expected = new Set(expectedChunkIds);
  const retrieved = new Set(retrievedChunkIds);

  let hits = 0;
  for (const id of retrieved) {
    if (expected.has(id)) hits++;
  }

  const precision = retrieved.size === 0 ? 0 : hits / retrieved.size;
  const recall = expected.size === 0 ? 1 : hits / expected.size;

  return { precision, recall };
}
