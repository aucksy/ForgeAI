// R-631 D15 (owner, 27 Nov 2026): the visit counter runs only on mettleup.fit and gyms.mettleup.fit, never on the
// admin app (app.mettleup.fit) or the gym pages. The privacy notice promises exactly this.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pub = resolve(__dirname, '../../public');
const files = ['member-site/member.js', 'home/home.js'];

function guard(src: string): RegExp {
  const m = src.match(/if \(!(\/.+\/)\.test\(location\.hostname\)\) return;/);
  expect(m, 'host guard').toBeTruthy();
  const body = m![1];
  return new RegExp(body.slice(1, -1));
}

describe('visit counter host guard', () => {
  for (const f of files) {
    const src = readFileSync(resolve(pub, f), 'utf8');
    it(`${f} counts only the two public websites`, () => {
      const re = guard(src);
      expect(re.test('mettleup.fit')).toBe(true);
      expect(re.test('gyms.mettleup.fit')).toBe(true);
      for (const h of ['app.mettleup.fit', 'join.mettleup.fit', 'forgeai.aakashpahuja.in', 'localhost', 'evilmettleup.fit']) {
        expect(re.test(h), h).toBe(false);
      }
      expect(src).toContain('static.cloudflareinsights.com/beacon.min.js');
    });
  }
  it('no other public file loads the counter', () => {
    for (const f of ['privacy.html', 'join.html', 'checkin.html', 'get-app.html', 'delete-account.html', 'gym-page/page.js']) {
      expect(readFileSync(resolve(pub, f), 'utf8'), f).not.toContain('cloudflareinsights');
    }
  });
});
