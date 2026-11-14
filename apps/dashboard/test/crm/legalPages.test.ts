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
const src = (f: string) => readFileSync(resolve(__dirname, '../../../../docs/legal', f), 'utf8').replace(/\r\n/g, '\n');

describe('R-76: the join screen’s legal links open real pages, never the admin app', () => {
  it('every page the member app links to is on the site', () => {
    const terms = readFileSync(resolve(__dirname, '../../../mobile/src/shop/joinTerms.ts'), 'utf8');
    const base = /LEGAL_BASE = '([^']+)'/.exec(terms)?.[1];
    // MettleUp (R-105): the old address and the new ones serve the same pages (mettleup.fit: 10 Nov 2026).
    expect(['https://forgeai.aakashpahuja.in', 'https://app.mettleup.fit', 'https://mettleup.fit']).toContain(base);
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
    expect(src('data-agreement.body.html')).toContain(`<strong>Version ${TERMS_VERSION}.</strong>`);
  });

  // R-445 (10 Nov 2026): the live privacy page had been hand-edited past its source, so rebuilding
  // would have dropped approved lines. Now docs/legal/*.body.html is the one source: every published
  // page must hold its source word for word (change the source, then run scripts/legal_pages.py).
  it('R-445: each published page is exactly what its approved source builds', () => {
    const parts: Record<string, string[]> = {
      'privacy.html': ['privacy.body.html', 'privacy-hi.body.html'],
      'terms.html': ['terms.body.html'],
      'data-agreement.html': ['data-agreement.body.html'],
    };
    for (const [page, sources] of Object.entries(parts)) {
      const html = readFileSync(pub(page), 'utf8').replace(/\r\n/g, '\n');
      for (const s of sources) expect(html, `${page} <- ${s}`).toContain(src(s).trimEnd());
      expect(html, page).toMatch(/Last updated: \d{1,2} [A-Z][a-z]{2} \d{4}\. What changed/);
    }
    // The Hindi says the English wins when the two differ.
    expect(src('privacy-hi.body.html')).toContain('दोनों में फर्क हो तो अंग्रेज़ी वाला मान्य है');
  });

  // R-459 (owner, 12 Nov 2026: "All yes"): the approved line about messages to the gym, word for word, in
  // section 4B (what goes to your gym), on the published page too.
  it('R-459: the privacy notice says how long messages to the gym are kept, word for word', () => {
    const line =
      "Messages you send to your gym from the Gym tab (questions, feedback, complaints) and the gym's replies are kept for 180 days after the last message, and deleted when you leave the gym. Feedback you send without your name is shown to the gym without your name.";
    const body = src('privacy.body.html');
    expect(body).toContain(line);
    const b = body.indexOf('<h3>B. If you join a gym</h3>');
    const c = body.indexOf('<h3>C. ');
    expect(b).toBeGreaterThan(-1);
    expect(body.indexOf(line)).toBeGreaterThan(b);
    expect(body.indexOf(line)).toBeLessThan(c);
    expect(readFileSync(pub('privacy.html'), 'utf8').replace(/\r\n/g, '\n')).toContain(line);
  });

  // F56 (owner, 12 Nov 2026: "Both yes"): Find my gym and Tell my gym, word for word, in section 4B next to how a
  // member joins a gym, on the published page too.
  it('F56: the privacy notice explains Find my gym and Tell my gym, word for word', () => {
    const lines = [
      'Find my gym: if you check your mobile number in the app, we look for it on the member lists of gyms that use MettleUp, only to show you your own gym. The number is checked once and is not kept for this.',
      "Tell my gym: if you type your gym's name and city, we keep only those two, so our team can contact that gym. We never share your number.",
    ];
    const body = src('privacy.body.html');
    const page = readFileSync(pub('privacy.html'), 'utf8').replace(/\r\n/g, '\n');
    const b = body.indexOf('<h3>B. If you join a gym</h3>');
    const c = body.indexOf('<h3>C. ');
    for (const line of lines) {
      expect(body, line).toContain(line);
      expect(body.indexOf(line), line).toBeGreaterThan(b);
      expect(body.indexOf(line), line).toBeLessThan(c);
      expect(page, line).toContain(line);
    }
  });

  // R-480 (owner, 13 Nov 2026: "privacy and policy wording are approved"): the 4 policy pages payment companies
  // look for are live, built from docs/legal like the others, with no draft line or blank slot left on them.
  it('R-480: refunds, shipping and delivery, contact and about are published from their approved source', () => {
    const pages = ['refund', 'delivery', 'contact', 'about'];
    for (const p of pages) {
      const html = readFileSync(pub(`${p}.html`), 'utf8').replace(/\r\n/g, '\n');
      expect(html, p).toContain(src(`${p}.body.html`).trimEnd());
      expect(html, p).not.toMatch(/DRAFT|TO CONFIRM|\[date|not approved/i);
      expect(html, p).not.toMatch(/<script/i);
      expect(html, p).toContain('<p>Last updated: 13 November 2026.</p>');
    }
    // Every legal page's menu reaches all of them.
    for (const p of ['privacy', 'terms', 'data-agreement', 'delete-account', ...pages]) {
      const nav = /<nav>(.*?)<\/nav>/.exec(readFileSync(pub(`${p}.html`), 'utf8'))?.[1] ?? '';
      for (const href of ['/privacy.html', '/terms.html', '/refund.html', '/delivery.html', '/contact.html', '/about.html']) expect(nav, `${p} menu`).toContain(`href="${href}"`);
    }
    // Contact: the customer-care phone (his business line), the Grievance Officer's phone, and the city as the address (R-483).
    const contact = readFileSync(pub('contact.html'), 'utf8');
    expect(contact).toContain('<tr><th>Customer-care phone</th><td><a href="tel:+918690560741">+91 86905 60741</a></td></tr>');
    expect(contact).toMatch(/Grievance Officer:<\/strong> Aakash Pahuja, Founder\. .*phone <a href="tel:\+918690560741">\+91 86905 60741<\/a>/);
    expect(contact).toContain('<tr><th>Address</th><td>Jaipur, Rajasthan, India</td></tr>');
    expect(readFileSync(pub('about.html'), 'utf8')).not.toMatch(/phone number and address/);
  });

  it('the panel’s offline worker never keeps them as its own page', () => {
    const sw = readFileSync(pub('sw.js'), 'utf8');
    const src = /const SKIP = (\/.+\/);/.exec(sw)?.[1];
    expect(src).toBeDefined();
    const skip = new Function(`return ${src}`)() as RegExp;
    for (const path of ['/privacy', '/privacy.html', '/terms', '/terms.html', '/data-agreement', '/data-agreement.html', '/join.html', '/home/', '/f/ABCD2345', '/friend.html', '/m/QA0002', '/join-online', '/join-online.html', '/delete-account', '/refund', '/refund.html', '/delivery', '/contact', '/contact.html', '/about']) expect(skip.test(path), path).toBe(true);
    for (const path of ['/', '/members', '/settings']) expect(skip.test(path), path).toBe(false);
  });
});
