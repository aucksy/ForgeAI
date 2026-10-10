import { useCallback, useEffect, useRef, useState } from 'react';

import { getProgressTop, type ProgressTop } from '@/tracker/services/progressTop';

export interface ProgressTopState {
  /** null until the first read answers. */
  top: ProgressTop | null;
  /** The read failed and nothing true is on screen. */
  failed: boolean;
  retry: () => void;
}

/**
 * The top of Progress (audit Phase 5): re-read every time Progress comes into view
 * (`focusKey`), so a workout finished, edited or deleted elsewhere shows at once (PG-01). The
 * old numbers stay on screen while the new ones load; a failed re-read keeps them.
 */
export function useProgressTop(focusKey: number): ProgressTopState {
  const [top, setTop] = useState<ProgressTop | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    if (focusKey <= 0) return;
    const id = ++req.current;
    getProgressTop()
      .then((t) => {
        if (req.current !== id) return;
        setTop(t);
        setFailed(false);
      })
      .catch(() => {
        if (req.current === id) setFailed(true);
      });
  }, [focusKey, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { top, failed: failed && top == null, retry };
}
