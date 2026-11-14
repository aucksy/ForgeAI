/**
 * R-540 (owner, 14 Nov 2026: "enough data so all the functionalities can be shown"): the slot for the demo gym's
 * pretend gym server (crm/demo/demoServer.ts), held in the page's memory. Only the demo page (crm/demo/DemoApp.tsx)
 * fills it, after lib/demoLock.ts locked the page; every reader also checks `isDemoLocked()`, so a real gym never
 * reaches it. Kept apart from demoLock.ts (no imports) so the many tests that mock demoLock are unchanged.
 */

export interface DemoServer {
  /** Answers one gym server call the way the server would; throws a refusal the way it would. */
  answer(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** The pretend signed-in session (shop/cloudGym.ts CloudGym). */
  session(): unknown;
}

/** The code in the message of a change the demo turns away (shop/logic.ts maps it to the demo's words). */
export const DEMO_REFUSED = 'DEMO_REFUSED';

let server: DemoServer | null = null;

/** The demo page puts its pretend server in (null takes it out). */
export function serveDemo(s: DemoServer | null): void {
  server = s;
}

/** The demo's pretend server, or null. Callers check `isDemoLocked()` first. */
export function demoServer(): DemoServer | null {
  return server;
}
