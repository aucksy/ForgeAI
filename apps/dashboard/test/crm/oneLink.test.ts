/** R-563 (owner, 15 Nov 2026): ONE link per gym for people who may join, the same on a phone or a computer. */
import { describe, expect, it } from 'vitest';

import type { PageAnswer, SavedPage } from '../../src/crm/gympage/logic';
import { GYM_PAGE_POSTER, JOIN_ONLINE_POSTER } from '../../src/crm/shop/InviteScreen';
import { JOIN_LINK_ORIGIN } from '../../src/crm/shop/linkOrigin';
import { gymLinkFrom, gymLinkMessage } from '../../src/crm/shop/oneLink';

const APP = 'https://app.mettleup.fit';
const page = (over: Partial<SavedPage> = {}): SavedPage => ({ slug: 'shakti-gym-sector-12', published: true, hiddenByHq: false, ...over }) as SavedPage;
const answer = (p: SavedPage | null, canEdit = true): PageAnswer => ({ page: p, canEdit });

describe('the gym’s one link', () => {
  it('is the join link while gym web pages are off, even with a published page', () => {
    expect(gymLinkFrom({ pagesOpen: false, web: answer(page()), joinCode: 'rams01', joinOrigin: APP })).toEqual({ kind: 'join', url: `${APP}/m/RAMS01`, pageNotMade: false });
    expect(gymLinkFrom({ pagesOpen: false, web: null, joinCode: 'RAMS01', joinOrigin: JOIN_LINK_ORIGIN }).url).toBe('https://join.mettleup.fit/m/RAMS01');
  });
  it('is the web page once pages are open and the page is published', () => {
    expect(gymLinkFrom({ pagesOpen: true, web: answer(page()), joinCode: 'RAMS01', joinOrigin: APP })).toEqual({
      kind: 'page', url: 'https://join.mettleup.fit/shakti-gym-sector-12', pageNotMade: false,
    });
  });
  it('stays the join link while the page is not made, not published or taken down by MettleUp', () => {
    const one = (web: PageAnswer | null | undefined) => gymLinkFrom({ pagesOpen: true, web, joinCode: 'RAMS01', joinOrigin: APP });
    expect(one(answer(null))).toEqual({ kind: 'join', url: `${APP}/m/RAMS01`, pageNotMade: true });
    expect(one(answer(page({ published: false })))).toEqual({ kind: 'join', url: `${APP}/m/RAMS01`, pageNotMade: true });
    // Taken down: no "make your page" nudge (the owner cannot fix it by publishing).
    expect(one(answer(page({ hiddenByHq: true })))).toEqual({ kind: 'join', url: `${APP}/m/RAMS01`, pageNotMade: false });
    // The desk cannot edit the page: no nudge either. Still loading, or no web page part (HQ switched it off): none.
    expect(one(answer(null, false)).pageNotMade).toBe(false);
    expect(one(undefined).pageNotMade).toBe(false);
    expect(one(null).pageNotMade).toBe(false);
  });
  it('the WhatsApp message carries the one link on its own last line, and never says "phone"', () => {
    const joinMsg = gymLinkMessage('Shakti Gym', gymLinkFrom({ pagesOpen: false, web: null, joinCode: 'RAMS01', joinOrigin: APP }), 'RAMS01', APP);
    expect(joinMsg.split('\n')).toEqual(['Hi!', 'Become a member of Shakti Gym online. Pick a plan and send your details. You pay at the gym desk.', '', 'Open this link to join:', `${APP}/m/RAMS01`]);
    const pageMsg = gymLinkMessage('Shakti Gym', gymLinkFrom({ pagesOpen: true, web: answer(page()), joinCode: 'RAMS01', joinOrigin: APP }), 'RAMS01', APP);
    expect(pageMsg.split('\n')).toEqual(['Hi!', 'See the fees, timings and photos of Shakti Gym, and become a member online. You pay at the gym desk.', '', 'Open our page:', 'https://join.mettleup.fit/shakti-gym-sector-12']);
    for (const m of [joinMsg, pageMsg]) expect(m).not.toMatch(/phone/i);
  });
  it('says "You pay at the gym desk" only while paying online on joining is off (JOIN_PAY; fresh-eyes review, 15 Nov 2026)', () => {
    const join = gymLinkFrom({ pagesOpen: false, web: null, joinCode: 'RAMS01', joinOrigin: APP });
    const pageLink = gymLinkFrom({ pagesOpen: true, web: answer(page()), joinCode: 'RAMS01', joinOrigin: APP });
    expect(gymLinkMessage('Shakti Gym', pageLink, 'RAMS01', APP, false)).toContain('You pay at the gym desk.');
    expect(gymLinkMessage('Shakti Gym', join, 'RAMS01', APP, false)).toContain('You pay at the gym desk.');
    const pageOn = gymLinkMessage('Shakti Gym', pageLink, 'RAMS01', APP, true);
    const joinOn = gymLinkMessage('Shakti Gym', join, 'RAMS01', APP, true);
    expect(pageOn.split('\n')[1]).toBe('See the fees, timings and photos of Shakti Gym, and become a member online.');
    expect(joinOn.split('\n')[1]).toBe('Become a member of Shakti Gym online. Pick a plan and send your details.');
    for (const m of [pageOn, joinOn]) expect(m).not.toMatch(/desk/);
  });
  it('both posters say a computer can type the link printed under the QR', () => {
    for (const p of [JOIN_ONLINE_POSTER, GYM_PAGE_POSTER]) {
      expect(p.lead).not.toMatch(/phone/i);
      expect(p.codeLine('RAMS01')).toBe('No app needed. On a computer, type the link below. Ask at the desk if you need help.');
    }
    expect(GYM_PAGE_POSTER.steps).toEqual(['Scan with your phone camera', 'See our fees, timings and photos', 'Tap “Become a member”']);
    expect(GYM_PAGE_POSTER.file).not.toBe(JOIN_ONLINE_POSTER.file);
  });
});
