import { createMcpHandler } from "mcp-handler";
import { answerQuestion } from "@/lib/rag/pipeline";
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_INPUT_SHAPE,
  formatAnswer,
} from "@/lib/rag/mcp-tool";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Remote MCP server over Streamable HTTP, served by the app at /api/mcp so it
 * deploys with the rest of the app (no separate process). Exposes the same
 * `question_answering` tool as the local stdio server. Connect from Claude Code:
 *
 *   claude mcp add --transport http ohr-rag https://<host>/api/mcp \
 *     --header "Authorization: Bearer <MCP_TOKEN>"
 */
const mcp = createMcpHandler(
  (server) => {
    server.tool(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      TOOL_INPUT_SHAPE,
      async ({ question, topK }) => {
        try {
          const result = await answerQuestion(
            question,
            topK ? { topK } : undefined,
          );
          return { content: [{ type: "text" as const, text: formatAnswer(result) }] };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `question_answering failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              },
            ],
          };
        }
      },
    );
  },
  {},
  // basePath "/api" → this route (/api/mcp) is the Streamable HTTP endpoint.
  { basePath: "/api", maxDuration: 300, verboseLogs: false },
);

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="ohr-mcp"',
    },
  });
}

/**
 * Shared-secret bearer auth. If MCP_TOKEN is set (production), every request must
 * carry `Authorization: Bearer <MCP_TOKEN>`. If unset (local dev), it's open.
 */
async function handler(req: Request): Promise<Response> {
  const token = process.env.MCP_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return unauthorized();
  }
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
