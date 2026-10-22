import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { routedFetch, serverBase, sessionKey } from './serverAddress';

/**
 * Browser Supabase client. The publishable key is RLS-guarded and safe to ship
 * (the same key that ships in the mobile app.json) — overridable via .env for other
 * environments. Owner reads are scoped by RLS to their own gym; this app never holds
 * the service-role/secret key.
 */
const direct = import.meta.env.VITE_SUPABASE_URL ?? 'https://hdxzqbdiokjklnypfisq.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

let client: SupabaseClient | null = null;

/**
 * The link a gym logo or product photo is SAVED with (review of R-55, MUST-FIX): always Supabase's own
 * address, whatever address the client talks to. The server accepts only that host (0004, 0005, 0018),
 * and the member app loads it through our address anyway (mobile cloud/picture.ts).
 */
export function savedPictureUrl(bucket: string, path: string): string {
  return `${direct}/storage/v1/object/public/${bucket}/${path}`;
}

function real(): SupabaseClient {
  // R-55: our own address on our site (serverAddress.ts), the direct one anywhere else.
  const here = typeof location === 'undefined' ? null : location;
  const url = serverBase(here?.hostname, here?.origin, direct);
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: sessionKey(direct), // a desk signed in before the switch stays signed in
    },
    global: url === direct ? undefined : { fetch: routedFetch(url, direct, (...a) => fetch(...a)) },
  });
  return client;
}

/**
 * Made on first use, not when the file is imported (14 Oct 2026): creating the client starts its
 * realtime part, which needs a WebSocket, and Node 20 (CI) has none — so a test that only imported
 * a screen helper failed in CI while passing on Node 22 here. Methods are bound to the real client.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = real();
    const v = Reflect.get(c, prop, c) as unknown;
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
