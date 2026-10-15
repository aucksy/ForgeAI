// Promise ratchet (audit toolkit pick 4, 15 Oct 2026). Runs the type-aware ESLint config
// (eslint.config.mjs: promises nobody awaits or catches, async handlers whose rejection is dropped,
// empty catch blocks) and fails when a workspace has MORE findings than promise_baseline.json.
// Fewer passes, with a line asking for the baseline to be lowered.
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { ESLint } from 'eslint';

const RULES = new Set(['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-misused-promises', 'no-empty']);
const baseline = JSON.parse(readFileSync(new URL('./promise_baseline.json', import.meta.url), 'utf8'));
const eslint = new ESLint();
const results = await eslint.lintFiles(['apps/mobile/src', 'apps/dashboard/src']);

const count = { mobile: 0, dashboard: 0 };
const found = { mobile: [], dashboard: [] };
for (const r of results) {
  const file = r.filePath.split(sep).join('/');
  const ws = file.includes('/apps/mobile/') ? 'mobile' : 'dashboard';
  for (const m of r.messages) {
    if (m.fatal) {
      console.log(`PARSE ${r.filePath}:${m.line} ${m.message}`);
      process.exitCode = 1;
    }
    if (!RULES.has(m.ruleId)) continue;
    count[ws] += 1;
    found[ws].push(`${file.split('/apps/')[1]}:${m.line} ${m.ruleId.split('/').pop()}`);
  }
}
for (const ws of ['mobile', 'dashboard']) {
  const was = baseline[ws];
  if (count[ws] > was) {
    console.log(`FAIL ${ws}: ${count[ws]} promise findings (baseline ${was}). Await it, add .catch that logs, or wrap as () => void f():`);
    for (const f of found[ws]) console.log(`  ${f}`);
    process.exitCode = 1;
  } else if (count[ws] < was) {
    console.log(`${ws}: ${count[ws]} promise findings, below the baseline ${was} — lower it in scripts/ci/promise_baseline.json.`);
  } else {
    console.log(`${ws}: ${count[ws]} promise findings (= baseline).`);
  }
}
