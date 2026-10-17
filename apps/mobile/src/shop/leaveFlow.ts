/**
 * UAT U-G1: leaving the gym with open orders. One flow for the Shop's Leave and for an invite
 * link's "Switch to <gym>" (which leaves the old gym too):
 *  1. ask the gym for its latest order list (at most a few seconds);
 *  2. the question says what is open ("You have 1 open order (₹450). Leaving cancels it." / "1 order
 *     is ready at the desk. Collect it or ask the desk to cancel it before you leave.");
 *  3. on yes, cancel every order still `ordered` FIRST, then leave;
 *  4. a cancel that fails never leaves: the member is told and can try again.
 * The words are gym.ts's (pure, tested); the calls are gymActions.ts's.
 */
import { askConfirm } from '@/components/ui';

import { leaveQuestion, switchQuestion, switchReachWords, type LeaveKind } from './gym';
import { cancelOpenOrdersBeforeLeave, freshOrdersSoon, joinFromInvite, leaveGym, type ActionWords } from './gymActions';
import { apiPreview } from './gymApi';
import { useGymShop } from './gymStore';

/** Cancel what is open, offering "Try again" while it fails. True = go on and leave. */
async function settleOpenOrders(kind: LeaveKind): Promise<boolean> {
  for (;;) {
    const r = await cancelOpenOrdersBeforeLeave(kind);
    if (r.kind === 'done') return true;
    if (r.kind === 'stop') {
      await askConfirm({ title: r.title, body: r.words, confirmLabel: 'OK', notice: true });
      return false;
    }
    const again = await askConfirm({
      title: "Your order isn't cancelled yet",
      body: r.words,
      confirmLabel: 'Try again',
      cancelLabel: 'Not now',
    });
    if (!again) return false;
  }
}

/** The Shop's Leave: ask (with what is open), cancel the open orders, then leave. */
export async function askAndLeaveGym(branded: boolean): Promise<void> {
  const link = useGymShop.getState().link;
  if (!link) return;
  await freshOrdersSoon();
  if (useGymShop.getState().link?.memberKey !== link.memberKey) return;
  const q = leaveQuestion({ gymName: link.gymName, branded, orders: useGymShop.getState().orders });
  const ok = await askConfirm({ ...q, destructive: true });
  if (!ok) return;
  if (!(await settleOpenOrders('leave'))) return;
  await leaveGym();
}

/**
 * An invite link's "Switch to <gym>": when the old gym still has open orders, ask first and cancel
 * them; then join the new gym (which lets the old one go). 'stayed' = the member did not switch
 * (said Stay, or the cancel could not be done and they gave up); else the join's own words or null.
 */
export async function askAndSwitchGym(code: string, name: string, toGym: string): Promise<ActionWords | 'stayed'> {
  const link = useGymShop.getState().link;
  if (link) {
    await freshOrdersSoon();
    // The member changed meanwhile (left, or joined elsewhere): this switch is not theirs any more.
    if (useGymShop.getState().link?.memberKey !== link.memberKey) return 'stayed';
    const q = switchQuestion({ fromGym: link.gymName, toGym, orders: useGymShop.getState().orders });
    if (q) {
      if (!(await askConfirm({ ...q, destructive: true }))) return 'stayed';
      // U-G6: the new gym must answer BEFORE the old gym's orders are cancelled.
      const reach = switchReachWords(await apiPreview(code), link.gymName);
      if (reach) return reach;
      if (!(await settleOpenOrders('switch'))) return 'stayed';
    }
  }
  return joinFromInvite(code, name);
}
