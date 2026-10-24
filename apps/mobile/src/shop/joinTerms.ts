/**
 * Launch plan D5/D6 (21 Oct 2026, owner R-45: 18+ for the trial): before a member joins a gym they
 * tick one box: 18 or older, and they agree to ForgeAI's terms and privacy notice (both in
 * docs/launch/, published on the admin app's site). PURE: the words and the links, shared by the
 * Shop tab's join card and the invite-link screen, so both ask the same thing.
 */
export const LEGAL_BASE = 'https://forgeai.aakashpahuja.in';
export const PRIVACY_URL = `${LEGAL_BASE}/privacy.html`;
export const TERMS_URL = `${LEGAL_BASE}/terms.html`;

export const AGREE_LABEL = "I'm 18 or older, and I agree to MettleUp's terms and privacy notice";
export const AGREE_NEEDED = "Tick the box first: you must be 18 or older and agree to the terms.";

/** Join may go ahead only with the box ticked. */
export function agreementWords(agreed: boolean): string | null {
  return agreed ? null : AGREE_NEEDED;
}
