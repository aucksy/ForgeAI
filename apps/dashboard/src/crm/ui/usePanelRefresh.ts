/**
 * R-561: a page part that reads its own list joins the top bar's Refresh (logic/panelRefresh.ts) while it is on screen.
 * `read` may change on every draw; the latest one is used.
 */
import { useEffect, useRef } from 'react';

import { onPanelRefresh, type RefreshPart } from '../logic/panelRefresh';

export function usePanelRefresh(read: RefreshPart, on = true): void {
  const ref = useRef(read);
  ref.current = read;
  useEffect(() => {
    if (!on) return undefined;
    return onPanelRefresh(() => ref.current());
  }, [on]);
}
