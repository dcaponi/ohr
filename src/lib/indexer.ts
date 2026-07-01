import { db, documents, chunks } from "@/db";
import { eq, sql } from "drizzle-orm";
import {
  listDriveFiles,
  getDriveContent,
  paragraphLink,
  type DriveFile,
} from "@/lib/drive/store";
import { chunkParagraphs } from "@/lib/chunking";
import { embedBatch } from "@/lib/embeddings";
import { chunkId } from "@/lib/chunk-id";

export interface IndexResult {
  documentId: string;
  driveFileId: string;
  title: string;
  version: number;
  chunkCount: number;
}

/** Ensure a `documents` row exists / is current for a Drive file. Returns its id. */
async function upsertDocument(file: DriveFile): Promise<string> {
  const [row] = await db
    .insert(documents)
    .values({
      driveFileId: file.id,
      title: file.name,
      type: file.type,
      sourceUrl: file.sourceUrl || `/drive/${file.id}`,
      currentVersion: file.version,
    })
    .onConflictDoUpdate({
      target: documents.driveFileId,
      set: {
        title: file.name,
        type: file.type,
        sourceUrl: file.sourceUrl || `/drive/${file.id}`,
        currentVersion: file.version,
        updatedAt: new Date(),
      },
    })
    .returning({ id: documents.id });
  return row.id;
}

/** Index (or re-index) a single Drive file: chunk → embed → replace rows. */
export async function indexDriveFile(file: DriveFile): Promise<IndexResult> {
  const documentId = await upsertDocument(file);
  const { paragraphs } = await getDriveContent(file.id);
  const pieces = chunkParagraphs(paragraphs);

  const vectors = await embedBatch(pieces.map((p) => p.text));

  // Replace chunks transactionally so a doc is never left half-indexed.
  await db.transaction(async (tx) => {
    await tx.delete(chunks).where(eq(chunks.documentId, documentId));
    if (pieces.length === 0) return;
    await tx.insert(chunks).values(
      pieces.map((p, i) => ({
        // Deterministic id: stable across re-indexing so saved eval gold sets
        // and UI chunk references survive a reindex.
        id: chunkId(file.id, p.paragraphIndex),
        documentId,
        paragraphIndex: p.paragraphIndex,
        chunkText: p.text,
        sourceLink: paragraphLink(file, p.paragraphIndex, p.text),
        embedding: vectors[i],
        documentVersion: file.version,
      })),
    );
  });

  return {
    documentId,
    driveFileId: file.id,
    title: file.name,
    version: file.version,
    chunkCount: pieces.length,
  };
}

/**
 * Index the whole corpus (manual trigger). Returns per-document results.
 * `onlyChanged` restricts work to docs whose Drive version differs from the
 * version currently stored on their chunks (used by the freshness scan).
 */
export async function indexCorpus(opts?: {
  onlyChanged?: boolean;
}): Promise<IndexResult[]> {
  const files = await listDriveFiles();
  const targets = opts?.onlyChanged ? await filterDrifted(files) : files;

  const results: IndexResult[] = [];
  for (const file of targets) {
    results.push(await indexDriveFile(file));
  }
  return results;
}

/** Keep only files whose Drive version differs from what we indexed. */
async function filterDrifted(files: DriveFile[]): Promise<DriveFile[]> {
  const drifted: DriveFile[] = [];
  for (const file of files) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.driveFileId, file.id));

    if (!doc) {
      drifted.push(file); // never indexed
      continue;
    }
    const [row] = await db
      .select({ v: sql<number>`max(${chunks.documentVersion})` })
      .from(chunks)
      .where(eq(chunks.documentId, doc.id));
    const indexedVersion = row?.v ?? null;
    if (indexedVersion === null || indexedVersion !== file.version) {
      drifted.push(file);
    }
  }
  return drifted;
}
