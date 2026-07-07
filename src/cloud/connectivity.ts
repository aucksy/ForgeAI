import NetInfo from '@react-native-community/netinfo';

import { drainOutbox } from '@/cloud/outbox';
import { isCloudActive } from '@/cloud/session';

/**
 * Drain the outbox when the network comes back. Registered once at launch
 * (gated internally on a linked gym, so the offline demo does nothing).
 */
let unsubscribe: (() => void) | null = null;

export function startConnectivityWatch(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    // `isInternetReachable === null` means "unknown" — wait; don't push yet.
    if (state.isInternetReachable !== true) return;
    void (async () => {
      if (!(await isCloudActive())) return;
      try {
        await drainOutbox();
      } catch {
        // best-effort; the next reconnect retries
      }
    })();
  });
}

export function stopConnectivityWatch(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
