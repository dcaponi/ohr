// Shared client-side types mirroring the JSON API contracts. These are the
// shapes as they arrive over fetch (dates are serialized to ISO strings).

export interface RetrievedChunk {
  id: string;
  documentId: string;
  title: string;
  type: string;
  paragraphIndex: number;
  chunkText: string;
  sourceLink: string;
  score: number;
}

export interface CitedChunk {
  number: number;
  id: string;
  title: string;
  sourceLink: string;
  snippet: string;
}

export interface AnswerResult {
  question: string;
  answer: string;
  searches: string[];
  retrieved: RetrievedChunk[];
  chunksUsed: CitedChunk[];
  irrelevantChunks: CitedChunk[];
  links: string[];
}

export type DriveDocType = "paper" | "sop" | "shark";

export interface DriveFile {
  id: string;
  name: string;
  type: DriveDocType;
  version: number;
  sourceUrl: string;
  contentPath: string;
  modifiedTime: string;
}

export interface DriveDocContent {
  file: DriveFile;
  paragraphs: string[];
}

export interface ChunkSearchResult {
  id: string;
  title: string;
  paragraphIndex: number;
  snippet: string;
  sourceLink: string;
}

export interface MasterPrompts {
  queryPlanner: string;
  answerer: string;
  numSearches: number;
  topK: number;
}

/** A chunk's full detail, from GET /api/chunks?ids=... (eval row expansion). */
export interface ChunkDetail {
  id: string;
  title: string;
  paragraphIndex: number;
  chunkText: string;
  sourceLink: string;
}

export interface FreshnessEntry {
  driveFileId: string;
  title: string;
  driveVersion: number;
  indexedVersion: number | null;
  stale: boolean;
}

export interface IndexResultRow {
  documentId: string;
  title: string;
  chunkCount: number;
}

export interface IndexRunResult {
  indexedDocuments: number;
  totalChunks: number;
  results: IndexResultRow[];
}

export interface JudgeRelevancy {
  relevant: boolean;
  reason: string;
}

export interface JudgeGroundedness {
  statements: { statement: string; grounded: boolean; reason: string }[];
  score: number;
}

export interface Eval {
  id: string;
  question: string;
  expectedChunkIds: string[];
  generatedAnswer: string | null;
  retrievedChunkIds: string[] | null;
  precision: number | null;
  recall: number | null;
  judgeRelevancy: JudgeRelevancy | null;
  judgeGroundedness: JudgeGroundedness | null;
  lastRunAt: string | null;
  createdAt: string;
}

/** True for links that stay inside this app (the mock Drive viewer). */
export function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}
