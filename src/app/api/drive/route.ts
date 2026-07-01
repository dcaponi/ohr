import { NextResponse } from "next/server";
import { listDriveFiles } from "@/lib/drive/store";

export const runtime = "nodejs";

/** List all mock-Drive files (for the Drive browser UI). */
export async function GET() {
  const files = await listDriveFiles();
  return NextResponse.json({ files });
}
