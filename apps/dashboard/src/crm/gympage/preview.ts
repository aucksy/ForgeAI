/**
 * F207 "See your page": the owner's page drawn by the SAME code the page host uses (deploy/panel/gymPage.js
 * renderGymPage), from the editor's draft and what the panel already knows (plans, timings, brand, gym details). It
 * works before the page host is open to visitors. The panel shows it in a sandboxed frame with no scripts; its photos
 * are this browser's own copies (blob: addresses), and its buttons and form do nothing.
 *
 * Mirrors the server's reading (supabase 0080 gym_page_public, _gym_page_plans): active named plans with a real length
 * and price, at most 12; the phone only when "Show my phone" is on. PURE: it only builds a string.
 */
import type { GymHours } from '@forgeai/theme';

import { pageFrom, renderGymPage } from '../../../../../deploy/panel/gymPage.js';
import type { Plan } from '../types';
import type { PageDraft } from './logic';

export interface PreviewInput {
  draft: PageDraft;
  gym: { name: string; joinCode: string; phone: string | null; address: string | null };
  plans: readonly Plan[];
  hours: GymHours | null;
  brand: { accent?: string | null; logoUrl?: string | null } | null;
  /** Photo page address -> this browser's copy. A photo without one is left out of the preview. */
  thumbs: Readonly<Record<string, string>>;
  nowMs: number;
}

/** The gym's phone as the page keeps it (10 digits, 6-9 first), or null. */
export function pagePhone(phone: string | null): string | null {
  const d = (phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The plans the page shows, as the server picks them. */
export function pagePlans(plans: readonly Plan[]) {
  return plans
    .filter(
      (p) =>
        p.active !== false &&
        p.name.trim() !== '' &&
        (p.durationUnit === 'day' || p.durationUnit === 'month') &&
        Number.isInteger(p.durationCount) &&
        p.durationCount >= 1 &&
        p.durationCount <= 9999 &&
        Number.isInteger(p.priceP) &&
        p.priceP >= 0,
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, 12)
    .map((p) => ({ id: p.id, name: p.name.trim().slice(0, 60), durationUnit: p.durationUnit, durationCount: p.durationCount, priceP: p.priceP, joiningFeeP: p.joiningFeeP > 0 ? p.joiningFeeP : 0 }));
}

/** Inert links and form: the preview is for looking only. */
const LOOK_ONLY = '<style>a,button,input,textarea,select,label{pointer-events:none!important}</style>';

/** The page's HTML for the preview frame, or null when the draft cannot make a page (no usable address). */
export function buildPreview(input: PreviewInput): string | null {
  const { draft, gym, thumbs } = input;
  const phone = draft.showPhone ? pagePhone(gym.phone) : null;
  const photos = draft.photos.filter((p) => thumbs[p.url]);
  const page = pageFrom({
    v: 1,
    slug: draft.slug,
    gymName: gym.name,
    area: draft.area,
    city: draft.city,
    joinCode: null,
    brand: input.brand ?? {},
    about: draft.about,
    highlights: draft.highlights,
    photos,
    plans: pagePlans(input.plans),
    hours: input.hours,
    address: (gym.address ?? '').trim().slice(0, 200) || null,
    mapsUrl: draft.mapsUrl || null,
    contact: { phone, whatsapp: phone !== null && draft.whatsapp },
    joinOnline: false,
    indexable: false,
    updatedAt: null,
  });
  if (!page) return null;
  let html = renderGymPage(page, { nowMs: input.nowMs });
  for (const p of photos) html = html.split(p.url).join(thumbs[p.url]);
  return html.includes('</head>') ? html.replace('</head>', `${LOOK_ONLY}</head>`) : LOOK_ONLY + html;
}
