import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { answerQuestion, type AnswerResult } from "@/lib/rag/pipeline";

/**
 * MCP stdio server exposing the RAG pipeline as a single `question_answering`
 * tool, so it can be wired into Claude Code (or any MCP client).
 *
 * IMPORTANT: stdout is reserved for the MCP protocol. All diagnostics go to
 * stderr via console.error.
 */

const server = new McpServer({
  name: "ohr-rag",
  version: "1.0.0",
});

/** Render an AnswerResult into a human-readable text block for the client. */
function formatAnswer(result: AnswerResult): string {
  const lines: string[] = [];

  lines.push(result.answer?.trim() || "(no answer produced)");

  lines.push("");
  lines.push("## Sources");
  if (result.links.length) {
    for (const link of result.links) lines.push(`- ${link}`);
  } else {
    lines.push("- (none)");
  }

  lines.push("");
  lines.push("## Chunks used");
  if (result.chunksUsed.length) {
    for (const c of result.chunksUsed) {
      lines.push(`- ${c.title} — ${c.sourceLink}`);
    }
  } else {
    lines.push("- (none)");
  }

  if (result.irrelevantChunks.length) {
    lines.push("");
    lines.push("## Flagged irrelevant chunks");
    for (const c of result.irrelevantChunks) {
      lines.push(`- ${c.title} — ${c.sourceLink}`);
    }
  }

  return lines.join("\n");
}

server.registerTool(
  "question_answering",
  {
    title: "Question Answering (RAG)",
    description:
      "Answer a question using the project's retrieval-augmented generation " +
      "pipeline. Returns an answer plus the source links and chunks it relied on.",
    inputSchema: {
      question: z.string().describe("The natural-language question to answer."),
      topK: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How many chunks the vector search considers (default 5)."),
    },
  },
  async ({ question, topK }) => {
    try {
      const result = await answerQuestion(question, { topK: topK ?? 5 });
      return {
        content: [{ type: "text", text: formatAnswer(result) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      console.error("[ohr-rag] question_answering failed:", message);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `question_answering failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ohr-rag] MCP server started on stdio.");
}

main().catch((err) => {
  console.error("[ohr-rag] fatal:", err);
  process.exit(1);
});
