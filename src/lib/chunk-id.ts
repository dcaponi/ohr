import { createHash } from "node:crypto";

// Fixed namespace UUID for this project's chunk ids (any constant UUID works).
const NAMESPACE = "6f4d2a1e-9c3b-4e7a-8b21-2f5c7d9a0e11";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** RFC-4122 v5 (SHA-1, name-based) UUID. Deterministic for a given name. */
function uuidv5(name: string): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(NAMESPACE), Buffer.from(name, "utf8")]))
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  return bytesToUuid(bytes);
}

/**
 * Stable chunk id derived from the document + paragraph position. Because it is
 * deterministic, re-indexing a document produces the SAME chunk ids, so saved
 * eval gold sets and any UI-picked chunk references survive a reindex.
 */
export function chunkId(driveFileId: string, paragraphIndex: number): string {
  return uuidv5(`${driveFileId}#${paragraphIndex}`);
}
