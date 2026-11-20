#!/usr/bin/env node
// Step A8, script part: the test index. Plain Node, no dependencies, one process, seconds, exits. Audit tooling only.
//   node docs/system-map/_tools/test-index.mjs      (run from the repo root) writes docs/system-map/_sources/test-index.jsonl
// One line per test FILE (a file's test names are in "title"):
//   {path, kind (unit | e2e | maestro | db | watch | native), title[] (describe/it/test names, flow comment, SQL
//    comment, Kotlin test names; first 30), opens[] (page.goto routes, maestro runFlow files; first 20),
//    imports[] (repo paths the test imports, resolved; first 30), asserts[] (strings it checks: getByText,
//    toContain, toBe, toHaveText, assertVisible, visible:, RAISE ...; first 20), area (its folder),
//    workflows[] (workflows whose text, or a script they call, names the file, its folder or its runner;
//    "by-glob" = found only through a folder or npm test glob; a guess to confirm by opening the workflow)}
// The index finds CANDIDATES only. A8 helpers still open each candidate test and read what it checks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd().replace(/\\/g, '/');
const OUT = 'docs/system-map/_sources/test-index.jsonl';
if (!fs.existsSync('docs/system-map/_tools')) { console.error('run me from the repo root'); process.exit(2); }
const files = execFileSync('git', ['ls-files'], { maxBuffer: 64e6 }).toString().split('\n').filter(Boolean);
const all = new Set(files);

function kindOf(p) {
  if (p.includes('node_modules/') || p.startsWith('docs/')) return null;
  if (/^supabase\/tests\/.+\.sql$/.test(p)) return 'db';
  if (/^apps\/mobile\/qa\/[^/]+\.ya?ml$/.test(p)) return 'maestro';
  if (/^apps\/dashboard\/e2e\/.+\.(spec|test)\.[cm]?[jt]sx?$/.test(p)) return 'e2e';
  if (/\/src\/test\/.+Test\.kt$/.test(p)) return p.includes('/wear/') ? 'watch' : 'native';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p)) return 'unit';
  return null;
}
const tests = files.filter(kindOf);

// workflow text = the workflow file + every script file it names (one level)
const wf = files.filter((p) => /^\.github\/workflows\/.+\.ya?ml$/.test(p));
const wfText = new Map();
for (const w of wf) {
  let t = fs.readFileSync(w, 'utf8');
  for (const m of t.matchAll(/([A-Za-z0-9_./-]+\.(?:sh|py|mjs|js|cjs))/g)) {
    const s = m[1].replace(/^\.\//, '');
    for (const c of [s, 'apps/mobile/' + s, 'apps/dashboard/' + s]) if (all.has(c)) { t += '\n' + fs.readFileSync(c, 'utf8'); break; }
  }
  wfText.set(path.basename(w), t);
}
function workflowsOf(p, kind) {
  const base = path.basename(p);
  const stem = base.replace(/\.(test|spec)?\.?[cm]?[jt]sx?$|\.ya?ml$|\.sql$|\.kt$/g, '');
  const dir = path.dirname(p);
  const hit = [];
  for (const [w, t] of wfText) {
    if (t.includes(base) || (stem.length > 4 && new RegExp('[/"\' ]' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[."\' ]').test(t))) hit.push(w);
    else if (t.includes(dir + '/') || t.includes(dir + '"') || t.includes(dir + ' ')) hit.push(w + ' (by-glob)');
    else if (kind === 'unit' && /apps\/(mobile|dashboard)/.test(p) && /npm (run )?test|npx jest|vitest/.test(t) && t.includes(p.split('/').slice(0, 2).join('/'))) hit.push(w + ' (by-glob)');
  }
  return hit.length ? hit : ['unknown'];
}

const take = (re, t, n) => { const o = []; for (const m of t.matchAll(re)) { const v = (m[1] ?? m[2] ?? m[3] ?? '').trim(); if (v && !o.includes(v)) o.push(v.slice(0, 120)); if (o.length >= n) break; } return o; };
const Q = String.raw`(?:'([^'\n]{1,200})'|"([^"\n]{1,200})"|\x60([^\x60\n]{1,200})\x60)`;
// "@/x" = <app>/src/x (both apps use it); a quoted file path the test reads (readFileSync) also counts
function resolveImport(from, spec) {
  const app = (from.match(/^apps\/[^/]+/) || [''])[0];
  let base;
  if (spec.startsWith('@/') && app) base = app + '/src/' + spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (/^(src|app|apps|deploy|supabase|scripts|android|modules|public)\//.test(spec)) base = all.has(spec) ? spec : app + '/' + spec;
  else return null;
  for (const c of [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((e) => base + e), ...['/index.ts', '/index.tsx', '/index.js'].map((e) => base + e)]) if (all.has(c)) return c;
  return null;
}

const out = [];
for (const p of tests) {
  const kind = kindOf(p);
  let t;
  try { t = fs.readFileSync(p, 'utf8'); } catch { continue; }
  let title = [], opens = [], imports = [], asserts = [];
  if (kind === 'unit' || kind === 'e2e') {
    title = take(new RegExp(String.raw`\b(?:describe|it|test)(?:\.(?:only|skip|each\([^)]*\)))?\(\s*` + Q, 'g'), t, 30);
    opens = take(new RegExp(String.raw`\.goto\(\s*` + Q, 'g'), t, 20);
    for (const m of t.matchAll(/(?:from\s+|require\(\s*|import\(\s*|mock\(\s*)['"]([^'"]+)['"]|['"]((?:\.\.?\/|src\/|app\/|deploy\/|supabase\/|public\/)[^'"\s]+\.(?:tsx?|jsx?|mjs|sql|html|kt))['"]/g)) { const r = resolveImport(p, m[1] ?? m[2]); if (r && !imports.includes(r)) imports.push(r); if (imports.length >= 30) break; }
    asserts = take(new RegExp(String.raw`(?:getByText|getByRole\([^,]+,\s*\{\s*name:|getByLabel|getByPlaceholder|findByText|queryByText|toContain|toHaveText|toContainText|toBe|toEqual|toMatch|assert\.(?:equal|match|ok)\([^,]*,)\(?\s*` + Q, 'g'), t, 20);
  } else if (kind === 'maestro') {
    title = t.split(/\r?\n/).filter((l) => l.startsWith('#')).slice(0, 3).map((l) => l.replace(/^#\s*/, '').slice(0, 160));
    opens = take(/runFlow:\s*\n?\s*(?:file:\s*)?([A-Za-z0-9_./-]+\.ya?ml)/g, t, 20);
    asserts = take(/(?:assertVisible|assertNotVisible|visible|notVisible|text):\s*"([^"\n]+)"/g, t, 20);
  } else if (kind === 'db') {
    title = t.split(/\r?\n/).filter((l) => l.startsWith('--')).slice(0, 2).map((l) => l.replace(/^--\s*/, '').slice(0, 160));
    asserts = take(/--\s*(\d+[a-z]?\.\s[^\n]{4,140})/g, t, 20);
    opens = take(/\bpublic\.([a-z_][a-z0-9_]*)\s*\(/g, t, 20);
  } else {
    title = take(/fun\s+`([^`]+)`|@Test\s+fun\s+([A-Za-z0-9_]+)/g, t, 30);
    asserts = take(/assert\w*\(\s*"([^"\n]+)"/g, t, 20);
  }
  out.push({ path: p, kind, title, opens, imports, asserts, area: path.dirname(p), workflows: workflowsOf(p, kind) });
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
const byKind = {};
for (const o of out) byKind[o.kind] = (byKind[o.kind] || 0) + 1;
console.log(`${OUT}: ${out.length} test files ${JSON.stringify(byKind)}; ${out.filter((o) => o.workflows[0] === 'unknown').length} with no workflow found`);
