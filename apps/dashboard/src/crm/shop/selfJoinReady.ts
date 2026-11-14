/**
 * R-513 Join online: is the gym's "Become a member" page working? Every way in (the share button, the join link, the
 * poster) stays hidden until the gym server answers self_join_preview (supabase 0077) for this gym, open and with a
 * plan to pick. Before 0077 is applied, when the gym is paused, or with no internet, nothing shows, so no one is
 * handed a link that does not work. One question per gym code per page load.
 *
 * F210: the same answer says whether the gym server has the free trial (supabase 0088): an open gym's answer then always
 * carries the key `trial` (null while it is off). Without that key nothing about trials shows in the admin app.
 */
import { useEffect, useState } from 'react';

import { call } from './api';

/** The server's answer, read as "the page works for this gym". */
export function selfJoinOpen(answer: unknown): boolean {
  if (!answer || typeof answer !== 'object') return false;
  const a = answer as { gymName?: unknown; closed?: unknown; plans?: unknown };
  return typeof a.gymName === 'string' && a.closed === false && Array.isArray(a.plans) && a.plans.length > 0;
}

/** F210: does this answer come from a gym server with 0088 (the free trial)? An open gym with the `trial` key. PURE. */
export function joinTrialServer(answer: unknown): boolean {
  return selfJoinOpen(answer) && Object.prototype.hasOwnProperty.call(answer, 'trial');
}

const asked = new Map<string, Promise<unknown>>();

/** The server's preview for this gym code (null when it cannot be read): asked once per code per page load. */
function previewFor(joinCode: string): Promise<unknown> {
  const code = joinCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return Promise.resolve(null);
  let p = asked.get(code);
  if (!p) {
    p = call<unknown>('self_join_preview', { p_code: code }).then(
      (a) => a,
      // quiet: a server without 0077 (PGRST202), no internet or a slow answer all mean "not yet": the entry points stay hidden.
      () => {
        asked.delete(code);
        return null;
      },
    );
    asked.set(code, p);
  }
  return p;
}

export function selfJoinReady(joinCode: string): Promise<boolean> {
  return previewFor(joinCode).then(selfJoinOpen);
}

/** F210: true once the gym server has 0088 and this gym's join page works (a trial needs the page). */
export function joinTrialReady(joinCode: string): Promise<boolean> {
  return previewFor(joinCode).then(joinTrialServer);
}

export function useJoinTrialReady(joinCode: string | null | undefined): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    setReady(false);
    if (joinCode) void joinTrialReady(joinCode).then((ok) => live && setReady(ok));
    return () => {
      live = false;
    };
  }, [joinCode]);
  return ready;
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
