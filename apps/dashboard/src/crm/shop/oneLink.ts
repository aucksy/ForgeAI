/**
 * R-563 (owner, 15 Nov 2026): ONE link per gym for people who may join. "the gym will have their webpage under our
 * domain they can use that to be published on their Google Maps or they can share it with anyone users go to that page
 * read the information and then join from there". And "people should be able to join from their computers as well".
 *
 *  - Gym web pages open (the Worker's GYM_PAGES) and this gym's page published (not taken down, not switched off by HQ):
 *    the one link is the page, https://join.mettleup.fit/<slug>. Its "Become a member" opens the same join form.
 *  - Otherwise: the one link is the join link, <origin>/m/<CODE> (Join online, live since 14 Nov 2026).
 * The Invite card, its WhatsApp message, the poster's QR and Settings' share all use what this says. Old /m/<CODE>
 * links (printed posters) keep working for good: the Worker serves them whatever this says. Every link works the same
 * on a phone or a computer. PURE apart from the hook at the bottom.
 */
import { PAGE_HOST, pageLive, type PageAnswer } from '../gympage/logic';
import { usePagesOpen } from '../gympage/pagesOpen';
import { useWebPage } from '../gympage/pageState';
import { joinOnlineLink, joinOnlineMessage } from './invite';
import { useJoinOrigin } from './linkOrigin';

export const PAGE_LINK_ORIGIN = `https://${PAGE_HOST}`;

export interface GymLink {
  /** 'page': the gym's web page; 'join': the join link. */
  kind: 'page' | 'join';
  url: string;
  /** Gym web pages are open, the owner may edit, and the page is not made or not published yet (the card says how). */
  pageNotMade: boolean;
}

/** The gym's one link. PURE. */
export function gymLinkFrom(a: { pagesOpen: boolean; web: PageAnswer | null | undefined; joinCode: string; joinOrigin: string }): GymLink {
  const page = a.pagesOpen && a.web ? a.web.page : null;
  if (page && pageLive(page)) return { kind: 'page', url: `${PAGE_LINK_ORIGIN}/${page.slug}`, pageNotMade: false };
  const notMade = Boolean(a.pagesOpen && a.web && a.web.canEdit && !(page && page.hiddenByHq));
  return { kind: 'join', url: joinOnlineLink(a.joinCode, a.joinOrigin), pageNotMade: notMade };
}

/** The WhatsApp message with the gym's one link. PURE. */
export function gymLinkMessage(gymName: string, link: GymLink, joinCode: string, joinOrigin: string): string {
  if (link.kind === 'join') return joinOnlineMessage(gymName, joinCode, joinOrigin);
  const gym = gymName.trim() || 'our gym';
  return ['Hi!', `See the fees, timings and photos of ${gym}, and become a member online. You pay at the gym desk.`, '', 'Open our page:', link.url].join('\n');
}

/** The gym's one link, redrawn when pages open, the page is published or the join address is known. */
export function useGymLink(joinCode: string): GymLink {
  const pagesOpen = usePagesOpen();
  const web = useWebPage();
  const joinOrigin = useJoinOrigin();
  return gymLinkFrom({ pagesOpen, web, joinCode, joinOrigin });
}
