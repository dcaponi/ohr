import { z } from "zod";
import { type AnswerResult } from "@/lib/rag/pipeline";

/**
 * Shared definition of the `question_answering` MCP tool, used by both the
 * local stdio server (mcp/server.ts) and the remote Streamable-HTTP endpoint
 * (src/app/api/mcp/route.ts) so they behave identically.
 */
export const TOOL_NAME = "question_answering";

export const TOOL_DESCRIPTION =
  "Answer a natural-language question grounded in the ohr research corpus " +
  "(open-access arXiv papers on synthesizing fuels/chemicals, plus lab-equipment " +
  "SOPs). Returns a cited answer with the source links and chunks it relied on, " +
  "and declines when the corpus does not contain the answer.";

/** Zod raw shape for the tool input (works with both registerTool and tool()). */
export const TOOL_INPUT_SHAPE = {
  question: z.string().describe("The natural-language question to answer."),
  topK: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "How many chunks the vector search considers. Omit to use the configured default.",
    ),
};

/** Render an AnswerResult into a human-readable text block for the MCP client. */
export function formatAnswer(result: AnswerResult): string {
  const lines: string[] = [];
  lines.push(result.answer?.trim() || "(no answer produced)");

  lines.push("", "## Sources");
  if (result.links.length) {
    for (const link of result.links) lines.push(`- ${link}`);
  } else {
    lines.push("- (none)");
  }

  lines.push("", "## Chunks used");
  if (result.chunksUsed.length) {
    for (const c of result.chunksUsed) lines.push(`- ${c.title} — ${c.sourceLink}`);
  } else {
    lines.push("- (none)");
  }

  if (result.irrelevantChunks.length) {
    lines.push("", "## Flagged irrelevant chunks");
    for (const c of result.irrelevantChunks) {
      lines.push(`- ${c.title} — ${c.sourceLink}`);
    }
  }

  return lines.join("\n");
}
