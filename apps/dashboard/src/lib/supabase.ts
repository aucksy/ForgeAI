import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client. The publishable key is RLS-guarded and safe to ship
 * (the same key that ships in the mobile app.json) — overridable via .env for other
 * environments. Owner reads are scoped by RLS to their own gym; this app never holds
 * the service-role/secret key.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://hdxzqbdiokjklnypfisq.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
