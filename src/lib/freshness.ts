import { db, documents, chunks } from "@/db";
import { eq, sql } from "drizzle-orm";
import { listDriveFiles } from "@/lib/drive/store";
import { indexCorpus, type IndexResult } from "@/lib/indexer";

export interface FreshnessEntry {
  driveFileId: string;
  title: string;
  driveVersion: number;
  indexedVersion: number | null;
  stale: boolean;
}

/**
 * Compare each Drive file's current version against the version we indexed.
 * This is the read-only half of the "freshness scan" cron.
 */
export async function scanFreshness(): Promise<FreshnessEntry[]> {
  const files = await listDriveFiles();
  const out: FreshnessEntry[] = [];

  for (const file of files) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.driveFileId, file.id));

    let indexedVersion: number | null = null;
    if (doc) {
      const [row] = await db
        .select({ v: sql<number>`max(${chunks.documentVersion})` })
        .from(chunks)
        .where(eq(chunks.documentId, doc.id));
      indexedVersion = row?.v ?? null;
    }

    out.push({
      driveFileId: file.id,
      title: file.name,
      driveVersion: file.version,
      indexedVersion,
      stale: indexedVersion === null || indexedVersion !== file.version,
    });
  }
  return out;
}

/** Scan + re-index anything stale. This is what the freshness cron invokes. */
export async function runFreshnessScan(): Promise<{
  scanned: FreshnessEntry[];
  reindexed: IndexResult[];
}> {
  const scanned = await scanFreshness();
  const reindexed = scanned.some((e) => e.stale)
    ? await indexCorpus({ onlyChanged: true })
    : [];
  return { scanned, reindexed };
}
