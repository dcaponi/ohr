"use client";

import { useEffect, useRef, useState } from "react";
import type { ChunkSearchResult } from "./types";

/**
 * Expected-paragraphs tag picker. As the user types, it queries the lexical
 * chunk-search endpoint and shows matching paragraphs; clicking one adds it as
 * a removable tag. Selection is lifted to the parent as ChunkSearchResult[].
 */
export function ChunkPicker({
  selected,
  onChange,
}: {
  selected: ChunkSearchResult[];
  onChange: (next: ChunkSearchResult[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChunkSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search on the query.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/chunks/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => setResults(data.chunks ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedIds = new Set(selected.map((c) => c.id));

  function add(chunk: ChunkSearchResult) {
    if (!selectedIds.has(chunk.id)) onChange([...selected, chunk]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selected.filter((c) => c.id !== id));
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map((c) => (
            <span key={c.id} className="tag">
              {c.title} #p{c.paragraphIndex}
              <button
                type="button"
                aria-label={`Remove ${c.title}`}
                onClick={() => remove(c.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        placeholder="Search paragraphs to add as expected…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (query.trim() || loading) && (
        <div
          className="panel"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 20,
            padding: 6,
          }}
        >
          {loading && <div className="muted" style={{ padding: 6 }}>Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="muted" style={{ padding: 6 }}>No matches.</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="secondary"
              onClick={() => add(c)}
              disabled={selectedIds.has(c.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 4,
                whiteSpace: "normal",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {c.title} #p{c.paragraphIndex}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {c.snippet}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
