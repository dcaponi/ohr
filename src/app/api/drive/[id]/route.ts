import { NextRequest, NextResponse } from "next/server";
import { getDriveContent } from "@/lib/drive/store";

export const runtime = "nodejs";

/** Fetch a single mock-Drive document's content (paragraphs) for viewing. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const content = await getDriveContent(id);
    return NextResponse.json(content);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Not found" },
      { status: 404 },
    );
  }
}
