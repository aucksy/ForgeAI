// MettleUp "gate": the address eSSL / ZKTeco entry machines call (F103 / T77 step 1, owner request R-378).
// NOT DEPLOYED. Nothing here is live until the owner says yes; then, from this folder: npx wrangler deploy
//
// Thin on purpose: every rule is in apps/dashboard/src/crm/machines (pure TypeScript, tested with a
// pretend machine in apps/dashboard/test/crm/machines). This file only hands each request to the handler
// with the gym-server store.
//
// Why its own Worker and sub-domain: ADMS machines call the ROOT path /iclock/..., and many speak only
// plain HTTP on port 80 (no HTTPS on most firmware). So the sub-domain must answer plain HTTP: Cloudflare's
// "Always Use HTTPS" must be OFF for this host only (a Configuration Rule), and no HSTS header is sent here.
// Machines send no password, only a serial number: only serials registered to a gym are listened to
// (supabase migration 0058, gate_machine).
//
// Secret (never in a file; `npx wrangler secret put SUPABASE_GATE_KEY` from this folder):
//   SUPABASE_GATE_KEY   a Supabase secret key named "gate" (Project Settings -> API Keys -> Secret keys).
//                       Only the gate_* functions take it.

import { handleDeviceFetch } from '../../apps/dashboard/src/crm/machines/handler';
import { SupabaseStore, type GateEnv } from '../../apps/dashboard/src/crm/machines/supabaseStore';

export default {
  async fetch(request: Request, env: GateEnv): Promise<Response> {
    const path = new URL(request.url).pathname.toLowerCase();
    if (!path.startsWith('/iclock/')) {
      return new Response('MettleUp entry machines. Nothing to see here.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' },
      });
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_GATE_KEY) {
      console.error('[gate] SUPABASE_GATE_KEY is not set: every machine is told ERROR and keeps its punches');
      return new Response('ERROR', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return handleDeviceFetch(request, new SupabaseStore(env), Date.now());
  },
};
