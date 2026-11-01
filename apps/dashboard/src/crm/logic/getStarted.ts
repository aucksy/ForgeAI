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

export type StepKey = 'plans' | 'members' | 'brand' | 'staff' | 'poster' | 'app';

export interface Step {
  key: StepKey;
  title: string;
  hint: string;
  path: string;
  done: boolean;
  /** True when the owner ticks it (the records cannot show it). */
  manual: boolean;
}

export function getStartedSteps(s: Pick<CrmSnapshot, 'plans' | 'members'>, ticked: ReadonlySet<StepKey>): Step[] {
  const active = s.members.filter((m) => !m.archived);
  return [
    { key: 'plans', title: 'Add your plans', hint: 'Set the price of each plan and the joining fee.', path: '/plans', done: s.plans.some((p) => p.active), manual: false },
    { key: 'members', title: 'Bring in your members', hint: 'Add them one by one, or bring them in from Excel or GGMS.', path: '/members', done: active.length > 0, manual: false },
    // R-190 (owner, 30 Oct 2026): before the app link, so members first see the gym's own look.
    { key: 'brand', title: 'Add your logo and colours', hint: 'Members see your logo and colours in their app.', path: '/settings/branding', done: ticked.has('brand'), manual: true },
    { key: 'staff', title: 'Add your desk staff', hint: 'They sign in with their own mobile number and a code.', path: '/settings/people', done: ticked.has('staff'), manual: true },
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
  const p = path.split('?')[0]!.replace(/\/+$/, '') || '/';
  return steps.find((s) => p === s.path || p.startsWith(`${s.path}/`)) ?? null;
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
