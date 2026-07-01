import OpenAI from "openai";

// Anthropic has no embeddings API, so embeddings come from OpenAI.
// text-embedding-3-small => 1536 dims (matches EMBEDDING_DIMS in the schema).
export const EMBEDDING_MODEL = "text-embedding-3-small";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set — required for embeddings. Add it to .env.",
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

/** Embed a single string. */
export async function embed(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
}

/** Embed many strings in one request (OpenAI batches natively). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  // Preserve request order.
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

/** pgvector wants a bracketed literal: "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
