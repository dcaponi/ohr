"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChunkPicker } from "../_components/ChunkPicker";
import type {
  ChunkDetail,
  ChunkSearchResult,
  Eval,
  MasterPrompts,
} from "../_components/types";
import { isInternalLink } from "../_components/types";

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** A ⓘ help icon that reveals an explanatory tooltip on hover/focus. */
function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} aria-label={text}>
      ?<span className="tip">{text}</span>
    </span>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (isInternalLink(href)) return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

// --- Section 1: master prompts ---------------------------------------------

function PromptManager({ onSaved }: { onSaved: () => void }) {
  const [prompts, setPrompts] = useState<MasterPrompts | null>(null);
  const [planner, setPlanner] = useState("");
  const [answerer, setAnswerer] = useState("");
  const [numSearches, setNumSearches] = useState(10);
  const [topK, setTopK] = useState(5);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prompts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setPrompts(data);
        setPlanner(data.queryPlanner);
        setAnswerer(data.answerer);
        setNumSearches(data.numSearches);
        setTopK(data.topK);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function save(name: "query_planner" | "answerer") {
    setStatus(null);
    setError(null);
    const body =
      name === "query_planner"
        ? { name, body: planner, numSearches, topK }
        : { name, body: answerer };
    try {
      const res = await fetch("/api/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setStatus(`Saved ${name}. Re-running all evals…`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>Master prompts</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        These drive retrieval and answering. Editing them changes pipeline
        behavior — tune them to improve the eval scores below.
      </p>

      {error && <div style={{ color: "var(--danger)" }}>Error: {error}</div>}
      {status && <div style={{ color: "var(--accent-2)" }}>{status}</div>}
      {!prompts && !error && <div className="muted">Loading…</div>}

      {prompts && (
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <label style={{ fontWeight: 600 }}>Search prompt (query planner)</label>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0" }}>
              Expands a question into <code>{"{NUM_SEARCHES}"}</code> vector
              searches. Top-K is the number of results kept per search and in the
              final deduped union.
            </p>
            <textarea
              rows={10}
              value={planner}
              onChange={(e) => setPlanner(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <label style={{ fontSize: 13, width: "auto" }}>
                Number of searches:{" "}
                <input
                  type="number"
                  min={1}
                  value={numSearches}
                  onChange={(e) =>
                    setNumSearches(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                  }
                  style={{ width: 80, display: "inline-block" }}
                />
              </label>
              <label style={{ fontSize: 13, width: "auto" }}>
                Top K:{" "}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={topK}
                  onChange={(e) =>
                    setTopK(
                      Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))),
                    )
                  }
                  style={{ width: 80, display: "inline-block" }}
                />
                <Help text="Top K = how many nearest chunks the vector search keeps per generated search, and how many the final deduped union returns to the answerer. Higher K = more context (and more tokens); lower K = tighter, more precise context." />
              </label>
              <button onClick={() => save("query_planner")}>Save search prompt</button>
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Answerer prompt</label>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0" }}>
              Answers the question grounded in retrieved chunks and flags
              irrelevant ones.
            </p>
            <textarea
              rows={10}
              value={answerer}
              onChange={(e) => setAnswerer(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={() => save("answerer")}>Save answerer</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// --- Section 2: new eval case ----------------------------------------------

function NewEvalCase({ onCreated }: { onCreated: () => void }) {
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState<ChunkSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!question.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/evals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          expectedChunkIds: expected.map((c) => c.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setQuestion("");
      setExpected([]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>New eval case</h2>
      {error && <div style={{ color: "var(--danger)" }}>Error: {error}</div>}
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontWeight: 600 }}>Question</label>
          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What safety steps precede handling the reagent?"
          />
        </div>
        <div>
          <label style={{ fontWeight: 600 }}>Expected paragraphs</label>
          <ChunkPicker selected={expected} onChange={setExpected} />
        </div>
        <div>
          <button onClick={save} disabled={saving || !question.trim()}>
            {saving ? "Saving…" : "Save eval"}
          </button>
        </div>
      </div>
    </section>
  );
}

// --- Section 3: results table ----------------------------------------------

const NUM_COLS = 7;

function ChunkCard({
  index,
  chunk,
  badge,
}: {
  index?: number;
  chunk: ChunkDetail;
  badge?: React.ReactNode;
}) {
  return (
    <div className="panel" style={{ background: "var(--panel)", padding: 10 }}>
      <div style={{ fontSize: 13 }}>
        {index !== undefined && <span className="muted">[{index}] </span>}
        {badge}
        <SourceLink href={chunk.sourceLink}>
          {chunk.title} · ¶{chunk.paragraphIndex}
        </SourceLink>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {chunk.chunkText.length > 400
          ? chunk.chunkText.slice(0, 400) + "…"
          : chunk.chunkText}
      </div>
    </div>
  );
}

function ExpandedDetail({ row }: { row: Eval }) {
  const [byId, setById] = useState<Map<string, ChunkDetail> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retrievedIds = row.retrievedChunkIds ?? [];
  const expectedIds = row.expectedChunkIds;
  const retrievedSet = new Set(retrievedIds);
  const ran = retrievedIds.length > 0;
  const missedIds = expectedIds.filter((id) => !retrievedSet.has(id));

  useEffect(() => {
    const ids = [...new Set([...retrievedIds, ...expectedIds])];
    if (ids.length === 0) {
      setById(new Map());
      return;
    }
    fetch(`/api/chunks?ids=${encodeURIComponent(ids.join(","))}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        const m = new Map<string, ChunkDetail>();
        (data.chunks as ChunkDetail[] | undefined)?.forEach((c) => m.set(c.id, c));
        setById(m);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.retrievedChunkIds, row.expectedChunkIds]);

  const resolvedRetrieved = retrievedIds.filter((id) => byId?.has(id));
  const staleRetrieved =
    ran && byId !== null && resolvedRetrieved.length === 0;

  const goldStar = (
    <span title="in expected (gold) set" style={{ color: "var(--accent-2)" }}>
      ★{" "}
    </span>
  );
  const missTag = (
    <span
      title="expected but not retrieved"
      style={{ color: "var(--danger)", fontWeight: 700 }}
    >
      ✗ missed{" "}
    </span>
  );

  return (
    <div style={{ display: "grid", gap: 16, padding: "4px 4px 8px" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Input (question)</div>
        <div>{row.question}</div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Output (generated answer)</div>
        {row.generatedAnswer ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{row.generatedAnswer}</div>
        ) : (
          <span className="muted">Not run yet.</span>
        )}
      </div>

      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Retrieved chunks ({ran ? retrievedIds.length : 0})
          <Help text="The paragraphs the vector search returned for this question. A ★ marks a chunk that is also in the expected (gold) set. Click a chunk to open its source." />
        </div>
        {!ran && <span className="muted">Not run yet.</span>}
        {ran && !byId && <div className="muted">Loading chunks…</div>}
        {staleRetrieved && (
          <span className="muted">
            Chunk references are from a run before the last re-index — re-run this
            eval to refresh them.
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ran &&
            byId &&
            retrievedIds.map((id, i) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <ChunkCard
                  key={id}
                  index={i + 1}
                  chunk={c}
                  badge={expectedIds.includes(id) ? goldStar : undefined}
                />
              );
            })}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {ran ? (
            <>
              Expected chunks not retrieved ({missedIds.length})
              <Help text="Expected (gold) chunks the vector search failed to return for this question — the gap behind recall. Improve retrieval (tune the search prompt / raise Top-K) to close these." />
            </>
          ) : (
            <>
              Expected (gold) chunks ({expectedIds.length})
              <Help text="The paragraphs you marked as the correct answer. Run the eval to see which were retrieved and which were missed." />
            </>
          )}
        </div>
        {!byId && <div className="muted">Loading…</div>}
        {ran && missedIds.length === 0 && byId && (
          <span style={{ color: "var(--accent-2)" }}>
            ✓ All expected chunks were retrieved.
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {byId &&
            (ran ? missedIds : expectedIds).map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <ChunkCard
                  key={id}
                  chunk={c}
                  badge={ran ? missTag : goldStar}
                />
              );
            })}
        </div>
      </div>

      {row.judgeRelevancy && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Relevancy verdict
            <Help text="LLM judge, yes/no: does the answer actually address the question (on-topic), regardless of factual accuracy? Not a numeric score." />
          </div>
          <div>
            <span
              style={{
                color: row.judgeRelevancy.relevant ? "var(--accent-2)" : "var(--danger)",
              }}
            >
              {row.judgeRelevancy.relevant ? "✓ relevant" : "✗ not relevant"}
            </span>{" "}
            <span className="muted">— {row.judgeRelevancy.reason}</span>
          </div>
        </div>
      )}

      {row.judgeGroundedness && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Groundedness ({pct(row.judgeGroundedness.score)})
            <Help text="The LLM judge splits the answer into atomic factual statements and labels each grounded (yes/no) against the retrieved chunks — it does not emit a 1–10 score. The percentage shown is computed by us: grounded statements ÷ total statements." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {row.judgeGroundedness.statements.map((s, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                <span style={{ color: s.grounded ? "var(--accent-2)" : "var(--danger)" }}>
                  {s.grounded ? "✓" : "✗"}
                </span>{" "}
                {s.statement}{" "}
                <span className="muted">— {s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvalRow({
  row,
  onRun,
  onDelete,
  running,
}: {
  row: Eval;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const relevancy = row.judgeRelevancy;

  return (
    <Fragment>
      <tr className="eval-row" onClick={() => setExpanded((e) => !e)}>
        <td style={{ maxWidth: 360 }}>
          <span className="muted" style={{ marginRight: 6 }}>
            {expanded ? "▾" : "▸"}
          </span>
          {row.question}
        </td>
        <td>{pct(row.precision)}</td>
        <td>{pct(row.recall)}</td>
        <td>
          {relevancy === null ? (
            "—"
          ) : (
            <span style={{ color: relevancy.relevant ? "var(--accent-2)" : "var(--danger)" }}>
              {relevancy.relevant ? "✓" : "✗"}
            </span>
          )}
        </td>
        <td>{row.judgeGroundedness === null ? "—" : pct(row.judgeGroundedness.score)}</td>
        <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
          {fmtDate(row.lastRunAt)}
        </td>
        <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <button
            className="secondary"
            onClick={() => onRun(row.id)}
            disabled={running}
            style={{ padding: "4px 10px", fontSize: 12, marginRight: 6 }}
          >
            {running ? "…" : "Run"}
          </button>
          <button
            className="secondary"
            onClick={() => onDelete(row.id)}
            style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
          >
            Delete
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td className="eval-expand" colSpan={NUM_COLS}>
            <ExpandedDetail row={row} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function EvalResults({
  refreshKey,
  runAllSignal,
}: {
  refreshKey: number;
  runAllSignal: number;
}) {
  const [rows, setRows] = useState<Eval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/evals");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setRows(data.evals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function runOne(id: string) {
    setRunningIds((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const res = await fetch("/api/evals/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // The run happens in the background on the server (survives navigation). We
  // poll for progress and refresh rows live as results are persisted.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollOnce() {
    try {
      const res = await fetch("/api/evals/run");
      const s = await res.json();
      setProgress({ done: s.done ?? 0, total: s.total ?? 0 });
      setRunningAll(!!s.running);
      await load(); // reflect results as they're persisted
      if (s.error) setError(s.error);
      if (!s.running) stopPolling();
    } catch {
      /* transient; keep polling */
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(pollOnce, 1200);
  }

  async function runAll() {
    if (runningAll) return;
    setError(null);
    setRunningAll(true);
    setProgress({ done: 0, total: rows?.length ?? 0 });
    try {
      const res = await fetch("/api/evals/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunningAll(false);
    }
  }

  // Re-run all when signaled (e.g. after a master prompt is saved).
  useEffect(() => {
    if (runAllSignal > 0) runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAllSignal]);

  // On mount, resume progress display if a background run is already going
  // (e.g. the user navigated away and came back). Clean up the poller on unmount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/evals/run");
        const s = await res.json();
        if (s.running) {
          setRunningAll(true);
          setProgress({ done: s.done ?? 0, total: s.total ?? 0 });
          startPolling();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function del(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/evals?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>Eval results</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {runningAll && progress.total > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                {progress.done}/{progress.total}
              </span>
              <div
                style={{
                  width: 140,
                  height: 8,
                  borderRadius: 999,
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                    height: "100%",
                    background: "var(--accent)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}
          <button onClick={runAll} disabled={runningAll || !rows?.length}>
            {runningAll ? "Running…" : "Run all"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Click a row to expand it (input, output, retrieved chunk texts, and judge
        details). Metrics compare what the pipeline retrieved against the expected
        (gold) chunks you selected.
      </p>

      {error && <div style={{ color: "var(--danger)" }}>Error: {error}</div>}
      {!rows && !error && <div className="muted">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="muted">No eval cases yet. Add one above.</div>
      )}

      {rows && rows.length > 0 && (
        <div>
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>
                  Precision
                  <Help text="Of the chunks the pipeline retrieved for this question, the fraction that are in the expected (gold) set: |retrieved ∩ expected| ÷ |retrieved|. With a single gold chunk, precision caps at 1 ÷ Top-K." />
                </th>
                <th>
                  Recall
                  <Help text="Of the expected (gold) chunks, the fraction the pipeline actually retrieved: |retrieved ∩ expected| ÷ |expected|. 100% means every gold chunk was found." />
                </th>
                <th>
                  Relevancy
                  <Help text="LLM judge, yes/no: does the answer address the question (on-topic)? Not a numeric score. Expand the row for the reason." />
                </th>
                <th>
                  Grounded
                  <Help text="Computed percentage: the LLM labels each factual statement in the answer grounded (yes/no) against the retrieved chunks; this % = grounded ÷ total statements. Expand the row for the per-statement breakdown." />
                </th>
                <th>
                  Last run
                  <Help text="When this eval was last executed (its results were saved to the database at that time). Runs happen on the server, so results keep saving even if you navigate away." />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <EvalRow
                  key={row.id}
                  row={row}
                  onRun={runOne}
                  onDelete={del}
                  running={runningAll || runningIds.has(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function EvalsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [runAllSignal, setRunAllSignal] = useState(0);

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Evals</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Tune the master prompts, define expected paragraphs, and measure
        retrieval quality. Saving a prompt re-runs all evals.
      </p>
      <PromptManager onSaved={() => setRunAllSignal((s) => s + 1)} />
      <NewEvalCase onCreated={() => setRefreshKey((k) => k + 1)} />
      <EvalResults refreshKey={refreshKey} runAllSignal={runAllSignal} />
    </div>
  );
}
