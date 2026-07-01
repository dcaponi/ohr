import { db, evals } from "@/db";
import { desc } from "drizzle-orm";
import { runEval } from "./run";

/**
 * Server-side background "run all" so a run survives the user navigating away.
 * State lives in the Node process; each eval's result is persisted to the DB as
 * it completes (runEval writes the row), so partial progress is durable even if
 * the process restarts. The client polls getRunAllState() for progress.
 *
 * Note: on a serverless host (e.g. Vercel) module state isn't shared across
 * instances and a background task after the response isn't guaranteed to finish;
 * this is intended for the long-lived local Node server. A queue/worker would be
 * the production-grade equivalent.
 */
export interface RunAllState {
  running: boolean;
  done: number;
  total: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

let state: RunAllState = {
  running: false,
  done: 0,
  total: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
};

const CONCURRENCY = 6;

export function getRunAllState(): RunAllState {
  return state;
}

/** Start a background run of every eval. No-op (returns current state) if one is already running. */
export async function startRunAll(): Promise<RunAllState> {
  if (state.running) return state;

  const rows = await db
    .select({ id: evals.id })
    .from(evals)
    .orderBy(desc(evals.createdAt));

  state = {
    running: true,
    done: 0,
    total: rows.length,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  };

  if (rows.length === 0) {
    state = { ...state, running: false, finishedAt: Date.now() };
    return state;
  }

  // Fire-and-forget: run in the background, persisting each result as it lands.
  void (async () => {
    let next = 0;
    const worker = async () => {
      while (next < rows.length) {
        const id = rows[next++].id;
        try {
          await runEval(id); // persists the row on completion
        } catch {
          /* leave this row as-is; keep going */
        }
        state.done++;
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker),
      );
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    } finally {
      state.running = false;
      state.finishedAt = Date.now();
    }
  })();

  return state;
}
