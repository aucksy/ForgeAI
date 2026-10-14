import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client. The publishable key is RLS-guarded and safe to ship
 * (the same key that ships in the mobile app.json) — overridable via .env for other
 * environments. Owner reads are scoped by RLS to their own gym; this app never holds
 * the service-role/secret key.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://hdxzqbdiokjklnypfisq.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

let client: SupabaseClient | null = null;

function real(): SupabaseClient {
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
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
