/**
 * Which start-up step failed (audit DS-08 / SH-11). The error screen words and the support
 * "Details" depend on it:
 *   'open'     the database file could not be opened at all
 *   'upgrade'  it opened, but a schema step (base tables, tracker or member columns) failed —
 *              the app must NOT open on a half-upgraded database
 *   'read'     it opened and upgraded, but the first read (is there a profile?) failed
 */
export type StartupStage = 'open' | 'upgrade' | 'read';

export class StartupError extends Error {
  readonly stage: StartupStage;
  readonly original: unknown;

  constructor(stage: StartupStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'StartupError';
    this.stage = stage;
    this.original = cause;
  }
}

/** Run one start-up step; any failure comes out tagged with its step (an already-tagged one keeps its tag). */
export async function startupStep<T>(stage: StartupStage, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw e instanceof StartupError ? e : new StartupError(stage, e);
  }
}
