/**
 * Who is offered the member account (the server copy: "Keep your workouts on MettleUp" and the
 * welcome screen's "Continue with Google").
 *
 * R-320 (owner, 4 Nov 2026: "Backups - Lets go with A"): the MettleUp account is THE one backup, for
 * EVERY member, gym or not. Before, R-106 (24 Oct) kept it for gym members only and left members
 * without a gym on Google Drive backup; Drive backup is no longer a choice, so a member without a gym
 * would have had no backup at all. The free database plan fits about 1,500 members (#50).
 *
 * - Never in a build that cannot sign in (no real Google client id or no server: config.ts), as before.
 * - Otherwise offered to everyone. The other inputs are kept so the callers read the same as before
 *   and a later rule (a paid plan, say) has them at hand.
 *
 * Separate from the free plan's limits (limits.ts, OFF by the server's flag). PURE.
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
  return i.configured;
}
