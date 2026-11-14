/**
 * R-513 Join online: is the gym's "Become a member" page working? Every way in (the share button, the join link, the
 * poster) stays hidden until the gym server answers self_join_preview (supabase 0077) for this gym, open and with a
 * plan to pick. Before 0077 is applied, when the gym is paused, or with no internet, nothing shows, so no one is
 * handed a link that does not work. One question per gym code per page load.
 */
import { useEffect, useState } from 'react';

import { call } from './api';

/** The server's answer, read as "the page works for this gym". */
export function selfJoinOpen(answer: unknown): boolean {
  if (!answer || typeof answer !== 'object') return false;
  const a = answer as { gymName?: unknown; closed?: unknown; plans?: unknown };
  return typeof a.gymName === 'string' && a.closed === false && Array.isArray(a.plans) && a.plans.length > 0;
}

const asked = new Map<string, Promise<boolean>>();

export function selfJoinReady(joinCode: string): Promise<boolean> {
  const code = joinCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return Promise.resolve(false);
  let p = asked.get(code);
  if (!p) {
    p = call<unknown>('self_join_preview', { p_code: code }).then(
      selfJoinOpen,
      // quiet: a server without 0077 (PGRST202), no internet or a slow answer all mean "not yet": the entry points stay hidden.
      () => {
        asked.delete(code);
        return false;
      },
    );
    asked.set(code, p);
  }
  return p;
}

export function useSelfJoinReady(joinCode: string | null | undefined): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    setReady(false);
    if (joinCode) void selfJoinReady(joinCode).then((ok) => live && setReady(ok));
    return () => {
      live = false;
    };
  }, [joinCode]);
  return ready;
}
