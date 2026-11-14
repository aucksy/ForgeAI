// F207 gym page (R-519, 14 Nov 2026): every gym's own free web page, https://join.mettleup.fit/<gym-slug>.
// HIDDEN: the Worker answers these addresses only when the var GYM_PAGES is "live", and the page's data comes from the
// gym server's gym_page_public(slug), which is NOT on the live database yet (docs/gym-page/PLAN.md lists the change and
// the public words that need the owner's yes). Until both, every gym page address is a plain "not open" 404.
//
// This file is PURE (no network, no Cloudflare): the Worker hands it the gym server's answer and it returns the whole
// page as HTML, so the page is complete before any script runs (fast on a slow phone, readable by Google and by
// WhatsApp's link preview). The page's only script is /gym-page/page.js (the question form, sharing, the report
// form, the shutter). Design: apps/dashboard/.impeccable/surfaces/public-gym-page-page-js.md (a painted shop
// signboard over a rolling shutter, then the fees and timings boards by the door).
//
// SAFETY. Everything the owner typed is escaped here (escapeHtml); JSON for scripts has "<" escaped; photo and logo
// addresses must be on our own photo store (photoOk); a Google Maps link must be Google's own (mapsLinkOk). Prices
// are the gym's own plan prices, in paise, as the gym server read them; the page never makes one up.

import { DAY_KEYS, hoursFrom, indiaNow, openStatus, specialWords, upcomingSpecial, weekRows } from '../../packages/theme/src/gymHours.ts';

export const PAGE_HOST = 'join.mettleup.fit';
export const PAGE_ORIGIN = `https://${PAGE_HOST}`;
const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
/** Where a gym page's photos may live: our own photo address (R2 behind the Worker), or the gym server's public buckets. */
export const PHOTO_PREFIXES = [`${PAGE_ORIGIN}/p/`, `${SUPABASE}/storage/v1/object/public/gym-page-photos/`, `${SUPABASE}/storage/v1/object/public/gym-logos/`];

/** What an owner may put on the page (the admin app's form and the gym server's check use the same numbers). */
export const LIMITS = { about: 500, photos: 6, alt: 120, highlights: 8, area: 40, address: 200, slug: 48 };

/**
 * The facilities an owner may tick. A fixed list, not free text: nobody can write a claim or a link into it, and it
 * reads the same on every gym's page. Words: needs the owner's yes with the rest (PLAN.md, "Public words").
 */
export const HIGHLIGHTS = {
  ac: 'Air conditioned',
  trainers: 'Trainers on the floor',
  women: 'Women-only batch',
  pt: 'Personal training',
  cardio: 'Cardio machines',
  weights: 'Free weights',
  crossfit: 'Functional training',
  yoga: 'Yoga',
  zumba: 'Zumba and dance',
  diet: 'Diet plans',
  lockers: 'Lockers',
  showers: 'Changing rooms and showers',
  steam: 'Steam room',
  parking: 'Parking',
  app: 'Workouts tracked in the MettleUp app',
};

/** Addresses a gym can never take (they are the site's own paths, or would read as ours). */
export const RESERVED_SLUGS = new Set([
  'api', 'p', 'gym-page', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'assets', 'j', 'm', 'c', 'f', 'app', 'admin', 'www',
  'help', 'report', 'about', 'privacy', 'terms', 'login', 'signup', 'start', 'gyms', 'mettleup', 'support', 'contact',
]);

// ------------------------------------------------------------------ small pure helpers

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** JSON that can sit inside a <script> block: "<" can never close the tag. */
export function scriptJson(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * The page's address part from the gym's name and area: "Example Fitness", "Andheri West" -> "example-fitness-andheri-west".
 * Letters a-z and digits only (a Hindi-only name gives nothing, so it falls back to gym-<code>). Never a reserved word.
 */
export function gymSlug(name, area = '', joinCode = '') {
  const clean = (s) =>
    String(s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  let slug = [clean(name), clean(area)].filter(Boolean).join('-').slice(0, LIMITS.slug).replace(/-+$/g, '');
  if (slug.length < 3 || RESERVED_SLUGS.has(slug)) slug = `gym-${clean(joinCode) || 'page'}`;
  return slug;
}

/** A slug as it may appear in an address (what the Worker accepts). PURE. */
export function slugOk(s) {
  return typeof s === 'string' && s.length >= 3 && s.length <= LIMITS.slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && !RESERVED_SLUGS.has(s);
}

export function photoOk(url) {
  return typeof url === 'string' && url.length <= 400 && !/["'<>\s\\]/.test(url) && PHOTO_PREFIXES.some((p) => url.startsWith(p));
}

/** Only Google's own map links (the owner pastes "Share" from Google Maps). */
export function mapsLinkOk(url) {
  return (
    typeof url === 'string' &&
    url.length <= 300 &&
    !/["'<>\s\\]/.test(url) &&
    /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.(com|co\.in)\/maps[/?])/.test(url)
  );
}

/** "Open in Google Maps" and "Directions" links. Google's Maps URLs need no key. PURE. */
export function mapsLinks({ mapsUrl, lat, lng, address, gymName }) {
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && lat > 6 && lat < 38 && lng > 68 && lng < 98; // India
  const place = hasPoint ? `${lat},${lng}` : [gymName, address].filter(Boolean).join(', ');
  if (!place) return null;
  const q = encodeURIComponent(place);
  return {
    open: mapsLinkOk(mapsUrl) ? mapsUrl : `https://www.google.com/maps/search/?api=1&query=${q}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}

/** WhatsApp's share link with the gym's name and page address. PURE. */
export function whatsappShare(gymName, pageUrl) {
  return `https://wa.me/?text=${encodeURIComponent(`${gymName}: fees, timings and photos. ${pageUrl}`)}`;
}

/** Indian rupees from paise: 150000 -> "₹1,500". PURE. */
export function rupees(paise) {
  const r = Math.round(Number(paise) / 100);
  return `₹${r.toLocaleString('en-IN')}`;
}

/** "1 month", "3 months", "1 day", "15 days". PURE. */
export function lengthWords(unit, count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const w = unit === 'day' ? 'day' : 'month';
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

/** "₹1,000 a month" for a plan longer than a month; "about ₹1,167 a month" when it does not divide. Null otherwise. */
export function perMonthWords(plan) {
  if (plan.durationUnit !== 'month' || !(plan.durationCount > 1)) return null;
  const each = plan.priceP / plan.durationCount;
  const exact = Number.isInteger(each / 100);
  return `${exact ? '' : 'about '}${rupees(each)} a month`;
}

/** Black or white letters on the gym's colour, whichever reads better (the same rule as join.html). PURE. */
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#14110F' : '#FFFFFF';
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_ACCENT = '#E8590C';

// ------------------------------------------------------------------ the gym server's answer, checked

/**
 * gym_page_public(slug)'s answer as the page uses it, with everything checked and trimmed; null when it is not a
 * published page. Unknown fields are dropped. PURE.
 */
export function pageFrom(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const gymName = s(raw.gymName, 80);
  if (!gymName || !slugOk(raw.slug)) return null;
  const brand = raw.brand && typeof raw.brand === 'object' ? raw.brand : {};
  const plans = (Array.isArray(raw.plans) ? raw.plans : [])
    .filter((p) => p && typeof p.name === 'string' && Number.isInteger(p.priceP) && p.priceP >= 0 && (p.durationUnit === 'month' || p.durationUnit === 'day'))
    .slice(0, 12)
    .map((p) => ({
      id: s(p.id, 64),
      name: s(p.name, 60),
      durationUnit: p.durationUnit,
      durationCount: Math.max(1, Math.floor(Number(p.durationCount) || 1)),
      priceP: p.priceP,
      joiningFeeP: Number.isInteger(p.joiningFeeP) && p.joiningFeeP > 0 ? p.joiningFeeP : 0,
    }));
  const photos = (Array.isArray(raw.photos) ? raw.photos : [])
    .filter((p) => p && photoOk(p.url))
    .slice(0, LIMITS.photos)
    .map((p) => ({ url: p.url, alt: s(p.alt, LIMITS.alt) }));
  const highlights = (Array.isArray(raw.highlights) ? raw.highlights : []).filter((k) => Object.hasOwn(HIGHLIGHTS, k)).slice(0, LIMITS.highlights);
  const contact = raw.contact && typeof raw.contact === 'object' ? raw.contact : {};
  const phone = typeof contact.phone === 'string' && /^[6-9]\d{9}$/.test(contact.phone) ? contact.phone : null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  return {
    slug: raw.slug,
    gymName,
    area: s(raw.area, LIMITS.area),
    city: s(raw.city, 40),
    joinCode: typeof raw.joinCode === 'string' && /^[A-Z0-9]{6}$/.test(raw.joinCode) ? raw.joinCode : null,
    accent: HEX.test(brand.accent) ? brand.accent.toUpperCase() : DEFAULT_ACCENT,
    logoUrl: typeof brand.logoUrl === 'string' && brand.logoUrl.startsWith(`${SUPABASE}/storage/v1/object/public/gym-logos/`) && photoOk(brand.logoUrl) ? brand.logoUrl : null,
    about: typeof raw.about === 'string' ? raw.about.trim().slice(0, LIMITS.about) : '',
    highlights,
    photos,
    plans,
    hours: hoursFrom(raw.hours),
    address: s(raw.address, LIMITS.address),
    mapsUrl: mapsLinkOk(raw.mapsUrl) ? raw.mapsUrl : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    phone,
    whatsapp: phone !== null && contact.whatsapp === true,
    joinOnline: raw.joinOnline === true && !!raw.joinCode,
    indexable: raw.indexable === true,
    // R-521: the owner's AI helper switch, on unless the owner turned it off. Nothing on the page reads it yet (F208).
    aiHelper: raw.aiHelper !== false,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : null,
  };
}

// ------------------------------------------------------------------ search engines

/** schema.org ExerciseGym for Google (name, address, hours, photos, price range). PURE. */
export function gymJsonLd(p, pageUrl) {
  const ld = { '@context': 'https://schema.org', '@type': 'ExerciseGym', name: p.gymName, url: pageUrl };
  if (p.photos.length) ld.image = p.photos.map((x) => x.url);
  if (p.address) ld.address = { '@type': 'PostalAddress', streetAddress: p.address, addressLocality: p.city || undefined, addressCountry: 'IN' };
  if (p.lat !== null && p.lng !== null) ld.geo = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng };
  if (p.phone) ld.telephone = `+91${p.phone}`;
  if (p.plans.length) {
    const prices = p.plans.map((x) => x.priceP);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    ld.priceRange = lo === hi ? rupees(lo) : `${rupees(lo)} to ${rupees(hi)}`;
  }
  if (p.hours) {
    const DOW = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    const spec = [];
    for (const k of DAY_KEYS) {
      const d = p.hours.week[k];
      if (d.kind === 'allDay') spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DOW[k], opens: '00:00', closes: '23:59' });
      if (d.kind === 'hours') for (const r of d.ranges) spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DOW[k], opens: r.open, closes: r.close === '00:00' ? '23:59' : r.close });
    }
    if (spec.length) ld.openingHoursSpecification = spec;
  }
  return ld;
}

// ------------------------------------------------------------------ the page

const NAME_SIZE = (name) => (name.length <= 10 ? 'xl' : name.length <= 18 ? 'l' : name.length <= 28 ? 'm' : 's');

function statusOf(p, nowMs) {
  if (!p.hours) return null;
  const st = openStatus(p.hours, nowMs);
  const soon = st.state === 'open' && st.line.startsWith('Closes soon');
  return { state: soon ? 'soon' : st.state === 'allDay' ? 'open' : st.state, line: st.line };
}

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4.2-2.1 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-2.1 4.2 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8.3c.3-.5.6-.5.9-.5h.6c.2 0 .4.1.5.4l.8 1.9c.1.2 0 .5-.1.6l-.6.7c-.1.2-.1.4 0 .6a6.4 6.4 0 0 0 2.9 2.6c.2.1.4.1.5-.1l.8-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.4.5 0 .7-.3 1.4-.9 1.8-.7.4-1.6.6-2.9.1a9.9 9.9 0 0 1-5.1-4.5c-.7-1.3-.8-2.3-.4-3.1z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/**
 * The timings board's rows: days in a row with the same hours (and no special day) share one row, "Monday to
 * Saturday"; a special day this week keeps its own row with its note. PURE.
 */
export function timingRows(week) {
  const out = [];
  for (const r of week) {
    const key = r.lines.join('|');
    const last = out[out.length - 1];
    if (last && !r.special && !last.special && last.key === key) {
      last.to = r.name;
      last.count += 1;
      last.today = last.today || r.today;
    } else out.push({ key, from: r.name, to: r.name, count: 1, lines: r.lines, today: r.today, special: !!r.special, note: r.special?.note || '' });
  }
  return out.map((g) => ({
    days: g.count === 1 ? g.from : g.count === 2 ? `${g.from} and ${g.to}` : `${g.from} to ${g.to}`,
    lines: g.lines,
    today: g.today,
    note: g.note,
  }));
}

/** One fees board row. */
function planRow(p) {
  const month = perMonthWords(p);
  const fee = p.joiningFeeP > 0 ? `<span class="fee">+ ${rupees(p.joiningFeeP)} joining fee for new members</span>` : '';
  return (
    `<li class="plan"><div class="pl-name"><b>${escapeHtml(p.name)}</b><span>${lengthWords(p.durationUnit, p.durationCount)}</span>${fee}</div>` +
    `<div class="pl-price"><strong>${rupees(p.priceP)}</strong>${month ? `<span>${escapeHtml(month)}</span>` : ''}</div></li>`
  );
}

/**
 * The whole page. `nowMs` sets "Open now" (India time); `assetBase` is where /gym-page/page.js is served (the
 * page's own address by default). PURE.
 */
export function renderGymPage(p, { nowMs = Date.now(), assetBase = '', origin = PAGE_ORIGIN, payOnline = false } = {}) {
  const url = `${origin}/${p.slug}`;
  const ink = inkOn(p.accent);
  const st = statusOf(p, nowMs);
  const joinHref = p.joinOnline && p.joinCode ? `https://app.mettleup.fit/m/${p.joinCode}` : null;
  const maps = mapsLinks(p);
  const place = [p.area, p.city].filter(Boolean).join(', ');
  const title = `${p.gymName}${place ? `, ${place}` : ''}: fees, timings and photos`;
  const priceWords = p.plans.length ? `Plans from ${rupees(Math.min(...p.plans.map((x) => x.priceP)))}. ` : '';
  const desc = `${priceWords}${st ? `${st.line}. ` : ''}See the fees, timings and photos of ${p.gymName}, then join or ask the gym a question.`;
  const ogImage = p.photos[0]?.url ?? p.logoUrl;
  const today = indiaNow(nowMs).dateISO;
  const closedNow = st && st.state === 'closed';

  const logo = p.logoUrl
    ? `<img src="${escapeHtml(p.logoUrl)}" alt="" width="56" height="56">`
    : `<span>${escapeHtml((p.gymName.trim().charAt(0) || 'G').toUpperCase())}</span>`;
  const statusPlate = st ? `<p class="plate s-${st.state}" id="status"><i aria-hidden="true"></i>${escapeHtml(st.line)}</p>` : '';
  const primary = joinHref
    ? `<a class="btn tin" href="${escapeHtml(joinHref)}">Become a member<small>${payOnline ? 'Join and pay online' : 'Send your details. Pay at the desk.'}</small></a><a class="btn paint" href="#ask">Ask a question</a>`
    : `<a class="btn tin" href="#ask">Ask a question<small>The gym replies on your phone.</small></a>`;

  const photos = p.photos.length
    ? `<section class="floor${closedNow ? ' is-closed' : ''}" aria-label="Photos of ${escapeHtml(p.gymName)}">` +
      `<div class="strip" tabindex="0">${p.photos
        .map((x, i) => `<figure><img src="${escapeHtml(x.url)}" alt="${escapeHtml(x.alt || `Inside ${p.gymName}, photo ${i + 1}`)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`)
        .join('')}</div>` +
      `<div class="shutter" aria-hidden="true"><span>${closedNow ? escapeHtml(st.line.replace(/^Closed (now|today) · /, '')) : ''}</span></div>` +
      (p.photos.length > 1 ? `<p class="count" aria-hidden="true">${p.photos.length} photos · swipe</p>` : '') +
      `</section>`
    : `<div class="shutter-band" aria-hidden="true"></div>`;

  const fees = p.plans.length
    ? `<section class="board fees" aria-labelledby="fees-h"><header><h2 id="fees-h">Fees</h2><span lang="hi">फीस</span></header>` +
      `<ul>${p.plans.map((x) => planRow(x)).join('')}</ul>` +
      `<p class="board-note">Prices are set by ${escapeHtml(p.gymName)}. Please confirm at the desk before you pay.</p>` +
      (joinHref ? `<a class="btn ink" href="${escapeHtml(joinHref)}">Become a member</a>` : '') +
      `</section>`
    : '';

  let timings = '';
  if (p.hours) {
    const rows = timingRows(weekRows(p.hours, nowMs))
      .map(
        (r) =>
          `<tr${r.today ? ' class="today"' : ''}><th scope="row">${escapeHtml(r.days)}${r.today ? ' <em>Today</em>' : ''}</th><td>${r.lines.map(escapeHtml).join('<br>')}${
            r.note ? `<small>${escapeHtml(r.note)}</small>` : ''
          }</td></tr>`,
      )
      .join('');
    const weekEnd = weekRows(p.hours, nowMs)[6].dateISO;
    const next = upcomingSpecial(p.hours, nowMs, 45).find((x) => x.date > weekEnd);
    timings =
      `<section class="board timings" aria-labelledby="time-h"><header><h2 id="time-h">Timings</h2><span lang="hi">समय</span></header>` +
      `<table><tbody>${rows}</tbody></table>` +
      (p.hours.note ? `<p class="board-note strong">${escapeHtml(p.hours.note)}</p>` : '') +
      (next ? `<p class="board-note">Coming up: ${escapeHtml(specialWords(next, today))}</p>` : '') +
      `</section>`;
  }

  const about =
    p.about || p.highlights.length
      ? `<section class="about" aria-labelledby="about-h"><h2 id="about-h">About ${escapeHtml(p.gymName)}</h2>` +
        (p.about ? p.about.split(/\n{2,}/).map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('') : '') +
        (p.highlights.length ? `<ul class="chips">${p.highlights.map((k) => `<li>${escapeHtml(HIGHLIGHTS[k])}</li>`).join('')}</ul>` : '') +
        `</section>`
      : '';

  const contactBtns = [
    p.phone ? `<a class="btn line" href="tel:+91${p.phone}">${ICON.call}Call the gym</a>` : '',
    p.whatsapp ? `<a class="btn line" href="https://wa.me/91${p.phone}">${ICON.wa}WhatsApp the gym</a>` : '',
  ].join('');
  const findUs =
    maps || p.address || contactBtns
      ? `<section class="board find" aria-labelledby="find-h"><header><h2 id="find-h">Find us</h2><span lang="hi">पता</span></header>` +
        (p.address ? `<p class="addr">${ICON.pin}<span>${escapeHtml(p.address)}</span></p>` : '') +
        `<div class="row">${maps ? `<a class="btn ink" href="${escapeHtml(maps.open)}" rel="noopener" target="_blank">Open in Google Maps</a><a class="btn line" href="${escapeHtml(maps.directions)}" rel="noopener" target="_blank">${ICON.arrow}Directions</a>` : ''}${contactBtns}</div>` +
        `</section>`
      : '';

  const ask =
    `<section class="board ask" id="ask" aria-labelledby="ask-h"><header><h2 id="ask-h">Ask the gym</h2><span lang="hi">सवाल पूछें</span></header>` +
    `<form id="ask-form" novalidate><p class="board-lead">Your question goes straight to ${escapeHtml(p.gymName)}. They reply on your phone.</p>` +
    `<label for="a-name">Your name</label><input id="a-name" name="name" autocomplete="name" maxlength="80" required>` +
    `<label for="a-phone">Mobile number</label><div class="tel"><span>+91</span><input id="a-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" required></div>` +
    `<label for="a-q">Your question</label><textarea id="a-q" name="question" rows="3" maxlength="500" placeholder="Is there a ladies batch? Can I try one day first?" required></textarea>` +
    `<label class="tick"><input type="checkbox" name="consent" required><span>Send my name, number and question to ${escapeHtml(p.gymName)} so they can reply to me. Only this gym sees them.</span></label>` +
    `<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">` +
    `<button class="btn ink" type="submit">Send to the gym</button><p class="msg" id="ask-msg" role="status" aria-live="polite"></p></form>` +
    `</section>`;

  const shareHref = whatsappShare(p.gymName, url);
  const ld = gymJsonLd(p, url);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="${p.indexable ? 'index, follow' : 'noindex, nofollow'}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(url)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<meta name="theme-color" content="${p.accent}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Hind:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css(p.accent, ink)}</style>
<script type="application/ld+json">${scriptJson(ld)}</script>
<script type="application/json" id="gym-data">${scriptJson({ slug: p.slug, gymName: p.gymName, url })}</script>
<script type="module" src="${assetBase}/gym-page/page.js"></script>
</head>
<body>
<header class="sign" id="sign">
  <div class="sign-in">
    <div class="badge" aria-hidden="true">${logo}</div>
    <h1 class="name n-${NAME_SIZE(p.gymName)}">${escapeHtml(p.gymName)}</h1>
    ${place ? `<p class="place">${escapeHtml(place)}</p>` : ''}
    ${statusPlate}
    <div class="acts">${primary}</div>
  </div>
</header>
<main>
${photos}
<div class="wall">
  <div class="col-a">${about}${findUs}${ask}</div>
  <div class="col-b">${fees}${timings}
  <section class="share" aria-label="Share this page">
    <a class="btn wa" href="${escapeHtml(shareHref)}" rel="noopener" target="_blank" id="share-wa">${ICON.wa}Share on WhatsApp</a>
    <button class="btn line" type="button" id="copy" data-url="${escapeHtml(url)}">${ICON.link}<span>Copy link</span></button>
  </section></div>
</div>
</main>
<footer class="foot">
  <p>This page is made by ${escapeHtml(p.gymName)} on MettleUp. The fees, offers, timings and photos come from the gym, and the gym is responsible for them. MettleUp does not sell memberships and takes no money on this page.</p>
  <details class="report"><summary>${ICON.flag}Report this page</summary>
    <form id="report-form" novalidate>
      <fieldset><legend>What is wrong?</legend>
        <label><input type="radio" name="reason" value="wrong" required> Wrong or misleading fees, offers or timings</label>
        <label><input type="radio" name="reason" value="photos"> Photos are not of this gym, or are copied</label>
        <label><input type="radio" name="reason" value="offensive"> Offensive or unsafe content</label>
        <label><input type="radio" name="reason" value="scam"> Spam or a scam</label>
        <label><input type="radio" name="reason" value="closed"> This gym has closed</label>
      </fieldset>
      <label for="r-more">Anything else (optional)</label><textarea id="r-more" name="details" rows="2" maxlength="300"></textarea>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn line" type="submit">Send the report to MettleUp</button><p class="msg" id="report-msg" role="status" aria-live="polite"></p>
    </form>
  </details>
  <p class="links"><a href="https://mettleup.fit/privacy">Privacy</a><a href="https://mettleup.fit/terms">Terms</a><a href="https://gyms.mettleup.fit/">Own a gym? Get a free page like this</a></p>
  <p class="made">Made with <b>MettleUp</b></p>
</footer>
<nav class="dock" id="dock" aria-label="Quick actions">${joinHref ? `<a class="btn tin" href="${escapeHtml(joinHref)}">Become a member</a>` : ''}<a class="btn paint" href="#ask">Ask</a></nav>
</body>
</html>`;
}

// ------------------------------------------------------------------ the look (one template for every gym)

function css(accent, ink) {
  const dark = ink === '#FFFFFF';
  return `
:root{--accent:${accent};--on-accent:${ink};--paint-shadow:${dark ? 'rgba(0,0,0,.42)' : 'rgba(255,255,255,.55)'};--accent-deep:color-mix(in srgb,${accent} 70%,#000);--badge-ink:${dark ? accent : '#14110F'};
--wall:#E7ECEA;--wall-2:#DCE2E0;--wall-ink:#15181C;--wall-soft:#454C53;--tin:#FFFFFF;--tin-ink:#15181C;--tin-soft:#4F565D;--tin-line:#D7DCDD;
--steel:#8F979D;--steel-hi:#BEC4C8;--steel-lo:#5F676D;--good:#16833A;--warn:#B45309;--bad:#B3261E;--wa:#0E7A3F;
--display:"Teko","Hind",system-ui,sans-serif;--text:"Hind",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif;--ease:cubic-bezier(.16,1,.3,1)}
@media (prefers-color-scheme:dark){:root{--wall:#141719;--wall-2:#1B1F22;--wall-ink:#EEF1F0;--wall-soft:#B4BCBF;--steel:#5B6368;--steel-hi:#7B8489;--steel-lo:#3A4145}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:12px}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--wall);color:var(--wall-ink);font:400 17px/1.55 var(--text);overflow-x:hidden}
::selection{background:var(--accent);color:var(--on-accent)}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:4px}
h1,h2{font-family:var(--display);font-weight:700;letter-spacing:.005em;text-transform:uppercase;margin:0;text-wrap:balance}
svg{width:20px;height:20px;flex:none}
.btn{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:54px;padding:8px 20px;border-radius:6px;font:600 18px/1.15 var(--text);text-decoration:none;text-align:center;border:0;cursor:pointer;transition:transform .15s var(--ease),filter .15s}
.btn:active{transform:translateY(1px) scale(.985)}
.btn small{font-weight:500;font-size:13.5px;opacity:.78}
.btn.line,.btn.wa,.btn.paint{flex-direction:row;gap:10px}
.btn.tin{background:var(--tin);color:var(--tin-ink);box-shadow:0 7px 16px -6px rgba(0,0,0,.45),inset 0 -2px 0 rgba(0,0,0,.08)}
.btn.paint{background:transparent;color:var(--on-accent);border:2.5px solid currentColor}
.btn.ink{background:var(--accent);color:var(--on-accent);box-shadow:0 6px 14px -8px var(--accent-deep)}
.btn.line{background:transparent;color:var(--tin-ink);border:2px solid var(--tin-ink)}
.btn.wa{background:var(--wa);color:#fff}
.btn:hover{filter:brightness(1.06)}

/* the signboard: the gym's colour, painted letters, a painter's border line */
.sign{background:var(--accent);color:var(--on-accent);padding:14px 14px 0;position:relative}
.sign-in{position:relative;border:2px solid color-mix(in srgb,var(--on-accent) 38%,transparent);border-bottom:0;border-radius:4px 4px 0 0;padding:22px 18px 22px;display:grid;grid-template-columns:1fr;gap:12px}
.badge{width:64px;height:64px;border-radius:50%;background:var(--tin);display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 3px var(--steel-hi),0 0 0 5px var(--steel-lo),0 8px 16px -6px rgba(0,0,0,.5)}
.badge img{width:48px;height:48px;object-fit:contain}
.badge span{font:700 40px/1 var(--display);color:var(--badge-ink);padding-top:6px}
.name{line-height:.84;color:var(--on-accent);text-shadow:1px 1px 0 var(--paint-shadow),2px 2px 0 var(--paint-shadow),3px 3px 0 var(--paint-shadow),4px 4px 0 var(--paint-shadow);overflow-wrap:anywhere;margin-top:4px}
.n-xl{font-size:clamp(76px,24vw,168px)}.n-l{font-size:clamp(60px,16.5vw,132px)}.n-m{font-size:clamp(48px,12.5vw,104px)}.n-s{font-size:clamp(40px,10vw,84px);line-height:.9}
.place{margin:-2px 0 0;font:600 17px/1.3 var(--text);letter-spacing:.02em;opacity:.92}
.plate{justify-self:start;display:inline-flex;align-items:center;gap:10px;margin:2px 0 4px;padding:8px 14px 7px;background:var(--tin);color:var(--tin-ink);font:600 16px/1.2 var(--text);border-radius:3px;box-shadow:0 5px 12px -5px rgba(0,0,0,.45);position:relative}
.plate i{width:12px;height:12px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px color-mix(in srgb,var(--good) 22%,transparent)}
.plate.s-soon i{background:var(--warn);box-shadow:0 0 0 3px color-mix(in srgb,var(--warn) 22%,transparent)}
.plate.s-closed i{background:var(--bad);box-shadow:0 0 0 3px color-mix(in srgb,var(--bad) 22%,transparent)}
.acts{display:grid;gap:10px;margin-top:6px}
.acts .btn.paint{min-height:50px}

/* the rolling shutter over the floor inside */
.floor{position:relative;background:var(--steel-lo);overflow:hidden}
.strip{display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x mandatory;padding:26px 6px 6px;scrollbar-width:none}
.strip::-webkit-scrollbar{display:none}
.strip figure{margin:0;flex:0 0 84%;max-width:440px;aspect-ratio:4/5;scroll-snap-align:center;background:var(--steel)}
.strip img{width:100%;height:100%;object-fit:cover;display:block}
.shutter,.shutter-band{background:repeating-linear-gradient(to bottom,var(--steel-hi) 0 3px,var(--steel) 3px 10px,var(--steel-lo) 10px 11px,var(--steel) 11px 12px)}
.shutter-band{height:44px;border-bottom:6px solid var(--steel-lo)}
.shutter{position:absolute;inset:0 0 auto 0;height:100%;transform:translateY(calc(-100% + 22px));border-bottom:6px solid var(--steel-lo);display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px;transition:transform 1.25s var(--ease)}
.shutter span{font:700 clamp(30px,8vw,48px)/1 var(--display);text-transform:uppercase;color:#fff;text-shadow:2px 2px 0 rgba(0,0,0,.35);background:var(--bad);padding:6px 14px 2px;border-radius:3px}
.shutter span:empty{display:none}
.js .floor .shutter{transform:translateY(0)}
.js .floor.up .shutter{transform:translateY(calc(-100% + 22px))}
.js .floor.is-closed.up .shutter{transform:translateY(-38%)}
.floor.is-closed .shutter{transform:translateY(-38%)}
@media (prefers-reduced-motion:reduce){.shutter{transition:none}}
.count{position:absolute;right:12px;bottom:12px;margin:0;font:600 13px/1 var(--text);color:#fff;background:rgba(0,0,0,.55);padding:6px 9px;border-radius:3px}

/* the wall by the door, and its tin boards */
.wall{padding:26px 16px 8px;display:grid;gap:22px;max-width:1180px;margin:0 auto}
.wall{display:flex;flex-direction:column}.col-a,.col-b{display:contents}
.fees{order:1}.timings{order:2}.about{order:3}.find{order:4}.ask{order:5}.share{order:6}
.board{background:var(--tin);color:var(--tin-ink);border-radius:5px;box-shadow:0 1px 0 rgba(0,0,0,.06),0 18px 34px -22px rgba(0,0,0,.55);overflow:hidden}
.board header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;background:var(--accent);color:var(--on-accent);padding:12px 18px 6px}
.board h2{font-size:40px;line-height:.9}
.board header span{font:600 20px/1 var(--text);opacity:.9}
.board ul{list-style:none;margin:0;padding:4px 18px}
.plan{display:grid;grid-template-columns:1fr auto;gap:4px 14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--tin-line)}
.plan:last-child{border-bottom:0}
.pl-name b{display:block;font-size:19px;font-weight:600;line-height:1.25}
.pl-name span{display:block;color:var(--tin-soft);font-size:15px}
.pl-name .fee{font-size:14px;margin-top:2px}
.pl-price{text-align:right}
.pl-price strong{display:block;font:700 42px/.9 var(--display);font-variant-numeric:tabular-nums;padding-top:4px}
.pl-price span{display:block;font-size:14px;color:var(--tin-soft)}
.board-note{margin:0;padding:12px 18px 16px;color:var(--tin-soft);font-size:15px;border-top:1px dashed var(--tin-line)}
.board-note.strong{color:var(--tin-ink);font-weight:600}
.board .btn.ink{display:flex;margin:0 18px 18px}
.board form .btn.ink{margin:0}
.board-lead{margin:0 0 14px;color:var(--tin-soft);font-size:16px}
table{width:100%;border-collapse:collapse;margin:4px 0}
th,td{text-align:left;vertical-align:top;padding:11px 18px;border-bottom:1px solid var(--tin-line);font-size:16.5px}
th{font-weight:600;width:46%}
td{font-variant-numeric:tabular-nums}
td small{display:block;color:var(--tin-soft);font-size:14px}
tr.today th,tr.today td{background:color-mix(in srgb,var(--accent) 13%,var(--tin))}
tr.today th{box-shadow:inset 5px 0 0 var(--accent)}
th em{font-style:normal;font:700 15px/1 var(--display);text-transform:uppercase;letter-spacing:.04em;background:var(--accent);color:var(--on-accent);padding:3px 6px 1px;border-radius:2px;margin-left:6px;vertical-align:1px}
.about h2{font-size:clamp(34px,9vw,52px);line-height:.92;margin-bottom:10px}
.about p{margin:0 0 12px;max-width:62ch;font-size:18px;color:var(--wall-ink)}
.chips{list-style:none;padding:0;margin:14px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.chips li{background:var(--tin);color:var(--tin-ink);font-weight:600;font-size:15px;padding:8px 12px 6px;border-radius:3px;box-shadow:0 4px 10px -6px rgba(0,0,0,.45)}
.addr{display:flex;gap:10px;margin:0;padding:16px 18px 6px;font-size:17px;font-weight:500}
.addr svg{color:var(--accent-deep);margin-top:2px}
.find .row{display:grid;gap:10px;padding:10px 18px 18px}
.find .btn.ink{margin:0}

/* the question form */
form{padding:16px 18px 18px;display:grid}
label{font-weight:600;font-size:15.5px;margin:2px 0 6px}
input:not([type=checkbox]):not([type=radio]),textarea{width:100%;min-height:54px;padding:12px 14px;font:500 17px/1.35 var(--text);color:var(--tin-ink);background:var(--tin);border:2px solid var(--tin-line);border-radius:6px;margin-bottom:14px}
textarea{min-height:96px;resize:vertical}
input:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 30%,transparent)}
::placeholder{color:#656C73}
.tel{display:flex;gap:8px;margin-bottom:14px}.tel input{margin-bottom:0!important}.tel span{display:flex;align-items:center;padding:0 12px;min-height:54px;border:2px solid var(--tin-line);border-radius:6px;font-weight:600;color:var(--tin-soft)}
.tick{display:flex;gap:12px;align-items:flex-start;font-weight:500;font-size:15px;line-height:1.45;margin:2px 0 16px}
.tick input,.report input[type=radio]{width:22px;height:22px;accent-color:var(--accent);flex:none;margin:1px 0 0}
.hp{position:absolute!important;left:-9999px!important;height:1px!important;width:1px!important}
.msg{margin:10px 0 0;font-weight:600;font-size:15.5px;min-height:1px}
.msg.ok{color:var(--good)}.msg.bad{color:var(--bad)}
button[disabled]{opacity:.6;cursor:progress}

.share{display:grid;gap:10px;grid-template-columns:1fr 1fr}
.share .btn.line{color:var(--wall-ink);border-color:var(--wall-ink)}
.foot{max-width:1180px;margin:0 auto;padding:22px 16px 120px;color:var(--wall-soft);font-size:14.5px;line-height:1.55}
.foot p{margin:0 0 14px;max-width:70ch}
.report{margin:0 0 16px}
.report summary{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-weight:600;color:var(--wall-ink);list-style:none;text-decoration:underline;text-underline-offset:3px}
.report summary::-webkit-details-marker{display:none}
.report svg{width:18px;height:18px}
.report form{background:var(--tin);color:var(--tin-ink);border-radius:5px;margin-top:6px;max-width:560px}
.report fieldset{border:0;padding:0;margin:0 0 12px;display:grid;gap:4px}
.report legend{font-weight:600;margin-bottom:6px}
.report fieldset label{display:flex;gap:10px;align-items:flex-start;font-weight:500;min-height:40px}
.links{display:flex;flex-wrap:wrap;gap:6px 18px}
.links a{color:var(--wall-ink);text-underline-offset:3px}
.made{font:600 15px/1 var(--text);letter-spacing:.02em}
.made b{font-family:var(--display);font-size:22px;letter-spacing:.04em;text-transform:uppercase;color:var(--wall-ink)}
.dock{position:fixed;left:0;right:0;bottom:0;z-index:5;display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--accent);box-shadow:0 -10px 24px -14px rgba(0,0,0,.6);transform:translateY(110%);transition:transform .35s var(--ease)}
.dock .btn{min-height:50px}.dock .btn.paint{padding:0 22px}
.dock.on{transform:none}
.dock:has(> :only-child){grid-template-columns:1fr}

@media (min-width:760px){
  .acts{grid-template-columns:auto auto;justify-content:start}
  .strip figure{flex-basis:46%}
  .share{max-width:560px}
}
@media (min-width:980px){
  .sign{padding:18px 18px 0}
  .sign-in{grid-template-columns:auto 1fr auto;grid-template-areas:"badge name acts" "badge place acts" "badge plate acts";column-gap:28px;align-items:end;padding:30px 34px 30px;max-width:1240px;margin:0 auto}
  .badge{grid-area:badge;align-self:start;width:96px;height:96px}.badge img{width:72px;height:72px}.badge span{font-size:60px}
  .name{grid-area:name}.place{grid-area:place}.plate{grid-area:plate}
  .acts{grid-area:acts;grid-template-columns:1fr;min-width:290px}
  .strip{display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:240px;overflow:visible;padding:30px 18px 18px;max-width:1240px;margin:0 auto}
  .strip figure{max-width:none;aspect-ratio:auto}
  .strip figure:first-child{grid-row:span 2}
  .count{display:none}
  .wall{display:grid;grid-template-columns:7fr 5fr;gap:34px;padding:40px 18px 10px;align-items:start}
  .col-a,.col-b{display:grid;gap:26px;align-content:start}
  .col-a{grid-column:1;grid-row:1}.col-b{grid-column:2;grid-row:1}
  .find .row{grid-template-columns:1fr 1fr}
  .share .btn{white-space:nowrap;padding:8px 14px}
  .dock{display:none}
  .foot{padding:30px 18px 50px}
}
`;
}
