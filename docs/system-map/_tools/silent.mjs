#!/usr/bin/env node
// Hunt 8, script part: every catch block and every fallback value, with flags. Plain Node, one process, seconds, exits.
//   node docs/system-map/_tools/silent.mjs      (run from the repo root) writes docs/system-map/_sources/silent.csv
// Columns: kind (catch | fallback), file, line, logs, tells_user, rethrows, text (first 90 characters, commas removed)
//   catch: a try/catch block, a .catch( handler, or a Kotlin catch. logs = calls a log, report or crash function
//          inside; tells_user = sets an error state, toast or alert inside; rethrows = throw / reject / return a
//          failed result inside. The flags are found by WORDS; a helper confirms each row it reads.
//   fallback: "?? null", "?? 0", "?? []", "?? ''", "|| []", "|| 0", "|| ''" (the three flags are "-").
// Hunt 8 helpers read ONLY catch rows with logs=no, tells_user=no, rethrows=no, plus the fallback rows of the
// files their brief names. Every other row is counted in the grid as "filtered by script, N rows, not read".
// Scanned: the app and server code (apps, deploy, packages, supabase/functions), never tests, qa, node_modules or docs.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!fs.existsSync('docs/system-map/_tools')) { console.error('run me from the repo root'); process.exit(2); }
const OUT = 'docs/system-map/_sources/silent.csv';
const files = execFileSync('git', ['ls-files'], { maxBuffer: 64e6 }).toString().split('\n').filter((p) =>
  /^(apps|deploy|packages|supabase\/functions)\//.test(p) && /\.(tsx?|jsx?|mjs|cjs|kt)$/.test(p)
  && !/(^|\/)(test|tests|__tests__|e2e|e2e-live|qa|node_modules|dist|build|fixtures|stubs)\//.test(p) && !/\.(test|spec)\.|\.d\.ts$|\.min\.js$/.test(p));

const LOG = /console\.(error|warn|log|info)|\blog[A-Z]?\w*\(|\breport\w*\(|Sentry|crash\w*\(|captureException|recordException|Log\.[ewid]\(|\bwarn\(|logError|track\w*\(/;
const USER = /set\w*(Error|Err|Status|Message|Msg|Failed|Fail|Problem|Toast|Notice|Banner)\w*\(|toast|Toast|Alert\.alert|\balert\(|showError|showMessage|notify\w*\(|snackbar|Snackbar|error:\s*['"`]|res\.status\(|new Response\(|json\(\s*\{\s*(ok:\s*false|error)/;
const RETHROW = /\bthrow\b|reject\(|return\s+(false|null|\{\s*ok:\s*false|Result\.failure|err)|Promise\.reject/;
const rows = [['kind', 'file', 'line', 'logs', 'tells_user', 'rethrows', 'text']];
const yn = (b) => (b ? 'yes' : 'no');
const clean = (s) => s.replace(/\s+/g, ' ').replace(/[",]/g, ' ').trim().slice(0, 90);

function body(t, from) {
  // from = index of the first "{" (or "(" of .catch). Returns the text up to the matching close, at most 4,000 chars.
  const open = t[from]; const close = open === '{' ? '}' : ')';
  let d = 0;
  for (let i = from; i < Math.min(t.length, from + 4000); i++) {
    const c = t[i];
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return t.slice(from, i + 1); }
  }
  return t.slice(from, from + 4000);
}
let catches = 0; let silent = 0; let fallbacks = 0;
for (const f of files) {
  let t;
  try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const lineAt = (i) => t.slice(0, i).split('\n').length;
  for (const m of t.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{|\.catch\(\s*/g)) {
    const isPromise = m[0].startsWith('.');
    const start = isPromise ? m.index + m[0].indexOf('(') : m.index + m[0].length - 1;
    const b = body(t, start);
    const l = LOG.test(b); const u = USER.test(b); const r = RETHROW.test(b);
    catches++; if (!l && !u && !r) silent++;
    rows.push(['catch', f, lineAt(m.index), yn(l), yn(u), yn(r), clean(b)]);
  }
  for (const m of t.matchAll(/(\?\?|\|\|)\s*(null|0|\[\]|''|""|``)(?![\w.])/g)) {
    if (m[1] === '||' && m[2] === 'null') continue;
    fallbacks++;
    const ls = t.lastIndexOf('\n', m.index) + 1; const le = t.indexOf('\n', m.index);
    rows.push(['fallback', f, lineAt(m.index), '-', '-', '-', clean(t.slice(ls, le < 0 ? undefined : le))]);
  }
}
fs.writeFileSync(OUT, rows.map((r) => r.join(',')).join('\n') + '\n');
console.log(`${OUT}: ${files.length} files; ${catches} catch blocks, ${silent} with no log, no user message and no rethrow; ${fallbacks} fallback values`);
