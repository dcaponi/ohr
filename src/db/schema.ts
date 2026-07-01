import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  vector,
  jsonb,
  real,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// Embedding dimensionality for OpenAI text-embedding-3-small.
export const EMBEDDING_DIMS = 1536;

export const docTypeEnum = pgEnum("doc_type", ["paper", "sop", "shark"]);

/**
 * One row per corpus document. Mirrors a file in the mock Google Drive.
 * `currentVersion` is the version living in the (mock) Drive right now;
 * chunks store the version they were indexed at, so the freshness scan can
 * detect drift (currentVersion !== chunk.documentVersion).
 */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stable, human-meaningful id shared with the mock Drive (e.g. "paper-0001").
  driveFileId: text("drive_file_id").notNull().unique(),
  title: text("title").notNull(),
  type: docTypeEnum("type").notNull(),
  // Canonical external URL (arxiv abs page, or an internal /drive route).
  sourceUrl: text("source_url").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Paragraph-level chunks with embeddings. This is the exact storage format the
 * spec asks for: document id, chunk text, link to source (deep-linked to the
 * paragraph / highlight fragment), vector, date indexed, and the document
 * version at the time of indexing.
 */
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // 0-based paragraph index within the document.
    paragraphIndex: integer("paragraph_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    // Deep link back to the source: /drive/<driveFileId>#p<idx> for internal
    // docs, or an external URL with a `#:~:text=` highlight fragment.
    sourceLink: text("source_link").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    dateIndexed: timestamp("date_indexed", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Version of the parent document at the moment this chunk was indexed.
    documentVersion: integer("document_version").notNull(),
  },
  (t) => [
    index("chunks_document_id_idx").on(t.documentId),
    // Cosine-distance ANN index over embeddings.
    index("chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

/**
 * The two editable "master prompts" plus the query-planner top-k config,
 * managed from the evals page. `name` is unique so we upsert per prompt.
 */
export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // "query_planner" | "answerer"
  body: text("body").notNull(),
  // For query_planner: how many searches to generate. Ignored for answerer.
  numSearches: integer("num_searches").notNull().default(10),
  // For query_planner: how many vector results to consider per search and in
  // the final deduped union (the retrieval "top K"). Ignored for answerer.
  topK: integer("top_k").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A saved eval case + its most recent run results. Expected chunks are the
 * "gold" paragraphs a user picked via the tag-search UI; precision/recall are
 * computed against the chunks the pipeline actually retrieved.
 */
export const evals = pgTable("evals", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  // Gold chunk ids selected by the user (expected/relevant paragraphs).
  expectedChunkIds: jsonb("expected_chunk_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  // --- last-run results (nullable until run) ---
  generatedAnswer: text("generated_answer"),
  retrievedChunkIds: jsonb("retrieved_chunk_ids").$type<string[]>(),
  precision: real("precision"),
  recall: real("recall"),
  // LLM-as-judge verdicts.
  judgeRelevancy: jsonb("judge_relevancy").$type<{
    relevant: boolean;
    reason: string;
  } | null>(),
  judgeGroundedness: jsonb("judge_groundedness").$type<{
    statements: { statement: string; grounded: boolean; reason: string }[];
    score: number;
  } | null>(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type Eval = typeof evals.$inferSelect;
