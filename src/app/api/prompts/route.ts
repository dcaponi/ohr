import { NextRequest, NextResponse } from "next/server";
import { getPrompts, updatePrompt } from "@/lib/prompts";

export const runtime = "nodejs";

/** GET → the current master prompts { queryPlanner, answerer, numSearches }. */
export async function GET() {
  try {
    const prompts = await getPrompts();
    return NextResponse.json(prompts);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** PUT { name, body?, numSearches? } → update one master prompt. */
export async function PUT(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const name = payload?.name;
    if (name !== "query_planner" && name !== "answerer") {
      return NextResponse.json(
        { error: 'name must be "query_planner" or "answerer"' },
        { status: 400 },
      );
    }

    const patch: { body?: string; numSearches?: number; topK?: number } = {};
    if (payload?.body !== undefined) {
      if (typeof payload.body !== "string") {
        return NextResponse.json(
          { error: "body must be a string" },
          { status: 400 },
        );
      }
      patch.body = payload.body;
    }
    if (payload?.numSearches !== undefined) {
      if (
        typeof payload.numSearches !== "number" ||
        !Number.isInteger(payload.numSearches) ||
        payload.numSearches < 1
      ) {
        return NextResponse.json(
          { error: "numSearches must be a positive integer" },
          { status: 400 },
        );
      }
      patch.numSearches = payload.numSearches;
    }
    if (payload?.topK !== undefined) {
      if (
        typeof payload.topK !== "number" ||
        !Number.isInteger(payload.topK) ||
        payload.topK < 1 ||
        payload.topK > 50
      ) {
        return NextResponse.json(
          { error: "topK must be an integer between 1 and 50" },
          { status: 400 },
        );
      }
      patch.topK = payload.topK;
    }

    await updatePrompt(name, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
