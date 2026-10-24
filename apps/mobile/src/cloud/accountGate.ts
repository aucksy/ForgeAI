/**
 * Who is offered the member account (the server copy: "Keep your workouts on MettleUp" and the
 * welcome screen's "Continue with Google"). Owner R-106, 24 Oct 2026: it is for GYM MEMBERS ONLY,
 * because server space costs money; a member without a gym keeps Google Drive backup, which lives
 * in their own Google account.
 *
 * - Never in a build that cannot sign in (no real Google client id or no server: config.ts), as before.
 * - Offered when this phone is linked to a gym, or a gym code waits to be joined (the welcome
 *   screen's "Have a gym code?" or a gym's link tapped before setup: shop/pendingInvite.ts).
 * - Someone already signed in keeps the card after leaving the gym, so they can still bring their
 *   copy back, sign out or delete the account (nothing on the server is ever out of their reach).
 *
 * Separate from the free plan's limits (limits.ts, OFF by the server's flag): this rule always applies.
 * PURE.
 */
export interface AccountGateInput {
  /** The build can sign in (useAccount.configured). */
  configured: boolean;
  /** This phone is linked to a gym (useGymShop link). */
  inGym: boolean;
  /** A gym code is kept, waiting to be joined after setup. */
  gymCodeWaiting?: boolean;
  /** A member account is signed in on this phone. */
  signedIn?: boolean;
}

export function accountOffered(i: AccountGateInput): boolean {
  if (!i.configured) return false;
  return i.inGym || i.gymCodeWaiting === true || i.signedIn === true;
}
