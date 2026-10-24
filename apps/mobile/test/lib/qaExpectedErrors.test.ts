/**
 * UAT WP4b (17 Oct 2026): the phone test's crash / JS-error scan (qa/qa_report.py scan) now knows
 * errors a part MAKES ON PURPOSE (a damaged database for the start-up error screen, a held write
 * lock and a full phone for a refused Finish). It must stay as strict as before everywhere else:
 *   - only a line in the injecting part's OWN log, matching that part's pattern, is "expected";
 *   - the same line in another part, or in the final logcat, still fails the run;
 *   - any other error in the injecting part still fails it;
 *   - a crash is never excused.
 * Runs the real script with python when this machine has one (CI's ubuntu does).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../../qa/qa_report.py');

function findPython(): string | null {
  for (const p of ['python3', 'python']) {
    const r = spawnSync(p, ['-c', 'print("ok")'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === 'ok') return p;
  }
  return null;
}
const PY = findPython();

const BOOT = '10-17 18:00:00.123  1234  1250 E ReactNativeJS: [boot] start-up failed: [Error: Call to function rejected.';
const CAUSE = '10-17 18:00:00.123  1234  1250 E ReactNativeJS: Caused by: file is not a database]';
const OTHER = '10-17 18:00:05.000  1234  1250 E ReactNativeJS: something else broke';
const CRASH = [
  '10-17 18:00:06.000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main',
  '10-17 18:00:06.000  1234  1234 E AndroidRuntime: Process: com.mettleup.app, PID: 1234',
].join('\n');

function scan(files: Record<string, string>, expected: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qa-expected-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(resolve(p, '..'), { recursive: true });
    writeFileSync(p, text + '\n');
  }
  writeFileSync(join(dir, 'expected-errors.txt'), expected);
  const r = spawnSync(PY as string, [SCRIPT, 'scan', dir], { encoding: 'utf8' });
  return { code: r.status ?? -1, out: r.stdout };
}

describe.runIf(PY != null)('qa_report scan: errors a part injects on purpose', () => {
  it('the injecting part\'s own matching error (all its lines) is expected, not a failure', () => {
    const r = scan({ 'part-ub2/x/device-logcat.txt': `${BOOT}\n${CAUSE}` }, 'UB2\tstart-up failed\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/EXPECTED: the error part UB2 made on purpose/);
    expect(r.out).toMatch(/scan: clean/);
  });

  it('the same line in ANOTHER part still fails', () => {
    const r = scan({ 'part-uf3/x/device-logcat.txt': BOOT }, 'UB2\tstart-up failed\n');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/JS ERROR \(UF3\)/);
  });

  it('the same line in the final logcat still fails', () => {
    const r = scan({ 'logcat.txt': BOOT }, 'UB2\tstart-up failed\n');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/JS ERROR \(final logcat\)/);
  });

  it('any OTHER error in the injecting part still fails', () => {
    const r = scan({ 'part-ub2/x/device-logcat.txt': `${BOOT}\n${OTHER}` }, 'UB2\tstart-up failed\n');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/JS ERROR \(UB2\): .*something else broke/);
  });

  it('a crash is never excused, even when it matches the pattern', () => {
    const r = scan({ 'part-ub2/x/device-logcat.txt': CRASH }, 'UB2\t.*\n');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/APP CRASH \(UB2\)/);
  });

  it('without an expected-errors file nothing changes: the boot error fails', () => {
    const r = scan({ 'part-ub2/x/device-logcat.txt': BOOT }, '');
    expect(r.code).toBe(1);
  });
});
