import { drainOutbox, enqueueSummary } from '@/cloud/outbox';
import { isCloudActive } from '@/cloud/session';
import { isDemoData } from '@/onboarding/db/dataActions';

/**
 * The single push trigger. Called (fire-and-forget) after any data mutation via
 * dashboardStore.refresh. No-op unless a gym is linked, so the offline app pays
 * nothing. Serialised so overlapping refreshes don't double-push.
 */
let inFlight = false;

export async function maybeSync(): Promise<void> {
  if (inFlight) return;
  if (!(await isCloudActive())) return;
  // Phase O2: demo data must never reach a real gym's dashboard. Loading the demo
  // on a gym-linked phone (a sales pitch on the owner's own device) would otherwise
  // push Arjun's invented 13 weeks up under the member's real name.
  if (await isDemoData()) return;
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
