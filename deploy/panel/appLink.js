// R-579 (15 Nov 2026): ONE smart app link. The owner: "configuring a link that basically redirects the user to the correct
// Play Store. If you know they are on Android, it goes to the Android Play Store. If the user is on iPhone, when the iPhone
// app is built, it goes to the iPhone." Two forms, the same device rules (worker.js):
//   /app          no gym known (the member website, help, posters without a gym).
//   /j/<CODE>     a gym known: the gym's invite link, already out in the world. It stays the link with a gym because Android
//                 opens it straight in an installed MettleUp app (an App Link: assetlinks.json + the app's intent filter);
//                 a redirect from another address would not.
// The device rules (deviceOf, from the User-Agent only; no cookie, nothing kept, nothing personal in the address):
//   bot (WhatsApp, Facebook, Telegram... link previews)  a page with a proper preview (title, picture), never a redirect.
//   android      /app: straight to Google Play (one 302, no page). /j/<CODE>: the gym page, which opens the app or says how
//                to get it (the app reads no Play install referrer, so the gym page keeps the gym; R-579 checked apps/mobile).
//   ios (iPhone, iPad, iPod)  APP_STORE_URL empty (today): a "coming soon" page, with the gym when the code is known.
//                APP_STORE_URL set (the day the iPhone app is out, wrangler.jsonc vars): straight to the App Store, no code
//                change. An iPad that asks for the computer site says "Macintosh"; the page itself spots it by touch.
//   other (a computer, anything else)  a page with a QR code to open on the phone, and both stores (App Store "coming soon"
//                until APP_STORE_URL is set).

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.mettleup.app';

/** Link-preview fetchers and search crawlers, by name. Checked before the phone kinds (Googlebot says "Android"). */
const BOT =
  /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|^whatsapp\/|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|pinterestbot|redditbot|applebot|googlebot|google-inspectiontool|googleother|bingbot|duckduckbot|yandexbot|baiduspider|embedly|iframely|vkshare|petalbot|(^|[^a-z])(bot|crawler|spider|preview)([^a-z]|$)/i;

/** Which kind of visitor: 'bot' | 'android' | 'ios' | 'other'. PURE. */
export function deviceOf(userAgent) {
  const ua = String(userAgent ?? '');
  if (BOT.test(ua)) return 'bot';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'other';
}

/**
 * The App Store address from the Worker var APP_STORE_URL, or '' (not out yet). Only an apps.apple.com address counts, so a
 * typo can never send people somewhere else. PURE.
 */
export function appStoreUrl(env) {
  const raw = String(env?.APP_STORE_URL ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'apps.apple.com' && /\/app\//.test(u.pathname) ? u.href : '';
  } catch {
    return '';
  }
}

/** What the pages get written into them (window.__APP__): the visitor's kind as the Worker saw it, and the stores. PURE. */
export function appBoot(env, device) {
  const json = JSON.stringify({ device, play: PLAY_URL, appStore: appStoreUrl(env) }).replace(/</g, '\\u003c');
  return `<script>window.__APP__=${json};</script>`;
}

const SAME_EVERYWHERE = { 'Cache-Control': 'no-store', Vary: 'User-Agent' };

/** A 302 that no cache keeps for another kind of phone. */
export function goTo(to) {
  return new Response(null, { status: 302, headers: { Location: to, ...SAME_EVERYWHERE } });
}

/**
 * /j/<CODE> before the gym page is drawn: an iPhone or iPad goes straight to the App Store once APP_STORE_URL is set.
 * null = draw the gym page (every other case). PURE.
 */
export function joinRedirect(env, userAgent) {
  const store = appStoreUrl(env);
  return store && deviceOf(userAgent) === 'ios' ? store : null;
}

/**
 * GET /app (and /app/): the smart link without a gym. Android: Google Play. iPhone: the App Store once it is set. Everyone
 * else (iPhone today, a computer, a link preview): public/get-app.html with window.__APP__ written in.
 */
export async function handleAppLink(request, env) {
  const device = deviceOf(request.headers.get('User-Agent'));
  if (device === 'android') return goTo(PLAY_URL);
  const store = appStoreUrl(env);
  if (device === 'ios' && store) return goTo(store);
  // html_handling serves /get-app.html at /get-app. Never a "not modified": the page differs by phone.
  const ask = new Request(new URL('/get-app', request.url), { headers: { Accept: 'text/html' } });
  const page = await env.ASSETS.fetch(ask);
  if (!page.ok) return goTo(PLAY_URL);
  const html = (await page.text()).replace('</head>', `${appBoot(env, device)}</head>`);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SAME_EVERYWHERE,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
