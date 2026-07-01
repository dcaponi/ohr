"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { DriveDocContent } from "../../_components/types";

export default function DriveDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [content, setContent] = useState<DriveDocContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/drive/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setContent(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  return (
    <div className="container">
      <p style={{ marginTop: 0 }}>
        <Link href="/drive">← Drive</Link>
      </p>

      {error && <div style={{ color: "var(--danger)" }}>Error: {error}</div>}
      {!content && !error && <div className="muted">Loading…</div>}

      {content && (
        <>
          <h1 style={{ marginTop: 0 }}>{content.file.name}</h1>
          <div
            className="muted"
            style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}
          >
            <span>version {content.file.version}</span>
            <span>{content.file.type}</span>
            {content.file.sourceUrl && (
              <a href={content.file.sourceUrl} target="_blank" rel="noreferrer">
                Source ↗
              </a>
            )}
          </div>

          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {content.paragraphs.length === 0 && (
              <div className="muted">No content.</div>
            )}
            {content.paragraphs.map((p, i) => (
              <p key={i} id={`p${i}`} style={{ margin: 0, scrollMarginTop: 76 }}>
                {p}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
