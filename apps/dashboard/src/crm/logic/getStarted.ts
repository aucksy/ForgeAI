/**
 * "Get started" on Today for a new gym (launch plan I5, 21 Oct 2026): the five first steps, in the
 * order an owner needs them. A step the records can prove ticks itself (plans, members, a member in
 * the app); the ones the records cannot see (logo and colours, staff added, poster printed) tick when
 * the owner says so. Logo and colours also tick when the Branding screen finds or saves a look (R-190).
 * The card goes when every step is done, or when the owner hides it. PURE.
 *
 * UAT 1 Nov 2026: "Bring in your members" opens Members (Add member AND Import side by side; the
 * import screen alone had no way to add one person), and "Print the check-in poster" opens the
 * Check-in QR poster (it opened the JOIN poster, which is step 6's). Hints are whole sentences.
 */
import type { CrmSnapshot } from '../data/adapter';

export type StepKey = 'plans' | 'members' | 'brand' | 'staff' | 'timings' | 'online' | 'poster' | 'app';

export interface Step {
  key: StepKey;
  title: string;
  hint: string;
  path: string;
  done: boolean;
  /** True when the owner ticks it (the records cannot show it). */
  manual: boolean;
  /**
   * R-571: other screens the step sends the owner to (exact paths). On them the "Next step" bar offers "Back to" this
   * step's own screen instead (the journey opens the web page editor, Settings for the UPI ID, and Payments).
   */
  alsoPaths?: readonly string[];
}

/**
 * R-571 (owner, 15 Nov 2026): "the whole setup will tell them about the page as well as the payments they can enable
 * ... It should be like one journey to set this up." ONE step, "Let people find and join your gym online", opens the
 * journey screen (ui/screens/OnlineJourney.tsx) with three parts in order: (1) the gym's free web page, on by default;
 * the owner may say "Not now" or turn it off (HQ's per-gym switch, 0090, still wins: then there is no page part);
 * (2) the one link and its QR poster (copy, WhatsApp, print, Google Maps); (3) how people pay (only what is on).
 * It replaces R-523's "Make your free gym web page" step. Shown for a gym that is online (not the demo): the join link
 * and paying at the desk work today; the web page part only while gym web pages are open (GYM_PAGES) and this gym's
 * server answers owner_gym_page. Without the page part the title says "join", not "find and join".
 */
export interface OnlineState {
  /** Gym web pages are open, this gym has the page part (HQ has not switched it off) and the owner may edit it. */
  pagePart: boolean;
  /** The page is published and not taken down by MettleUp. */
  published: boolean;
  /** MettleUp took the page down: publishing cannot finish the step, sharing the join link does. */
  takenDown: boolean;
  /** The owner chose "Not now" (or turned the page off) in the journey. */
  pageNotNow: boolean;
  /** The owner shared the gym's one link (WhatsApp, copy, print or the poster picture). */
  linkShared: boolean;
}

/** Done: the page is published, or the owner said "Not now" to the page and shared the link. PURE. */
export function onlineDone(o: OnlineState): boolean {
  if (o.pagePart && !o.takenDown) return o.published || (o.pageNotNow && o.linkShared);
  return o.linkShared;
}

export const ONLINE_PATH = '/setup/online';
export const ONLINE_TITLE_PAGE = 'Let people find and join your gym online';
export const ONLINE_TITLE_JOIN = 'Let people join your gym online';

/** The journey's step, or none for a gym that is not online. PURE. */
function onlineStep(o: OnlineState | null): Step[] {
  if (!o) return [];
  return [
    {
      key: 'online',
      title: o.pagePart ? ONLINE_TITLE_PAGE : ONLINE_TITLE_JOIN,
      hint: o.pagePart
        ? 'Make your free web page, share your one link and QR poster, and see how people pay.'
        : 'Share your join link and QR poster, and see how people pay.',
      path: ONLINE_PATH,
      done: onlineDone(o),
      manual: false,
      alsoPaths: ['/settings/web-page', '/settings/payments', '/settings'],
    },
  ];
}

export function getStartedSteps(
  s: Pick<CrmSnapshot, 'plans' | 'members'>,
  ticked: ReadonlySet<StepKey>,
  online: OnlineState | null = null,
): Step[] {
  const active = s.members.filter((m) => !m.archived);
  const webPage = online?.pagePart === true;
  // R-525: the hints say the web page shows plans and timings only once that page is open (the page part is here).
  const plansHint = webPage ? 'Set the price of each plan and the joining fee. Your web page shows them too.' : 'Set the price of each plan and the joining fee.';
  const timingsHint = webPage ? 'Members see when you are open in their app, and your web page shows it too.' : 'Members see when you are open in their app.';
  return [
    { key: 'plans', title: 'Add your plans', hint: plansHint, path: '/plans', done: s.plans.some((p) => p.active), manual: false },
    { key: 'members', title: 'Bring in your members', hint: 'Add them one by one, or bring in an Excel list, like one saved from your old gym software.', path: '/members', done: active.length > 0, manual: false },
    // R-190 (owner, 30 Oct 2026): before the app link, so members first see the gym's own look.
    { key: 'brand', title: 'Add your logo and colours', hint: 'Members see your logo and colours in their app.', path: '/settings/branding', done: ticked.has('brand'), manual: true },
    { key: 'staff', title: 'Add your staff and trainers', hint: 'They sign in with their own mobile number and a code. A trainer sees only their own members.', path: '/settings/people', done: ticked.has('staff'), manual: true },
    // R-525 (owner, 14 Nov 2026): the gym page needs plans AND timings, so timings sit just before it. Ticks itself when
    // the Gym timings screen reads or saves the gym's real timings (it cannot be ticked by hand).
    { key: 'timings', title: 'Set your gym timings', hint: timingsHint, path: '/settings/timings', done: ticked.has('timings'), manual: false },
    ...onlineStep(online),
    { key: 'poster', title: 'Print the check-in poster', hint: 'Members scan it at the desk to check themselves in.', path: '/attendance/qr', done: ticked.has('poster'), manual: true },
    { key: 'app', title: 'Send members the app link', hint: 'This ticks itself when your first member joins in the app.', path: '/settings/invite', done: active.some((m) => Boolean(m.appUserId)), manual: false },
  ];
}

/** "2 of 5 done". PURE. */
export function stepsLine(steps: readonly Step[]): string {
  return `${steps.filter((x) => x.done).length} of ${steps.length} done`;
}

/**
 * Owner, 1 Nov 2026: the Get started step a screen belongs to (its own path, or a page under it:
 * "/members/<id>" after adding a member is still the members step). PURE.
 */
export function stepForPath(steps: readonly Step[], path: string): Step | null {
  const p = cleanPath(path);
  return steps.find((s) => p === s.path || p.startsWith(`${s.path}/`)) ?? steps.find((s) => s.alsoPaths?.includes(p)) ?? null;
}

function cleanPath(path: string): string {
  return path.split('?')[0]!.replace(/\/+$/, '') || '/';
}

/** R-571: is this one of the step's other screens (not its own)? There the bar says "Back to" the step. PURE. */
export function isAlsoPath(step: Step, path: string): boolean {
  const p = cleanPath(path);
  return p !== step.path && !p.startsWith(`${step.path}/`) && Boolean(step.alsoPaths?.includes(p));
}

/**
 * The next step still to do after `key`, in the list's order, starting again at the top; never
 * `key` itself. Null when every other step is done. PURE.
 */
export function nextStepAfter(steps: readonly Step[], key: StepKey): Step | null {
  const at = steps.findIndex((s) => s.key === key);
  for (let i = 1; i < steps.length; i++) {
    const s = steps[(at + i) % steps.length]!;
    if (!s.done && s.key !== key) return s;
  }
  return null;
}
