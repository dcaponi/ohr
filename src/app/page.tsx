"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  AnswerResult,
  CitedChunk,
  FreshnessEntry,
  IndexRunResult,
  RetrievedChunk,
} from "./_components/types";
import { isInternalLink } from "./_components/types";

interface Turn {
  question: string;
  result?: AnswerResult;
  error?: string;
  loading: boolean;
}

/** A source link that stays in-app for /drive/... and opens externally otherwise. */
function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (isInternalLink(href)) {
    return <Link href={href}>{children}</Link>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function CiteItems({ cites }: { cites: CitedChunk[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {cites.map((c) => (
        <div
          key={`${c.number}-${c.id}`}
          className="panel"
          style={{ background: "var(--panel-2)", padding: 10 }}
        >
          <div style={{ fontSize: 13 }}>
            <span className="muted">[{c.number}]</span>{" "}
            <SourceLink href={c.sourceLink}>{c.title}</SourceLink>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {c.snippet}
          </div>
        </div>
      ))}
    </div>
  );
}

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="secondary"
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 13, padding: "4px 10px" }}
      >
        {open ? "▾" : "▸"} {label}
      </button>
      {open && children}
    </div>
  );
}

function Searches({ searches }: { searches: string[] }) {
  if (!searches.length) return null;
  return (
    <Collapsible label={`Searches run (${searches.length})`}>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
        {searches.map((s, i) => (
          <li key={i} className="muted" style={{ fontSize: 13 }}>
            {s}
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

function Retrieved({ chunks }: { chunks: RetrievedChunk[] }) {
  if (!chunks.length) return null;
  return (
    <Collapsible label={`Retrieved chunks (${chunks.length})`}>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
        {chunks.map((c, i) => (
          <li key={c.id} className="muted" style={{ fontSize: 13 }}>
            [{i + 1}] <SourceLink href={c.sourceLink}>{c.title}</SourceLink>{" "}
            <span style={{ opacity: 0.7 }}>(score {c.score.toFixed(3)})</span>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

function AssistantBlock({ turn }: { turn: Turn }) {
  return (
    <div className="bubble-assistant">
      {turn.loading && <div className="muted">Thinking…</div>}
      {turn.error && (
        <div style={{ color: "var(--danger)" }}>Error: {turn.error}</div>
      )}
      {turn.result && (
        <div className="panel">
          <div style={{ whiteSpace: "pre-wrap" }}>{turn.result.answer}</div>
          {turn.result.chunksUsed.length > 0 && (
            <Collapsible label={`Chunks used (${turn.result.chunksUsed.length})`}>
              <CiteItems cites={turn.result.chunksUsed} />
            </Collapsible>
          )}
          <Searches searches={turn.result.searches} />
          <Retrieved chunks={turn.result.retrieved} />
        </div>
      )}
    </div>
  );
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Toolbar action state.
  const [indexResult, setIndexResult] = useState<IndexRunResult | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [freshness, setFreshness] = useState<FreshnessEntry[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const [toolErr, setToolErr] = useState<string | null>(null);

  const busy = turns.some((t) => t.loading);

  // Auto-scroll to the newest message (just above the input).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    const index = turns.length;
    setTurns((prev) => [...prev, { question: q, loading: true }]);
    try {
      // Top-K is configured on the search prompt (see /evals), not sent here.
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setTurns((prev) =>
        prev.map((t, i) => (i === index ? { ...t, loading: false, result: data } : t)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTurns((prev) =>
        prev.map((t, i) => (i === index ? { ...t, loading: false, error: message } : t)),
      );
    }
  }

  async function reindex() {
    setIndexing(true);
    setToolMsg(null);
    setToolErr(null);
    setIndexResult(null);
    try {
      const res = await fetch("/api/index", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setIndexResult(data);
      setToolMsg(`Indexed ${data.indexedDocuments} docs, ${data.totalChunks} chunks.`);
    } catch (err) {
      setToolErr(err instanceof Error ? err.message : String(err));
    } finally {
      setIndexing(false);
    }
  }

  async function freshnessScan() {
    setScanning(true);
    setToolMsg(null);
    setToolErr(null);
    setFreshness(null);
    try {
      const res = await fetch("/api/freshness");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      const scanned: FreshnessEntry[] = data.scanned ?? [];
      setFreshness(scanned);
      const stale = scanned.filter((f) => f.stale);
      setToolMsg(stale.length ? `${stale.length} stale doc(s).` : "All docs up to date.");
    } catch (err) {
      setToolErr(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  const staleDocs = freshness?.filter((f) => f.stale) ?? [];

  return (
    <div
      style={{
        height: "calc(100dvh - 50px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* compact toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ flex: 1 }} />
        <button
          className="secondary"
          onClick={reindex}
          disabled={indexing}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          {indexing ? "Reindexing…" : "Reindex corpus"}
        </button>
        <button
          className="secondary"
          onClick={freshnessScan}
          disabled={scanning}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          {scanning ? "Scanning…" : "Freshness scan"}
        </button>
        {toolMsg && (
          <span className="muted" style={{ fontSize: 12 }}>
            {toolMsg}
          </span>
        )}
        {toolErr && (
          <span style={{ fontSize: 12, color: "var(--danger)" }}>{toolErr}</span>
        )}
      </div>
      {staleDocs.length > 0 && (
        <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--border)" }}>
          {staleDocs.map((f) => (
            <span
              key={f.driveFileId}
              style={{ fontSize: 12, color: "var(--danger)", marginRight: 12 }}
            >
              {f.title} (v{f.indexedVersion ?? "—"} → v{f.driveVersion})
            </span>
          ))}
        </div>
      )}

      {/* messages (grow upward: oldest top, newest just above the input) */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {turns.length === 0 && (
            <div className="muted" style={{ textAlign: "center", marginTop: 40 }}>
              Ask a question to get started.
            </div>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="bubble-user">{turn.question}</div>
              <AssistantBlock turn={turn} />
            </div>
          ))}
        </div>
      </div>

      {/* input pinned to the bottom of the viewport */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--panel)" }}>
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <textarea
            rows={1}
            placeholder="Ask a question…  (Enter to send, Shift+Enter for newline)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            style={{ resize: "none", maxHeight: 160 }}
          />
          <button onClick={ask} disabled={busy || !question.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
