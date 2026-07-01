"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DriveDocType, DriveFile } from "../_components/types";

const TYPE_LABEL: Record<DriveDocType, string> = {
  paper: "paper",
  sop: "sop",
  shark: "shark",
};

const TYPE_COLOR: Record<DriveDocType, string> = {
  paper: "var(--accent)",
  sop: "var(--accent-2)",
  shark: "var(--danger)",
};

function TypeBadge({ type }: { type: DriveDocType }) {
  return (
    <span
      className="tag"
      style={{
        color: TYPE_COLOR[type] ?? "var(--text)",
        borderColor: TYPE_COLOR[type] ?? "var(--border)",
        fontSize: 12,
      }}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function DrivePage() {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DriveDocType>("all");

  useEffect(() => {
    fetch("/api/drive")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setFiles(data.files ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const filtered = useMemo(() => {
    if (!files) return [];
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) =>
        (typeFilter === "all" || f.type === typeFilter) &&
        (!q || f.name.toLowerCase().includes(q)),
    );
  }, [files, query, typeFilter]);

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>Drive</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Mock Google Drive — the source corpus behind the index.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          placeholder="Filter by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | DriveDocType)}
          style={{ maxWidth: 160 }}
        >
          <option value="all">All types</option>
          <option value="paper">Papers</option>
          <option value="sop">SOPs</option>
          <option value="shark">Sharks</option>
        </select>
      </div>

      {error && <div style={{ color: "var(--danger)" }}>Error: {error}</div>}
      {!files && !error && <div className="muted">Loading…</div>}
      {files && filtered.length === 0 && (
        <div className="muted">No files match.</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {filtered.map((f) => (
          <Link
            key={f.id}
            href={`/drive/${f.id}`}
            className="panel"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              color: "var(--text)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <TypeBadge type={f.type} />
              <span className="muted" style={{ fontSize: 12 }}>
                v{f.version}
              </span>
            </div>
            <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{f.name}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: "auto" }}>
              {formatTime(f.modifiedTime)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
