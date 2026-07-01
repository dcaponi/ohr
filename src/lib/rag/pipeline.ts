import { completeJSON } from "@/lib/anthropic";
import { getPrompts } from "@/lib/prompts";
import { multiSearch, type RetrievedChunk } from "@/lib/rag/search";

export interface AnswerResult {
  question: string;
  answer: string;
  /** The searches the planner generated. */
  searches: string[];
  /** All chunks retrieved (deduped union, top-k), in the order shown to the LLM. */
  retrieved: RetrievedChunk[];
  /** Chunks the answerer actually relied on, with their source links. */
  chunksUsed: CitedChunk[];
  /** Chunks retrieved but flagged irrelevant by the answerer. */
  irrelevantChunks: CitedChunk[];
  /** Convenience: distinct source links backing the answer. */
  links: string[];
}

export interface CitedChunk {
  number: number; // 1-based number shown to the LLM
  id: string;
  title: string;
  sourceLink: string;
  snippet: string;
}

interface PlannerOut {
  searches: string[];
}
interface AnswererOut {
  answer: string;
  chunksUsed: number[];
  irrelevantChunks: number[];
}

/**
 * Full RAG pipeline:
 *  1. query-planner prompt → N searches
 *  2. multiSearch → top-k deduped chunks
 *  3. answerer prompt → answer + used/irrelevant chunk numbers
 *
 * `topK` overrides how many chunks the vector search considers (settings rail).
 */
export async function answerQuestion(
  question: string,
  opts?: { topK?: number },
): Promise<AnswerResult> {
  const { queryPlanner, answerer, numSearches, topK: configuredTopK } =
    await getPrompts();
  // Top-K is configured on the search (query-planner) prompt; an explicit
  // opts.topK still overrides it (e.g. for a one-off API call).
  const topK = opts?.topK ?? configuredTopK;

  // 1. Plan searches.
  const plannerSystem = queryPlanner.replaceAll(
    "{NUM_SEARCHES}",
    String(numSearches),
  );
  let searches: string[];
  try {
    const out = await completeJSON<PlannerOut>({
      system: plannerSystem,
      user: question,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          searches: { type: "array", items: { type: "string" } },
        },
        required: ["searches"],
      },
    });
    searches = out.searches?.length ? out.searches : [question];
  } catch {
    searches = [question]; // fall back to the raw question
  }

  // 2. Retrieve.
  const retrieved = await multiSearch(searches, topK);

  // 3. Answer.
  const numbered = retrieved
    .map(
      (c, i) =>
        `[${i + 1}] (source: ${c.sourceLink})\n${c.chunkText}`,
    )
    .join("\n\n");

  const answererUser = `Question: ${question}\n\nContext chunks:\n${numbered || "(no chunks retrieved)"}`;

  let out: AnswererOut;
  try {
    out = await completeJSON<AnswererOut>({
      system: answerer,
      user: answererUser,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer: { type: "string" },
          chunksUsed: { type: "array", items: { type: "integer" } },
          irrelevantChunks: { type: "array", items: { type: "integer" } },
        },
        required: ["answer", "chunksUsed", "irrelevantChunks"],
      },
      maxTokens: 4096,
    });
  } catch {
    out = { answer: "", chunksUsed: [], irrelevantChunks: [] };
  }

  const cite = (n: number): CitedChunk | null => {
    const c = retrieved[n - 1];
    if (!c) return null;
    return {
      number: n,
      id: c.id,
      title: c.title,
      sourceLink: c.sourceLink,
      snippet: c.chunkText.slice(0, 240),
    };
  };

  const chunksUsed = out.chunksUsed.map(cite).filter((c): c is CitedChunk => !!c);
  const irrelevantChunks = out.irrelevantChunks
    .map(cite)
    .filter((c): c is CitedChunk => !!c);

  const links = [...new Set(chunksUsed.map((c) => c.sourceLink))];

  return {
    question,
    answer: out.answer,
    searches,
    retrieved,
    chunksUsed,
    irrelevantChunks,
    links,
  };
}
