# ohr — RAG Retrieval Q&A Bot

A simple Retrieval-Augmented-Generation Q&A bot over a 30-document corpus:

- **20 arxiv papers** on synthesizing fuels/chemicals (Fischer-Tropsch, CO₂→hydrocarbons,
  biomass pyrolysis, power-to-gas, syngas conversion, …) — real PDFs in `docs/papers`
- **5 lab-equipment SOPs** (centrifuge, gel electrophoresis, microscope, autoclave,
  analytical balance) — `docs/sops`
- **5 shark-fact documents** (~3 pages each) — `docs/sharks`

Next.js (App Router) + Postgres/pgvector locally via Docker, deployable to Vercel
with NeonDB. Claude (`claude-opus-4-8`) answers; OpenAI (`text-embedding-3-small`,
1536-dim) provides embeddings (Anthropic has no embeddings API).

## Prerequisites

- Node 20+ and npm
- Docker (for local Postgres + pgvector)
- An Anthropic API key and an OpenAI API key

## Setup

```bash
cp .env.example .env      # then fill ANTHROPIC_API_KEY and OPENAI_API_KEY
npm install
npm run db:up             # Postgres + pgvector on localhost:5433
npm run db:migrate        # apply schema (creates pgvector, tables, HNSW index)
npm run index             # chunk + embed the whole corpus into the DB
npm run dev               # http://localhost:3000
```

`npm run index` needs `OPENAI_API_KEY`. Answering/evals need `ANTHROPIC_API_KEY`.

## Using it

### UI (http://localhost:3000)

- **Ask** (`/`) — ask a question or command; see the grounded answer with inline
  `[#]` citations, the chunks it used, chunks it flagged as irrelevant, and the
  searches it ran. Right **settings rail** adjusts **Top K** (how many chunks the
  vector search considers), plus buttons to **Reindex corpus** and **Freshness scan**.
- **Drive** (`/drive`) — a mock Google-Drive browser over the corpus; open any
  document to read it (paragraphs are anchored so stored `#p<n>` links deep-link).
- **Evals** (`/evals`) — edit the two **master prompts** (query planner + answerer),
  create eval cases (question + expected paragraphs via a vector-search tag picker),
  and run context **precision/recall** + the **LLM-as-judge** (relevancy +
  groundedness). Tune the prompts to improve the scores.

### JSON API

```bash
curl -s localhost:3000/api/ask -H 'content-type: application/json' \
  -d '{"question":"How is Fischer-Tropsch synthesis used to make hydrocarbons?","topK":5}'
```

Returns `{ answer, searches, retrieved, chunksUsed, irrelevantChunks, links }`.

Other endpoints: `POST /api/index` (manual reindex), `GET|POST /api/cron/index`,
`GET|POST /api/cron/freshness` (scan / re-index drifted docs), `GET /api/drive`,
`GET /api/drive/[id]`, `GET /api/chunks/search?q=`, `/api/evals`, `/api/evals/run`,
`/api/prompts`.

### MCP server (hook into Claude Code)

Exposes one `question_answering` tool running the same pipeline:

```bash
claude mcp add ohr-rag -- npx tsx /ABSOLUTE/PATH/TO/ohr/mcp/server.ts
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "ohr-rag": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/ohr/mcp/server.ts"]
    }
  }
}
```

Run from the project root so `.env` and the `@/` → `src/` alias resolve. Do **not**
wrap it in `npm run mcp` — npm prints a banner to stdout that corrupts the MCP stream.

## How it works

1. **Query planner prompt** expands your question into N searches (default 10).
2. Each search is embedded and run against pgvector (top-k per search); results are
   **deduped across searches** (best score per chunk) and the top-k union is kept.
3. **Answerer prompt** gets the numbered chunks and returns the answer plus which
   chunks it used and which it judged irrelevant. Answers cite `[#]`; each chunk
   carries a **source link** (arxiv URL with a `#:~:text=` highlight for papers, or
   an internal `/drive/<id>#p<n>` deep link for authored docs).

**Chunk storage** (`chunks` table) is: document id, chunk text, source link, the
embedding vector, date indexed, and the document version at index time — so the
**freshness scan** can detect when a Drive doc's version drifts from what was
indexed and re-index just those.

## Deploying (Vercel + NeonDB)

- Set `DATABASE_URL` to your Neon connection string (TLS auto-enabled for
  non-localhost hosts), plus `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and optionally
  `CRON_SECRET`. Run the migration against Neon once (`npm run db:migrate`).
- `vercel.json` wires the two cron endpoints (freshness hourly, full index weekly);
  Vercel adds `Authorization: Bearer $CRON_SECRET` automatically when set.

## Layout

```
docs/                 corpus (papers PDFs, sops/sharks md) + drive-manifest.json
src/db/               Drizzle schema, client, migrator
src/lib/drive/        mock Google Drive (manifest + content + versioning)
src/lib/              embeddings, anthropic, chunking, indexer, freshness, prompts
src/lib/rag/          vector search + two-prompt pipeline
src/lib/evals/        precision/recall metrics + LLM-as-judge + eval runner
src/app/              UI pages + JSON API routes
mcp/server.ts         MCP question_answering tool
```
