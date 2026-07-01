import { completeJSON } from "@/lib/anthropic";

/**
 * LLM-as-judge helpers. Both use Claude via `completeJSON` with a strict
 * json_schema so the model's output parses directly into the return type.
 * These only touch the network when called, so importing this module never
 * requires an ANTHROPIC_API_KEY.
 */

export interface RelevancyVerdict {
  relevant: boolean;
  reason: string;
}

export interface GroundednessStatement {
  statement: string;
  grounded: boolean;
  reason: string;
}

export interface GroundednessVerdict {
  statements: GroundednessStatement[];
  /** grounded / total statements (1 if there are no statements to check). */
  score: number;
}

/**
 * Judge whether `answer` is semantically on-topic for `question` — i.e. does it
 * actually address what was asked, regardless of factual correctness.
 */
export async function judgeRelevancy(
  question: string,
  answer: string,
): Promise<RelevancyVerdict> {
  const system = `You are a strict evaluator judging answer relevancy.

Decide whether the ANSWER is semantically on-topic for, and actually responds
to, the QUESTION. Judge relevancy only — not factual accuracy or completeness.
An answer that says it cannot find the information is still relevant if it
addresses the question.

Return strictly JSON matching the schema: {"relevant": <bool>, "reason": "<one short sentence>"}.`;

  const user = `QUESTION:\n${question}\n\nANSWER:\n${answer}`;

  return completeJSON<RelevancyVerdict>({
    system,
    user,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        relevant: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["relevant", "reason"],
    },
  });
}

/**
 * Judge groundedness: split `answer` into distinct factual statements and, for
 * each, decide whether it is supported by at least one of the provided
 * `chunkTexts`. Score is the fraction of statements that are grounded.
 */
export async function judgeGroundedness(
  answer: string,
  chunkTexts: string[],
): Promise<GroundednessVerdict> {
  const system = `You are a strict evaluator judging answer groundedness against source context.

Break the ANSWER into distinct, atomic factual statements. For EACH statement,
decide whether it is directly supported by one or more of the numbered CONTEXT
CHUNKS. A statement is grounded only if the chunks actually back it; do not use
outside knowledge. Ignore inline citation markers like [1] when extracting
statements.

Return strictly JSON matching the schema: an array "statements" where each item
is {"statement": "...", "grounded": <bool>, "reason": "<one short sentence>"}.`;

  const context =
    chunkTexts.length > 0
      ? chunkTexts.map((t, i) => `[${i + 1}] ${t}`).join("\n\n")
      : "(no context chunks provided)";

  const user = `CONTEXT CHUNKS:\n${context}\n\nANSWER:\n${answer}`;

  const out = await completeJSON<{ statements: GroundednessStatement[] }>({
    system,
    user,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        statements: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              statement: { type: "string" },
              grounded: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["statement", "grounded", "reason"],
          },
        },
      },
      required: ["statements"],
    },
  });

  const statements = out.statements ?? [];
  const grounded = statements.filter((s) => s.grounded).length;
  const score = statements.length === 0 ? 1 : grounded / statements.length;

  return { statements, score };
}
