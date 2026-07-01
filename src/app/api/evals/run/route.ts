import { NextRequest, NextResponse } from "next/server";
import { runEval } from "@/lib/evals/run";
import { startRunAll, getRunAllState } from "@/lib/evals/run-state";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET → current background "run all" state (for progress polling). */
export async function GET() {
  return NextResponse.json(getRunAllState());
}

/**
 * POST { id? }:
 *  - id given → run that single eval synchronously, return { eval }.
 *  - no id    → start a background run of ALL evals (survives navigation) and
 *               return immediately with { started, state }. Poll GET for progress.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id;

    if (id !== undefined) {
      if (typeof id !== "string" || !id) {
        return NextResponse.json(
          { error: "id must be a non-empty string" },
          { status: 400 },
        );
      }
      const row = await runEval(id);
      return NextResponse.json({ eval: row });
    }

    const state = await startRunAll();
    return NextResponse.json({ started: true, state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
