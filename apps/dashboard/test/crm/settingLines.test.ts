/**
 * R-561 (owner, 15 Nov 2026): every setting the owner changes has ONE plain, complete, simple sentence under it, in
 * English and Hinglish (logic/settingLines). These checks keep it that way: one sentence each, a capital first and a
 * full stop last, short enough for a phone, a Hinglish line that keeps the numbers, and every line really on a screen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HINGLISH } from '../../src/crm/lang/hinglish';
import { translate } from '../../src/crm/lang/lang';
import { SETTING_LINES } from '../../src/crm/logic/settingLines';

const ROOT = fileURLToPath(new URL('../../src/crm', import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
  });
}
const screens = files(ROOT).map((f) => readFileSync(f, 'utf8')).join('\n');

const entries = Object.entries(SETTING_LINES);

describe('the line under each setting', () => {
  it('is one sentence: a capital first, one full stop, at the end', () => {
    for (const [id, line] of entries) {
      expect(line, id).toMatch(/^[A-Z]/);
      expect(line, id).toMatch(/\.$/);
      // No second sentence: no full stop, question mark or ! followed by a space and more words.
      expect(line.slice(0, -1), id).not.toMatch(/[.!?]\s/);
      expect(line, id).not.toMatch(/!/);
    }
  });

  it('is short enough to read under a label on a phone', () => {
    for (const [id, line] of entries) expect(line.length, id).toBeLessThanOrEqual(150);
  });

  it('has its Hinglish line, which keeps every number, {n} and MettleUp, and ends in a full stop', () => {
    for (const [id, line] of entries) {
      const hi = HINGLISH[line];
      expect(hi, id).toBeTruthy();
      expect(hi, id).toMatch(/\.$/);
      for (const n of line.match(/\d+|\{n\}/g) ?? []) expect(hi, id).toContain(n);
      if (line.includes('MettleUp')) expect(hi, id).toContain('MettleUp');
    }
  });

  it('fills the number in either language', () => {
    expect(translate('en', SETTING_LINES.plusLock, { n: 7 })).toContain('7 days after');
    expect(translate('hinglish', SETTING_LINES.plusLock, { n: 7 })).toContain('7 din baad');
  });

  it('every line is shown under a setting on a screen', () => {
    for (const [id] of entries) expect(screens, id).toContain(`SETTING_LINES.${id}`);
  });

  it('keeps the facts the screens promise', () => {
    // Off: the member pays at the desk (pay/PaymentsScreen); the plus lock never takes a workout (0070).
    expect(SETTING_LINES.payInApp).toContain('Pay now');
    expect(SETTING_LINES.payInApp).toContain('pay at the desk');
    expect(SETTING_LINES.payOnJoin).toContain('pay at the desk');
    expect(SETTING_LINES.plusLock).toContain('workouts are always kept');
    // Google "may" list a page: nobody can promise a search result.
    expect(SETTING_LINES.indexable).toContain('may show');
    expect(SETTING_LINES.timingsNote).toContain('120 letters');
    expect(SETTING_LINES.serial).toContain('Menu > System Info > Serial Number');
  });
});
