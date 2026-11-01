/**
 * R-263 (owner, 1 Nov 2026): the Gym tab's no-gym screen says what MettleUp for gyms is, and a member
 * training without a gym (or whose gym is not on MettleUp) can recommend it to their gym, the same
 * funnel as the member website's "Recommend MettleUp to your gym" block (F184). The link carries
 * ?from=member, so the gym owner's lead shows "from a member's shared link" in HQ.
 * Owner rule (same day): complete, simple sentences only; never clipped phrases.
 * Pure: words and the share text only; ShopScreen opens the phone's share menu.
 */

export const RECOMMEND_LINK = 'https://gyms.mettleup.fit/?from=member';

export const RECOMMEND_TITLE = 'Is your gym not on MettleUp yet?';

export const RECOMMEND_BODY =
  "MettleUp is also software that gym owners use to run their gym. It handles memberships and check-in at the desk, and it can also run the gym's shop. Every member of a MettleUp gym gets every feature of this app free, and can also get their trainer's workout plans in it.";

export const RECOMMEND_BUTTON = 'Recommend MettleUp to my gym';

/** What the share menu sends to the gym owner (WhatsApp and the rest). Same words as the website. */
export function recommendMessage(): string {
  return `Our gym could use MettleUp. MettleUp is software that runs a gym: it handles memberships and check-ins, and it can also run a shop. Every member also gets a free workout app. Have a look: ${RECOMMEND_LINK}`;
}
