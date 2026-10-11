/**
 * Phone test run 38144864717 (part G): a screen whose read failed (even after `readWithRetry`)
 * reads again by itself — when the app comes back to the front, and after the next save — instead
 * of staying on "Couldn't load …" until the member taps Try again. Does nothing while the screen's
 * reads are fine.
 *
 *   useRereadWhenFailed(loadFailed, reload);
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { onWriteDone } from '@/db/writeQueue';

export function useRereadWhenFailed(failed: boolean, reread: () => void): void {
  const again = useRef(reread);
  again.current = reread;

  useEffect(() => {
    if (!failed) return undefined;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') again.current();
    });
    const stop = onWriteDone(() => again.current());
    return () => {
      sub.remove();
      stop();
    };
  }, [failed]);
}
