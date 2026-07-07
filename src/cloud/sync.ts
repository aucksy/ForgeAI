import { drainOutbox, enqueueSummary } from '@/cloud/outbox';
import { isCloudActive } from '@/cloud/session';

/**
 * The single push trigger. Called (fire-and-forget) after any data mutation via
 * dashboardStore.refresh. No-op unless a gym is linked, so the offline demo pays
 * nothing. Serialised so overlapping refreshes don't double-push.
 */
let inFlight = false;

export async function maybeSync(): Promise<void> {
  if (inFlight) return;
  if (!(await isCloudActive())) return;
  inFlight = true;
  try {
    await enqueueSummary();
    await drainOutbox();
  } catch {
    // Push is best-effort; never surface to the UI (offline demo must be seamless).
  } finally {
    inFlight = false;
  }
}
