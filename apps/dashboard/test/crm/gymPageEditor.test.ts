/** F207 "Your web page" (R-529): the editor's rules, its save, the Enquiries line and the preview. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HIGHLIGHT_KEYS,
  LIMITS,
  PAGE_ASK_PREFIX,
  WORDS,
  addressLocked,
  draftChanged,
  draftErrors,
  draftFrom,
  hasLink,
  movePhoto,
  pageAnswerFrom,
  pageAskOf,
  pageLive,
  photoObject,
  saveErrorOf,
  savePayload,
  slugTyped,
  thrownWords,
  type PageDraft,
  type SavedPage,
} from '../../src/crm/gympage/logic';
import { buildPreview, pagePhone, pagePlans } from '../../src/crm/gympage/preview';

const GYM = '11111111-2222-4333-8444-555555555555';
const photo = (n: number) => `https://join.mettleup.fit/p/${GYM}/${String(n).padStart(32, 'a')}.webp`;
const gym = { name: 'Shakti Gym', joinCode: 'SHAKT1' };

const saved = (over: Partial<SavedPage> = {}): SavedPage => ({
  slug: 'shakti-gym-sector-12',
  published: false,
  indexable: false,
  hiddenByHq: false,
  hqNote: null,
  area: 'Sector 12',
  city: 'Jaipur',
  about: 'A friendly gym.',
  highlights: ['ac', 'trainers'],
  photos: [{ url: photo(1), alt: 'Weights' }],
  mapsUrl: '',
  lat: 26.9,
  lng: 75.8,
  showPhone: true,
  whatsapp: true,
  aiHelper: false,
  termsAt: null,
  updatedAt: 1,
  ...over,
});

const draft = (over: Partial<PageDraft> = {}): PageDraft => ({ ...draftFrom(saved(), gym), ...over });

describe('Your web page: the address', () => {
  it('a new page suggests an address from the gym name', () => {
    const d = draftFrom(null, gym);
    expect(d.slug).toMatch(/^shakti-gym/);
    expect(d.published).toBe(false);
    expect(d.termsAgreed).toBe(false);
  });

  it('typing keeps small letters, numbers and single dashes', () => {
    expect(slugTyped('Shakti Gym  Sector_12!!')).toBe('shakti-gym-sector-12');
    expect(slugTyped('--a--b')).not.toMatch(/--/);
  });

  it('locks once published, or once the terms were ticked (it was public before)', () => {
    expect(addressLocked(null)).toBe(false);
    expect(addressLocked(saved())).toBe(false);
    expect(addressLocked(saved({ published: true, termsAt: 5 }))).toBe(true);
    expect(addressLocked(saved({ published: false, termsAt: 5 }))).toBe(true);
  });

  it('live = published, terms ticked and not taken down', () => {
    expect(pageLive(saved({ published: true, termsAt: 5 }))).toBe(true);
    expect(pageLive(saved({ published: true, termsAt: 5, hiddenByHq: true }))).toBe(false);
    expect(pageLive(saved({ published: false, termsAt: 5 }))).toBe(false);
  });
});

describe('Your web page: what is checked before saving', () => {
  it('a good draft has no errors', () => {
    expect(draftErrors(draft(), null)).toEqual({});
  });

  it('every wrong field gets its own plain words', () => {
    const e = draftErrors(
      draft({ slug: 'ab', about: 'see www.mygym.com', mapsUrl: 'https://evil.example/x', highlights: HIGHLIGHT_KEYS.slice(0, 9), published: true }),
      null,
    );
    expect(e.slug).toBe(WORDS.slugBad);
    expect(e.about).toBe(WORDS.noLinks);
    expect(e.mapsUrl).toBe(WORDS.mapsBad);
    expect(e.highlights).toBe(WORDS.highlightsMax);
    expect(e.terms).toBe(WORDS.terms);
  });

  it('the terms tick is needed once: not again after it was given', () => {
    expect(draftErrors(draft({ published: true }), 5).terms).toBeUndefined();
    expect(draftErrors(draft({ published: true, termsAgreed: true }), null).terms).toBeUndefined();
  });

  it('About longer than 500 letters is refused', () => {
    expect(draftErrors(draft({ about: 'a'.repeat(LIMITS.about + 1) }), null).about).toContain('500');
  });

  it('a photo from anywhere else is refused', () => {
    expect(draftErrors(draft({ photos: [{ url: 'https://example.com/x.webp', alt: '' }] }), null).photos).toBe(WORDS.photosBad);
  });

  it('finds web addresses the same way the gym server does (0080 _gym_page_has_link)', () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/0080_gym_page.sql'), 'utf8');
    const tlds = /\(com\|in\|net[^)]*\)/.exec(sql)?.[0];
    expect(tlds).toBeTruthy();
    expect(hasLink.toString()).toContain(tlds!);
    for (const s of ['https://x', 'www.gym', 'wa.me/91', 'shaktigym.in', 'Visit irongym.fit']) expect(hasLink(s)).toBe(true);
    for (const s of ['Open 6 am to 10 pm. Ladies batch.', 'Sector 12, near the market', 'Rs. 800 a month']) expect(hasLink(s)).toBe(false);
  });
});

describe('Your web page: the save', () => {
  it('sends the whole page, keeps the map pin and the AI switch as saved', () => {
    const p = savePayload(draft({ about: '  Hi  ' }), saved());
    expect(p).toMatchObject({ slug: 'shakti-gym-sector-12', about: 'Hi', lat: 26.9, lng: 75.8, aiHelper: false, termsAgreed: false });
  });

  it('WhatsApp only with the phone; the terms tick only when publishing', () => {
    expect(savePayload(draft({ showPhone: false, whatsapp: true }), saved()).whatsapp).toBe(false);
    expect(savePayload(draft({ published: false, termsAgreed: true }), saved()).termsAgreed).toBe(false);
    expect(savePayload(draft({ published: true, termsAgreed: true }), saved()).termsAgreed).toBe(true);
  });

  it('knows when nothing changed', () => {
    expect(draftChanged(draftFrom(saved(), gym), saved(), gym)).toBe(false);
    expect(draftChanged(draft({ about: 'New' }), saved(), gym)).toBe(true);
    expect(draftChanged(draftFrom(null, gym), null, gym)).toBe(true);
  });

  it("the server's refusals land on their field", () => {
    expect(saveErrorOf('SLUG_TAKEN', 'shakti-gym')).toEqual({ field: 'slug', words: expect.stringContaining('shakti-gym-2') });
    expect(saveErrorOf('BAD_MAPS', 'x').field).toBe('mapsUrl');
    expect(saveErrorOf('NEEDS_TERMS', 'x').field).toBe('terms');
    expect(saveErrorOf('WHO_KNOWS', 'x').field).toBeNull();
    expect(thrownWords(new Error('OWNER_ONLY'))).toBe('Only the owner can change the web page.');
    expect(thrownWords(new Error('TypeError: Failed to fetch'))).toContain('internet');
    expect(thrownWords(new Error('something else'))).toBeNull();
  });

  it('reads the server answer, and rejects anything else', () => {
    expect(pageAnswerFrom({ canEdit: true, page: null })).toEqual({ canEdit: true, page: null });
    expect(pageAnswerFrom([])).toBeNull();
    expect(pageAnswerFrom('x')).toBeNull();
  });
});

describe('Your web page: photos', () => {
  it('a photo address maps to its file in the bucket, nothing else does', () => {
    expect(photoObject(photo(1))).toBe(`${GYM}/${'1'.padStart(32, 'a')}.webp`);
    expect(photoObject('https://join.mettleup.fit/p/../x.webp')).toBeNull();
  });

  it('moving a photo up swaps it; off the ends changes nothing', () => {
    const list = [1, 2, 3].map((n) => ({ url: photo(n), alt: String(n) }));
    expect(movePhoto(list, 2, -1).map((p) => p.alt)).toEqual(['1', '3', '2']);
    expect(movePhoto(list, 0, -1).map((p) => p.alt)).toEqual(['1', '2', '3']);
  });
});

describe('Enquiries: asked on the web page', () => {
  it('reads the question, refuses an empty one', () => {
    expect(pageAskOf({ pageAsk: { v: 1, name: ' Ravi ', question: ' Ladies batch? ', at: 5 } })).toEqual({ v: 1, name: 'Ravi', question: 'Ladies batch?', at: 5 });
    expect(pageAskOf({ pageAsk: { v: 1, name: 'R', question: '  ', at: 5 } })).toBeNull();
    expect(pageAskOf({ pageAsk: null })).toBeNull();
    expect(PAGE_ASK_PREFIX).toBe('Asked on your web page: ');
  });
});

describe('See your page (preview)', () => {
  const plan = (over: Record<string, unknown>) =>
    ({ id: 'p', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 80000, joiningFeeP: 0, active: true, sortOrder: 0, ...over }) as never;

  it('the phone as the page keeps it', () => {
    expect(pagePhone('+919876543210')).toBe('9876543210');
    expect(pagePhone('09876543210')).toBe('9876543210');
    expect(pagePhone('12345')).toBeNull();
    expect(pagePhone(null)).toBeNull();
  });

  it('shows the active plans only, in their order', () => {
    const out = pagePlans([plan({ id: 'b', name: 'B', sortOrder: 2 }), plan({ id: 'a', name: 'A', sortOrder: 1 }), plan({ id: 'c', name: 'Old', active: false })]);
    expect(out.map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('draws the page with this browser’s photo copies and no working buttons', () => {
    const html = buildPreview({
      draft: draft({ about: 'A friendly gym near the market.' }),
      gym: { name: 'Shakti Gym', joinCode: 'SHAKT1', phone: '+919876543210', address: 'Plot 4, Sector 12' },
      plans: [plan({})],
      hours: null,
      brand: null,
      thumbs: { [photo(1)]: 'blob:http://x/1' },
      nowMs: Date.UTC(2026, 10, 14, 6),
    });
    expect(html).toBeTruthy();
    expect(html).toContain('Shakti Gym');
    expect(html).toContain('A friendly gym near the market.');
    expect(html).toContain('blob:http://x/1');
    expect(html).not.toContain(photo(1));
    expect(html).toContain('pointer-events:none');
  });

  it('no preview for an address that cannot be used', () => {
    expect(buildPreview({ draft: draft({ slug: 'x' }), gym: { name: 'G', joinCode: 'SHAKT1', phone: null, address: null }, plans: [], hours: null, brand: null, thumbs: {}, nowMs: 0 })).toBeNull();
  });
});
