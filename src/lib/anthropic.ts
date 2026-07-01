import Anthropic from "@anthropic-ai/sdk";

// Default model for query planning, answering, and LLM-as-judge.
// Verified reachable with the installed SDK (0.68). Adaptive thinking / effort /
// output_config structured outputs are NOT in this SDK version, so we keep the
// request surface minimal and coax JSON via prompting + tolerant parsing.
export const CLAUDE_MODEL = "claude-opus-4-8";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set — required for the LLM. Add it to .env.",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** Single-shot text completion. */
export async function complete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  /** Accepted for call-site compatibility; not used by SDK 0.68. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<string> {
  const msg = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return textOf(msg);
}

/**
 * Ask Claude for JSON and parse it. `schema` is embedded in the prompt as a
 * shape hint (SDK 0.68 has no server-side structured outputs). Parsing is
 * tolerant of code fences / surrounding prose.
 */
export async function completeJSON<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const system = `${opts.system}

You MUST respond with a single valid JSON value and nothing else — no prose, no
explanation, no markdown code fences. The JSON must conform to this JSON Schema:
${JSON.stringify(opts.schema)}`;

  const msg = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system,
    messages: [{ role: "user", content: opts.user }],
  });
  return parseJSON<T>(textOf(msg));
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extract the first JSON object/array from a model response. */
export function parseJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(body) as T;
  } catch {
    // Fall back to the first balanced {...} or [...] span.
    const start = body.search(/[[{]/);
    if (start !== -1) {
      const open = body[start];
      const close = open === "{" ? "}" : "]";
      const end = body.lastIndexOf(close);
      if (end > start) {
        return JSON.parse(body.slice(start, end + 1)) as T;
      }
    }
    throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}
