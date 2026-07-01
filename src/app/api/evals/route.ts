import { NextRequest, NextResponse } from "next/server";
import { db, evals } from "@/db";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

/** GET → all eval cases, newest first. */
export async function GET() {
  try {
    const rows = await db.select().from(evals).orderBy(desc(evals.createdAt));
    return NextResponse.json({ evals: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** POST { question, expectedChunkIds? } → insert a new eval case. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = body?.question;
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }
    const expectedChunkIds = Array.isArray(body?.expectedChunkIds)
      ? body.expectedChunkIds.filter((x: unknown) => typeof x === "string")
      : [];

    const [row] = await db
      .insert(evals)
      .values({ question: question.trim(), expectedChunkIds })
      .returning();

    return NextResponse.json({ eval: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** DELETE ?id= → remove an eval case. */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await db.delete(evals).where(eq(evals.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
