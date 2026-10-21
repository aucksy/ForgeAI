/**
 * "Get started" on Today for a new gym (launch plan I5, 21 Oct 2026): the five first steps, in the
 * order an owner needs them. A step the records can prove ticks itself (plans, members, a member in
 * the app); the two the records cannot see (staff added, poster printed) tick when the owner says so.
 * The card goes when every step is done, or when the owner hides it. PURE.
 */
import type { CrmSnapshot } from '../data/adapter';

export type StepKey = 'plans' | 'members' | 'staff' | 'poster' | 'app';

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
    { key: 'plans', title: 'Add your plans', hint: 'Monthly, quarterly, yearly: prices and joining fee', path: '/plans', done: s.plans.some((p) => p.active), manual: false },
    { key: 'members', title: 'Bring in your members', hint: 'From GGMS or Excel, or add them one by one', path: '/members/import', done: active.length > 0, manual: false },
    { key: 'staff', title: 'Add your desk staff', hint: 'They sign in with their mobile and a code', path: '/settings/people', done: ticked.has('staff'), manual: true },
    { key: 'poster', title: 'Print the check-in poster', hint: 'Members scan it at the desk', path: '/settings/invite', done: ticked.has('poster'), manual: true },
    { key: 'app', title: 'Send members the app link', hint: 'Ticks itself when the first member joins in the app', path: '/settings/invite', done: active.some((m) => Boolean(m.appUserId)), manual: false },
  ];
}

/** "2 of 5 done". PURE. */
export function stepsLine(steps: readonly Step[]): string {
  return `${steps.filter((x) => x.done).length} of ${steps.length} done`;
}
