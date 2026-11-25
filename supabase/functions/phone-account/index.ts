// F237 "Phone number sign-in also backs up workouts" (owner, 25 Nov 2026, R-627). Supabase Edge Function
// "phone-account", deployed with verify_jwt OFF: the caller is not signed in yet, and the WhatsApp proof is the check.
//
//   POST { proof, name }  ->  { ok: true, token_hash, fresh }  |  { error: OFF | BAD_PROOF | NO_NAME | ... }
//
// 1. phone_account_pick (migration 0099) checks the proof (signed by our panel Worker, 15 minutes, purpose 'member';
//    only LOOKED at, so the same proof still joins the gym) and says which account this number signs in to: its
//    made-up e-mail m-<code>@phone.mettleup.fit (no number in it), and whether it must be made (new number, or a
//    recycled number's fresh start: see 0099).
// 2. A new account is made here (e-mail confirmed, nothing is ever e-mailed; app_metadata via=phone + name_key).
// 3. A one-time sign-in link is made for it (admin generateLink: never sent anywhere). Only its hashed token goes back;
//    the app calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) and is signed in as that account.
//
// The service key is the function's own (SUPABASE_SERVICE_ROLE_KEY, set by Supabase); it never leaves the server.
// Rollback without a release: set the function's secret PHONE_ACCOUNT_ON=off -> every call says OFF, and the app
// behaves as 0.79.0 (phone sign-in to the gym still works; the backup card says it is off).
// Logs carry the outcome only: never the proof, the number, the name or the token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function answer(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer({ error: 'METHOD' }, 405);
  if ((Deno.env.get('PHONE_ACCOUNT_ON') ?? 'on').toLowerCase() === 'off') {
    console.log('[phone-account] off by the server switch');
    return answer({ error: 'OFF' });
  }

  let proof = '';
  let name = '';
  try {
    const b = (await req.json()) as { proof?: unknown; name?: unknown };
    proof = typeof b.proof === 'string' ? b.proof.slice(0, 400) : '';
    name = typeof b.name === 'string' ? b.name.slice(0, 60) : '';
  } catch {
    return answer({ error: 'BAD_REQUEST' }, 400);
  }
  if (!proof) return answer({ error: 'BAD_PROOF' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) {
    console.error('[phone-account] no server key');
    return answer({ error: 'NOT_READY' }, 500);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: pick, error: pickError } = await admin.rpc('phone_account_pick', { p_proof: proof, p_name: name });
  if (pickError || !pick) {
    console.error('[phone-account] pick failed', pickError?.message ?? 'no answer');
    return answer({ error: 'SERVER' }, 500);
  }
  const p = pick as { ok?: boolean; error?: string; email?: string; create?: boolean; name_key?: string; fresh?: boolean };
  if (!p.ok || !p.email) {
    console.log('[phone-account] refused', p.error ?? 'unknown');
    return answer({ error: p.error ?? 'BAD_PROOF' });
  }

  if (p.create) {
    const { error } = await admin.auth.admin.createUser({
      email: p.email,
      email_confirm: true,
      app_metadata: { via: 'phone', name_key: p.name_key ?? '' },
    });
    // Two taps at once: the second finds it made already. Anything else is a real failure.
    if (error && !/already|registered|exists/i.test(error.message)) {
      console.error('[phone-account] could not make the account', error.message);
      return answer({ error: 'SERVER' }, 500);
    }
    console.log(error ? '[phone-account] made already (two calls at once)' : '[phone-account] account made');
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: p.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[phone-account] no sign-in link', linkError?.message ?? 'no token');
    return answer({ error: 'SERVER' }, 500);
  }
  console.log(`[phone-account] signed in (${p.create ? 'new' : 'existing'} account${p.fresh ? ', fresh' : ''})`);
  return answer({ ok: true, token_hash: tokenHash, fresh: Boolean(p.fresh) });
});
