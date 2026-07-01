# ohr — Research Knowledge Assistant

**Take-home Exercise 4 (Research Knowledge Assistant).** A retrieval Q&A
assistant that lets a working scientist ask a natural-language question and get a
**grounded, cited answer** drawn from a corpus of documents, and that **declines
gracefully** when the corpus doesn't contain the answer. The corpus lives in a
**mock Google Drive** (a real Drive integration is out of scope per the brief;
mocking is explicitly allowed).

- **Live surfaces:** a chat UI, a JSON API (`POST /api/ask`), and an **MCP
  server** (`question_answering` tool) so it can be driven from Claude Code.
- **Corpus:** 30 public/synthetic documents — 20 open-access arXiv papers on
  synthesizing fuels/chemicals, 5 lab-equipment SOPs, and 5 shark-fact documents
  (an intentional out-of-domain set; see [Design rationale](#design-rationale)).
- **Evaluation:** context precision/recall + an LLM-as-judge (relevancy and
  groundedness), with 20 seeded eval cases and a UI to run them and tune prompts.

---

## What it does

1. You ask a question (e.g. *"How is Fischer-Tropsch synthesis used to make
   hydrocarbons?"*).
2. A **query-planner** prompt expands it into N focused search queries.
3. Each query is embedded and run against **pgvector**; results are deduped
   across queries and the top-K union is kept.
4. An **answerer** prompt produces an answer grounded **only** in those chunks,
   with inline `[#]` citations. Each cited chunk links back to its source
   (an arXiv page with a text-highlight fragment, or the in-app document viewer
   deep-linked to the exact paragraph).
5. If the retrieved chunks don't support an answer, it says so instead of
   fabricating one.

---

## Quick start (run locally)

**Prerequisites:** Node 20+, Docker, an `ANTHROPIC_API_KEY`, and an
`OPENAI_API_KEY` (embeddings only — see rationale).

```bash
cp .env.example .env        # fill in ANTHROPIC_API_KEY and OPENAI_API_KEY
npm install
npm run db:up               # Postgres 16 + pgvector in Docker (localhost:5433)
npm run db:migrate          # create the vector extension, tables, HNSW index
npm run index               # chunk + embed the 30-doc corpus  (uses OpenAI)
npm run seed:evals          # load the 20 evaluation cases
npm run dev                 # http://localhost:3000
```

Optional:
- `npm run mcp` — start the MCP server (stdio). See [MCP](#mcp-server).
- `npm run db:studio` — Drizzle Studio to inspect the DB.

Deployment (Railway, which runs a persistent server for the background eval
runner) is documented separately.

---

## How to use it

Three surfaces, all backed by the same pipeline:

### 1. Ask (`/`)
A chat interface. Type a question; you get the grounded answer with collapsible
sections beneath it: **Chunks used** (the sources it relied on, each a clickable
link), **Searches run**, and **Retrieved chunks**. A toolbar has **Reindex
corpus** and **Freshness scan** actions.

### 2. Drive (`/drive`)
A mock Google-Drive browser over the corpus (name/type filters, versions). Open
any document to read it; paragraphs are anchored so a stored `#p<n>` citation
deep-links to the exact paragraph.

### 3. Evals (`/evals`)
- **Master prompts** — edit the two prompts that drive the pipeline (the
  search/query-planner prompt, including *number of searches* and *Top-K*, and
  the answerer prompt). **Saving a prompt re-runs all evals** so you can see the
  effect immediately.
- **New eval case** — write a question and pick its expected ("gold") paragraphs
  via a vector-search tag picker.
- **Eval results** — a table with per-case metrics; **Run all** executes them on
  the server in the background (progress bar; survives navigating away) and shows
  a **Last run** timestamp. Expand a row to see the input, the generated answer,
  the retrieved chunks (★ = also expected), and the **expected chunks that were
  *not* retrieved** (the gap behind recall), plus the per-statement groundedness
  breakdown.

### JSON API
```bash
curl -s localhost:3000/api/ask -H 'content-type: application/json' \
  -d '{"question":"How is Fischer-Tropsch synthesis used to make hydrocarbons?"}'
# → { answer, searches, retrieved, chunksUsed, irrelevantChunks, links }
```

### MCP server
Exposes one `question_answering` tool running the same pipeline, so the assistant
can be used from Claude Code:
```bash
claude mcp add ohr-rag -- npx tsx /ABSOLUTE/PATH/TO/ohr/mcp/server.ts
```
(Run from the project root so `.env` and the `@/` alias resolve. Don't wrap in
`npm run mcp` — npm's banner would corrupt the MCP stdio stream.)

---

## Evaluation & metrics

Answer quality is measured two ways. Run everything from the **Evals** page
("Run all") or per-row.

### Retrieval metrics (vs. the gold/expected chunks you select)
- **Precision** = `|retrieved ∩ expected| / |retrieved|` — of what the search
  returned, how much was actually relevant. (With a single-chunk gold set,
  precision caps at `1 / Top-K`, so recall + the judges matter more for those.)
- **Recall** = `|retrieved ∩ expected| / |expected|` — of the gold chunks, how
  many the search actually found. **This is the key retrieval-quality signal**;
  100% means every expected paragraph was retrieved.

### LLM-as-judge (Claude returns yes/no, never a 1–10 score)
- **Relevancy** — does the answer actually address the question (on-topic),
  regardless of factual accuracy? A single **yes/no** with a one-line reason.
- **Groundedness** — the judge splits the answer into atomic factual statements
  and labels **each** grounded / not-grounded (yes/no) against the retrieved
  chunks. The **percentage shown is computed by us** as
  `grounded ÷ total statements` — it is not a score the model invents. Expand a
  row to see the per-statement verdicts.

These target exactly what the brief assesses: **grounding and control of
fabrication** (groundedness), **retrieval quality** (precision/recall + the
"expected but not retrieved" list), and an **evaluation mindset** (a repeatable
harness you tune prompts against).

### Representative questions & answers
| Question | Behavior |
|---|---|
| *How is Fischer-Tropsch synthesis used to make hydrocarbons?* | Grounded answer citing the FT microkinetics paper(s); links to the arXiv source with a highlight fragment. |
| *What is the recommended maintenance procedure for a benchtop centrifuge?* | Answer from the centrifuge SOP (wipe with 70% ethanol, inspect/retire corroded rotors), linked to the exact SOP paragraph. |
| *What senses do sharks use to detect prey?* | Answer grounded in the shark "senses & anatomy" doc (electroreception via ampullae of Lorenzini, etc.). |
| *In Fischer-Tropsch synthesis, which carbon-number ranges make gasoline vs diesel?* | Answers C5–11 → gasoline, C10–20 → diesel; a good case where retrieval can *miss* the gold chunk at low Top-K — visible in the eval as recall < 1. |
| *What is the meaning of life?* | **Declines:** "I don't have enough information in the corpus to answer that." — no fabrication, no chunks cited. |

The 20 seeded eval cases (10 SOP, 10 paper) live in `scripts/seed-evals.ts`.

---

## Design rationale

**Two-prompt RAG (planner → retrieve → answerer), both prompts editable.**
Expanding one question into several searches meaningfully improves recall on
technical corpora (synonyms, sub-questions, phrasing), and deduping the union
keeps the answerer's context tight. Making both prompts first-class, editable,
and eval-linked turns prompt tuning into a measurable loop rather than guesswork.

**Grounding & anti-fabrication are explicit, not implicit.** The answerer is
instructed to use only the retrieved chunks, cite `[#]`, and — when the chunks
don't cover the question — return a one-line "not enough information" instead of
describing unrelated chunks. Every chunk stores a deep `source_link` so a reader
can verify each claim (the brief's core ask).

**Embeddings from OpenAI, generation from Claude.** Anthropic has no embeddings
API, so retrieval uses `text-embedding-3-small` (1536-dim) while answering and
judging use `claude-opus-4-8`. Clean separation, and the embedding model is a
one-line swap.

**Postgres + pgvector.** One store for documents, chunks, prompts, and eval
results; cosine ANN via an HNSW index. Runs in Docker locally and on managed
Postgres in the cloud with a single connection string.

**Deterministic chunk IDs.** Chunk IDs are derived from
`(document, paragraph index)`, so re-indexing is idempotent and **saved eval
gold sets survive a reindex** — a subtle but important correctness property once
evals reference specific chunks.

**Mock Google Drive with a freshness scan.** Documents live behind a manifest
with per-file **versions**; chunks record the version they were indexed at, so a
"freshness scan" can detect drift and re-index only what changed — mirroring the
real problem (a living Drive) without a real integration.

**Server-side background eval runs.** "Run all" runs on the server and persists
each result as it completes, so a run survives the user navigating away, with a
"Last run" timestamp for transparency. (This is also why the app targets a
persistent server rather than serverless functions.)

**The shark documents are deliberate.** A scientist's corpus in reality contains
plenty of material irrelevant to any given question. The shark set is an
out-of-domain block that lets the evals demonstrate two things the brief cares
about: retrieval **precision** (does a fuel-synthesis question pull only fuel
chunks?) and **graceful decline** (an off-corpus question returns nothing rather
than forcing an answer).

---

## Where and why I stopped

Per the brief (a ~4-hour, judgment-over-polish slice), I deliberately left out:
- **Auth, multi-tenant, rate limiting, hardening** — explicitly out of scope.
- **Reranking / hybrid (BM25 + vector) retrieval** — the two-prompt multi-query
  approach was a better return on time; the eval harness is in place to justify
  adding a reranker later against measured recall.
- **Real Google Drive / OAuth** — mocked, as allowed.
- **Patents / experiment write-ups** in the corpus — papers + SOPs cover the
  representative cases; adding more document types is just more ingestion.

The line I held: a genuinely working end-to-end slice (ingest → retrieve →
grounded cited answer → decline behavior → measurable evals) over breadth.

---

## How AI was used

This project was built with **Claude Code** (Anthropic's agentic CLI) as the
primary development environment, used deliberately rather than as autocomplete:
- **Parallel subagents** split the initial build across four workstreams —
  corpus acquisition (downloading real arXiv PDFs, authoring SOPs/shark docs),
  the UI pages, the MCP server, and the evals engine — against fixed
  interface contracts I defined first, then integrated.
- The **`claude-api` skill** was used to get current Anthropic SDK usage right
  (model IDs, request shape) rather than relying on stale patterns — and it
  surfaced that the installed SDK version needed a different structured-output
  approach, which was adjusted.
- Iterative, eval-driven refinement of the master prompts and the UX (chat
  layout, collapsible sources, eval detail views, background runs).
- Claude (`claude-opus-4-8`) is also the runtime model for query planning,
  answering, and the LLM-as-judge.

---

## How it works (internals)

- **DB** (`src/db`): Drizzle schema — `documents`, `chunks`
  (`embedding vector(1536)`, `source_link`, `date_indexed`, `document_version`),
  `prompts` (the two editable master prompts + Top-K/num-searches), `evals`.
- **Mock Drive** (`src/lib/drive/`): `docs/drive-manifest.json` + on-disk content
  (arXiv PDFs; authored markdown), with versioning.
- **Indexing** (`src/lib/indexer.ts`): paragraph chunking → OpenAI embeddings →
  `chunks`. Manual (`POST /api/index`) and cron (`/api/cron/index`).
- **Freshness** (`src/lib/freshness.ts`): compares Drive version vs indexed
  `document_version`; re-indexes drift.
- **RAG** (`src/lib/rag/pipeline.ts`): query-planner → `multiSearch` (per-query
  top-K, dedupe, union) → answerer.
- **Evals** (`src/lib/evals/`): precision/recall metrics, LLM-judge, and a
  server-side background runner.

```
docs/                 corpus (arXiv PDFs, SOP/shark markdown) + drive-manifest.json
src/db/               schema, client, migrator
src/lib/drive/        mock Google Drive
src/lib/              embeddings, anthropic, chunking, indexer, freshness, prompts
src/lib/rag/          vector search + two-prompt pipeline
src/lib/evals/        metrics + LLM-as-judge + background runner
src/app/              UI pages + JSON API routes
mcp/server.ts         MCP question_answering tool
scripts/              index-corpus, seed-evals
```
