/**
 * UAT U-G4: the phone test logged a part as SKIPPED (and the run still passed) when the server
 * function it needs was missing (branding, invite link, QR check-in). The release gate reads the
 * WHOLE run, so a whole run now FAILS on a missing server function; a partial run may still skip.
 *
 * The decision is one small shell function in qa/run-device-qa.sh: it is cut out of the script and
 * run with bash (when this machine has one), and every probe is checked to go through it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// A Windows checkout has CRLF line ends; CI's has LF.
const script = readFileSync(resolve(__dirname, '../../qa/run-device-qa.sh'), 'utf8').split('\r').join('');

function helper(): string {
  const m = script.match(/^qa_server_missing\(\) \{\n[\s\S]*?\n\}\n/m);
  if (!m) throw new Error('qa_server_missing() not found in run-device-qa.sh');
  return m[0];
}

function findBash(): string | null {
  for (const b of ['bash', 'C:\\Program Files\\Git\\bin\\bash.exe']) {
    if (b !== 'bash' && !existsSync(b)) continue;
    const r = spawnSync(b, ['-c', 'echo ok'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === 'ok') return b;
  }
  return null;
}

function run(only: string): { status: string; out: string } {
  const bash = findBash();
  if (!bash) throw new Error('no bash');
  const prog = `status=0\nQA_ONLY_LIST="${only}"\nlog() { echo "[qa] $*"; }\n${helper()}qa_server_missing BR "gym branding is not on the server yet"\necho "status=$status"\n`;
  const r = spawnSync(bash, ['-c', prog], { encoding: 'utf8' });
  const out = r.stdout;
  return { status: (out.match(/status=(\d)/) ?? [])[1] ?? '?', out };
}

describe('U-G4: a missing server function on a whole run fails it', () => {
  it('every server probe (BR, INV, INV-f) goes through the one rule; none logs SKIPPED by itself', () => {
    expect(script).toMatch(/qa_server_missing BR "/);
    expect(script).toMatch(/qa_server_missing INV "/);
    expect(script).toMatch(/qa_server_missing INV-f "/);
    expect(script).not.toMatch(/log "PART (BR|INV|INV-f) SKIPPED/);
  });

  it.runIf(findBash() != null)('whole run (no `only`): FAILED and status 1', () => {
    const r = run('');
    expect(r.out).toMatch(/PART BR FAILED: gym branding is not on the server yet/);
    expect(r.status).toBe('1');
  });

  it.runIf(findBash() != null)('partial run: SKIPPED, status untouched', () => {
    const r = run('r br inv');
    expect(r.out).toMatch(/PART BR SKIPPED \(partial run\): gym branding is not on the server yet/);
    expect(r.status).toBe('0');
  });
});
