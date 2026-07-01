/**
 * Paragraph chunking strategy.
 *
 * The spec calls for paragraph chunking. `toParagraphs` (in drive/store) already
 * splits documents on blank lines. Here we do light post-processing: merge very
 * short paragraphs into the next one, and hard-split any paragraph that is far
 * too long for a single embedding to represent well.
 */

const MIN_CHARS = 200; // merge paragraphs shorter than this
const MAX_CHARS = 2000; // split paragraphs longer than this

export interface Chunk {
  paragraphIndex: number;
  text: string;
}

export function chunkParagraphs(paragraphs: string[]): Chunk[] {
  // 1. Merge short fragments forward so headings/one-liners attach to context.
  const merged: string[] = [];
  let buffer = "";
  for (const p of paragraphs) {
    buffer = buffer ? `${buffer}\n\n${p}` : p;
    if (buffer.length >= MIN_CHARS) {
      merged.push(buffer);
      buffer = "";
    }
  }
  if (buffer) {
    if (merged.length && buffer.length < MIN_CHARS) {
      merged[merged.length - 1] += `\n\n${buffer}`;
    } else {
      merged.push(buffer);
    }
  }

  // 2. Split any over-long paragraph on sentence boundaries.
  const out: Chunk[] = [];
  let idx = 0;
  for (const para of merged) {
    if (para.length <= MAX_CHARS) {
      out.push({ paragraphIndex: idx++, text: para });
      continue;
    }
    const sentences = para.split(/(?<=[.!?])\s+/);
    let acc = "";
    for (const s of sentences) {
      if ((acc + " " + s).length > MAX_CHARS && acc) {
        out.push({ paragraphIndex: idx++, text: acc.trim() });
        acc = s;
      } else {
        acc = acc ? `${acc} ${s}` : s;
      }
    }
    if (acc.trim()) out.push({ paragraphIndex: idx++, text: acc.trim() });
  }

  return out;
}
