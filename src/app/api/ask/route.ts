import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * JSON API: accepts a question (or command) and runs the full RAG pipeline.
 * Body: { question: string, topK?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question: string | undefined = body.question;
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Body must include a non-empty `question` string." },
        { status: 400 },
      );
    }
    const topK =
      typeof body.topK === "number" && body.topK > 0
        ? Math.min(Math.floor(body.topK), 50)
        : undefined;

    const result = await answerQuestion(question, { topK });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
