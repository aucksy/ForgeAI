/**
 * R-76 (owner, 22 Oct 2026, joining a gym from its invite link): "when I tap on terms of privacy
 * notice, it doesn't really open that. It opens the admin dashboard." The member app links to
 * /privacy.html and /terms.html on this site; the site sends any address it does not have to the
 * admin app. So both pages must always be in public/ (the real page, or the holding page while the
 * complaints contact, #37, is blank), and the panel's offline worker must leave them alone.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_AGREEMENT_URL, TERMS_VERSION } from '../../src/crm/auth/terms';

const pub = (f: string) => resolve(__dirname, '../../public', f);

describe('R-76: the join screen’s legal links open real pages, never the admin app', () => {
  it('every page the member app links to is on the site', () => {
    const terms = readFileSync(resolve(__dirname, '../../../mobile/src/shop/joinTerms.ts'), 'utf8');
    const base = /LEGAL_BASE = '([^']+)'/.exec(terms)?.[1];
    // MettleUp (R-105): the old address and the new one serve the same pages.
    expect(['https://forgeai.aakashpahuja.in', 'https://app.mettleup.fit']).toContain(base);
    const pages = [...terms.matchAll(/\$\{LEGAL_BASE\}\/([a-z-]+\.html)/g)].map((m) => m[1]!);
    expect(pages.sort()).toEqual(['privacy.html', 'terms.html']);
    for (const p of pages) {
      expect(existsSync(pub(p)), p).toBe(true);
      const html = readFileSync(pub(p), 'utf8');
      expect(html, p).not.toContain('id="root"');
      expect(html, p).not.toMatch(/\[(OWNER NAME|CONTACT EMAIL)\]/);
      expect(html, p).toMatch(p === 'privacy.html' ? /privacy notice/i : /terms of use/i);
    }
  });

  it('#59: the admin app’s “data agreement” link opens its own page, showing the version the tick box records', () => {
    expect(DATA_AGREEMENT_URL).toBe('/data-agreement.html');
    const words = readFileSync(resolve(__dirname, '../../src/crm/auth/TermsGate.tsx'), 'utf8');
    expect(words).toContain('href={DATA_AGREEMENT_URL}');
    const p = 'data-agreement.html';
    const html = readFileSync(pub(p), 'utf8');
    expect(html).not.toContain('id="root"');
    expect(html).not.toMatch(/\[(OWNER NAME|CONTACT EMAIL)\]|LAWYER/);
    expect(html).not.toMatch(/<script/i); // the site's security policy runs no inline script
    expect(html).toMatch(/data agreement/i);
    expect(html).toContain(`Version ${TERMS_VERSION}.`);
    // The source the page is built from (scripts/legal_pages.py) says the same version.
    const source = readFileSync(resolve(__dirname, '../../../../docs/launch/DATA-AGREEMENT.md'), 'utf8');
    expect(source).toContain(`**Version ${TERMS_VERSION}.**`);
  });

  it('the panel’s offline worker never keeps them as its own page', () => {
    const sw = readFileSync(pub('sw.js'), 'utf8');
    const src = /const SKIP = (\/.+\/);/.exec(sw)?.[1];
    expect(src).toBeDefined();
    const skip = new Function(`return ${src}`)() as RegExp;
    for (const path of ['/privacy', '/privacy.html', '/terms', '/terms.html', '/data-agreement', '/data-agreement.html', '/join.html', '/home/']) expect(skip.test(path), path).toBe(true);
    for (const path of ['/', '/members', '/settings']) expect(skip.test(path), path).toBe(false);
  });
});
