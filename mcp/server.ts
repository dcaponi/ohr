import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { answerQuestion } from "@/lib/rag/pipeline";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_INPUT_SHAPE,
  formatAnswer,
} from "@/lib/rag/mcp-tool";

/**
 * MCP stdio server exposing the RAG pipeline as a single `question_answering`
 * tool, for local use (e.g. wiring into Claude Code on your own machine). The
 * same tool is served remotely over Streamable HTTP at /api/mcp.
 *
 * IMPORTANT: stdout is reserved for the MCP protocol. All diagnostics go to
 * stderr via console.error.
 */
const server = new McpServer({ name: "ohr-rag", version: "1.0.0" });

server.registerTool(
  TOOL_NAME,
  {
    title: "Question Answering (RAG)",
    description: TOOL_DESCRIPTION,
    inputSchema: TOOL_INPUT_SHAPE,
  },
  async ({ question, topK }) => {
    try {
      const result = await answerQuestion(question, topK ? { topK } : undefined);
      return { content: [{ type: "text", text: formatAnswer(result) }] };
    } catch (err) {
      console.error("[ohr-rag] question_answering failed:", err);
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
