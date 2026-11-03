/**
 * Whether the gym server has 0051 (workout of the day + video links). Asks once per page (owner_gym_wods);
 * 'no' (an older server, a browser-only gym, the demo) keeps both features hidden, exactly as before.
 */
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import * as wodApi from '../../shop/wodApi';

export function useWodServer(): wodApi.WodServer {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [server, setServer] = useState<wodApi.WodServer>(() => (key ? wodApi.wodServer() : 'no'));
  useEffect(() => {
    if (!key) {
      setServer('no');
      return undefined;
    }
    if (wodApi.wodServer() !== 'unknown') {
      setServer(wodApi.wodServer());
      return undefined;
    }
    let alive = true;
    wodApi
      .getWods(key)
      .then((a) => {
        if (alive) setServer(a === 'missing' ? 'no' : 'yes');
      })
      .catch((e: unknown) => {
        // A failed read (offline) is not remembered: the features stay hidden on this screen only.
        console.warn('[ForgeErr] workout of the day: could not ask the server', e);
        if (alive) setServer('no');
      });
    return () => {
      alive = false;
    };
  }, [key]);
  return server;
}
