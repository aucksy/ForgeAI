import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static SPA — Cloudflare Pages serves dist/, the browser talks to Supabase directly
// (RLS-scoped owner reads). No SSR (read-mostly, authenticated, no SEO).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
});
