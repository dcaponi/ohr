# Architecture decisions

## Stack
- Next.js 15 App Router + TypeScript, deploy target Vercel.
- Postgres 16 + pgvector (Docker locally, host port 5433 → container 5432).
  Production: NeonDB (swap DATABASE_URL; TLS auto-enabled for non-localhost).
- Drizzle ORM + drizzle-kit migrations.
- Embeddings: OpenAI `text-embedding-3-small` (1536 dims). Anthropic has no
  embeddings API — this is why OpenAI is in the stack.
- LLM: Anthropic `claude-opus-4-8`, adaptive thinking, streaming via SDK.

## Chunk storage format (per spec)
document_id, chunk_text, source_link (deep link to paragraph or URL with
`#:~:text=` highlight fragment), embedding vector, date_indexed,
document_version (version at index time). See `src/db/schema.ts` → `chunks`.

## Mock Google Drive
`docs/drive-manifest.json` is the source of truth. Each entry:
`{ id, name, type, version, sourceUrl, contentPath, modifiedTime }`.
- papers → real arxiv PDFs (text extracted via pdf-parse)
- sops / sharks → authored markdown
Version drift = a simulated Google Docs edit; freshness scan re-indexes drift.

## RAG pipeline (two master prompts, editable on /evals)
1. query_planner: user question → N searches (N = numSearches, default 10).
2. multiSearch: embed each search, top-k each, dedupe across searches (keep best
   score per chunk), return top-k of the union. topK is the settings-rail value
   (default 5).
3. answerer: question + numbered chunks → JSON { answer, chunksUsed,
   irrelevantChunks }. Answer cites [#], links resolve to chunk.source_link.

## Evals
- precision = |retrieved ∩ expected| / |retrieved|
- recall = |retrieved ∩ expected| / |expected|
- LLM-judge relevancy: is answer semantically similar to the question? yes/no.
- LLM-judge groundedness: for each factual statement, is it backed by a
  referenced chunk? yes/no per statement + aggregate score.
