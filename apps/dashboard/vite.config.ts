import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static SPA — Cloudflare serves dist/, the browser talks to Supabase directly
// (RLS-scoped owner reads). No SSR (read-mostly, authenticated, no SEO).

/** The panel's security policy, read from public/_headers (launch A6), so `vite preview` — and with
 *  it every admin-app journey — runs under the same rule as the live site. */
function livePolicy(): Record<string, string> {
  const m = /^\s+Content-Security-Policy: (.+)$/m.exec(readFileSync(new URL('./public/_headers', import.meta.url), 'utf8'));
  if (!m) throw new Error('public/_headers has no Content-Security-Policy line');
  return { 'Content-Security-Policy': m[1].trim() };
}

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  preview: {
    headers: livePolicy(),
    // Live journeys only (e2e-live/live.config.mjs sets XJ_API_PROXY): /api goes to the real panel
    // Worker, so XJ7 runs a real AI column match against the live site (#47).
    proxy: process.env.XJ_API_PROXY ? { '/api': { target: process.env.XJ_API_PROXY, changeOrigin: true } } : undefined,
  },
});
