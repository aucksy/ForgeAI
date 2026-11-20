#!/usr/bin/env node
// Lens 16 machine file. Plain Node, one process, seconds, exits. Run from the repo root AFTER test-index.mjs:
//   node docs/system-map/_tools/code-health.mjs   writes docs/system-map/_sources/machine/code-health.csv
// Rows (kind, path, line, note):
//   no-test-import   an app or server source file that no test file imports (test-index "imports"). A test may
//                    still reach it through another file, or by driving the screen: a lead to read, not a verdict.
//   test-no-assert   a test file with no expect / assert / toBe / assertVisible / RAISE / RESULT line at all.
//   test-skipped     a test file holding .skip( / xit( / xdescribe( / test.fixme(.
// Not made here (needs a type-aware tool): "functions never called". Lens 16 helpers write that item as
// could-not-check ("no call graph tool") unless they check it by search in their own area.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!fs.existsSync('docs/system-map/_sources/test-index.jsonl')) { console.error('run test-index.mjs first, from the repo root'); process.exit(2); }
const OUT = 'docs/system-map/_sources/machine/code-health.csv';
const idx = fs.readFileSync('docs/system-map/_sources/test-index.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const imported = new Set(idx.flatMap((o) => o.imports));
const files = execFileSync('git', ['ls-files'], { maxBuffer: 64e6 }).toString().split('\n').filter((p) =>
  /^(apps|deploy|packages|supabase\/functions)\//.test(p) && /\.(tsx?|jsx?|mjs|cjs)$/.test(p)
  && !/(^|\/)(test|tests|__tests__|e2e|e2e-live|qa|node_modules|dist|build|fixtures|stubs|scripts)\//.test(p) && !/\.(test|spec)\.|\.d\.ts$|\.min\.js$|config\.[cm]?[jt]s$/.test(p));
const rows = [['kind', 'path', 'line', 'note']];
let a = 0; let b = 0; let c = 0;
for (const f of files) if (!imported.has(f)) { rows.push(['no-test-import', f, 1, 'no test file imports it']); a++; }
for (const o of idx) {
  let t; try { t = fs.readFileSync(o.path, 'utf8'); } catch { continue; }
  if (!/expect\(|assert|toBe|toEqual|RAISE|RESULT|assertVisible|visible:|check\(/.test(t)) { rows.push(['test-no-assert', o.path, 1, o.kind]); b++; }
  const m = t.match(/\.(skip|fixme)\(|\bxit\(|\bxdescribe\(|@Ignore/);
  if (m) { rows.push(['test-skipped', o.path, t.slice(0, m.index).split('\n').length, m[0]]); c++; }
}
fs.mkdirSync('docs/system-map/_sources/machine', { recursive: true });
fs.writeFileSync(OUT, rows.map((r) => r.join(',')).join('\n') + '\n');
console.log(`${OUT}: ${a} source files no test imports (of ${files.length}); ${b} tests with no assert; ${c} tests with a skip`);
