import fs from "node:fs/promises";
import path from "node:path";

/**
 * Mock Google Drive.
 *
 * The "Drive" is a manifest (docs/drive-manifest.json) listing every corpus
 * file plus the actual content on disk under docs/. Each file has a `version`;
 * simulating an edit bumps the version and (optionally) rewrites content, which
 * is exactly what the freshness scan looks for.
 *
 * Content sources:
 *   - papers: real arxiv PDFs (docs/papers/*.pdf), text extracted via pdf-parse
 *   - sops/sharks: authored markdown (docs/sops/*.md, docs/sharks/*.md)
 */

export type DriveDocType = "paper" | "sop" | "shark";

export interface DriveFile {
  /** Stable id shared with the DB (documents.drive_file_id), e.g. "paper-0001". */
  id: string;
  name: string;
  type: DriveDocType;
  version: number;
  /** External canonical URL (arxiv abs page) or "" for internal-only docs. */
  sourceUrl: string;
  /** Content path relative to the repo root, e.g. "docs/papers/paper-0001.pdf". */
  contentPath: string;
  /** ISO timestamp of the last (simulated) modification. */
  modifiedTime: string;
}

export interface DriveDocContent {
  file: DriveFile;
  /** Paragraph-level units of text used for chunking + indexing. */
  paragraphs: string[];
}

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "docs", "drive-manifest.json");

export async function listDriveFiles(): Promise<DriveFile[]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as DriveFile[];
  } catch {
    return [];
  }
}

export async function writeManifest(files: DriveFile[]): Promise<void> {
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(files, null, 2) + "\n");
}

export async function getDriveFile(id: string): Promise<DriveFile | undefined> {
  const files = await listDriveFiles();
  return files.find((f) => f.id === id);
}

/** Split raw text into clean paragraphs. Used for md/txt and extracted PDF text. */
export function toParagraphs(text: string): string[] {
  return text
    // Strip NUL and other C0 control chars (keep \n and \t) — extracted PDF
    // text often carries 0x00 bytes that Postgres text columns reject.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    // collapse single newlines inside a paragraph, keep blank-line breaks
    .split(/\n{2,}/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    // drop markdown headings-only lines? keep them but drop empties & tiny frags
    .filter((p) => p.length >= 40);
}

/** Extract text from a PDF buffer. Kept dynamic so pdf-parse stays server-only. */
async function extractPdf(buf: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdf = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> })
    .default;
  const res = await withSuppressedPdfNoise(() => pdf(buf));
  return res.text;
}

/**
 * pdf.js (under pdf-parse) logs harmless font-parser warnings like
 * "Warning: TT: invalid function id: 136" / "undefined function: 32" straight to
 * console. pdf-parse@1.1.1 exposes no verbosity knob, so we temporarily filter
 * only those specific lines from console.log/warn while parsing. Indexing runs
 * documents sequentially, so there's no concurrent console patching.
 */
const PDF_NOISE = /invalid function id|undefined function|^Warning:\s*TT:/i;
async function withSuppressedPdfNoise<T>(fn: () => Promise<T>): Promise<T> {
  const origLog = console.log;
  const origWarn = console.warn;
  const filtered =
    (orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === "string" && PDF_NOISE.test(args[0])) return;
      orig(...args);
    };
  console.log = filtered(origLog) as typeof console.log;
  console.warn = filtered(origWarn) as typeof console.warn;
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

export async function getDriveContent(id: string): Promise<DriveDocContent> {
  const file = await getDriveFile(id);
  if (!file) throw new Error(`Drive file not found: ${id}`);

  const abs = path.join(ROOT, file.contentPath);
  let paragraphs: string[];

  if (file.contentPath.toLowerCase().endsWith(".pdf")) {
    const buf = await fs.readFile(abs);
    paragraphs = toParagraphs(await extractPdf(buf));
  } else {
    const text = await fs.readFile(abs, "utf8");
    paragraphs = toParagraphs(text);
  }

  return { file, paragraphs };
}

/**
 * Build the stored source link for a paragraph. Internal docs deep-link into
 * the mock Drive viewer; papers get an arxiv URL with a text-highlight fragment.
 */
export function paragraphLink(file: DriveFile, index: number, snippet?: string): string {
  if (file.sourceUrl) {
    if (snippet) {
      const frag = encodeURIComponent(
        snippet.split(/\s+/).slice(0, 8).join(" "),
      );
      return `${file.sourceUrl}#:~:text=${frag}`;
    }
    return file.sourceUrl;
  }
  return `/drive/${file.id}#p${index}`;
}

/**
 * Simulate a Google Docs edit: bump the version and optionally rewrite content.
 * The next freshness scan will detect the drift and re-index the document.
 */
export async function bumpDriveVersion(
  id: string,
  newContent?: string,
): Promise<DriveFile> {
  const files = await listDriveFiles();
  const idx = files.findIndex((f) => f.id === id);
  if (idx === -1) throw new Error(`Drive file not found: ${id}`);

  const file = files[idx];
  file.version += 1;
  file.modifiedTime = new Date().toISOString();

  if (newContent !== undefined && !file.contentPath.toLowerCase().endsWith(".pdf")) {
    await fs.writeFile(path.join(ROOT, file.contentPath), newContent);
  }

  files[idx] = file;
  await writeManifest(files);
  return file;
}
