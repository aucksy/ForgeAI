/**
 * Launch plan D5/D6 (21 Oct 2026, owner R-45: 18+ for the trial): before a member joins a gym they
 * tick one box: 18 or older, and they agree to MettleUp's terms and privacy notice. PURE: the words and
 * the links, shared by the invite-link screen's join and (D7, owner 10 Nov 2026, "all as recommended")
 * "Continue with Google" on the welcome screen and in Settings → Backup and restore, so all of them ask
 * the same thing in the same words.
 *
 * 10 Nov 2026 (privacy audit row 43): the pages moved to mettleup.fit (deploy/panel/hosts.js serves
 * /privacy.html and /terms.html there; the old forgeai.aakashpahuja.in address still serves them too).
 */
export const LEGAL_BASE = 'https://mettleup.fit';
export const PRIVACY_URL = `${LEGAL_BASE}/privacy.html`;
export const TERMS_URL = `${LEGAL_BASE}/terms.html`;

export const AGREE_LABEL = "I'm 18 or older, and I agree to MettleUp's terms and privacy notice";
// member-words (10 Nov 2026, fresh-reader check): say where the box is; name both documents, as the box does.
export const AGREE_NEEDED = 'Please tick the box above. You need to be 18 or older and agree to the terms and privacy notice.';

/** Join may go ahead only with the box ticked. */
export function agreementWords(agreed: boolean): string | null {
  return agreed ? null : AGREE_NEEDED;
}

// ---------------------------------------------------------------- D7: the tick at Google sign-in

/**
 * The terms the tick agrees to (the day the owner approved them). Raise it only when the terms or the
 * privacy notice change so much that every member must tick again; an older record then asks once more.
 */
export const TERMS_AGREED_VERSION = '2026-11-10';

/**
 * The `meta` key that remembers the tick on this phone. In `meta` on purpose: "Erase all data" and
 * "Load demo data" wipe it with everything else, so a phone started over asks again.
 */
export const AGREED_KEY = 'terms_agreed';

/** What is kept when the box is ticked: which terms, and when (ms). PURE. */
export function agreementRecord(nowMs: number, version: string = TERMS_AGREED_VERSION): string {
  return JSON.stringify({ v: version, at: nowMs });
}

/** Did this phone already tick the box for these terms? Anything unreadable counts as no. PURE. */
export function agreementKept(raw: string | null | undefined, version: string = TERMS_AGREED_VERSION): boolean {
  if (!raw) return false;
  try {
    const r: unknown = JSON.parse(raw);
    if (r == null || typeof r !== 'object') return false;
    const o = r as { v?: unknown; at?: unknown };
    return o.v === version && typeof o.at === 'number' && Number.isFinite(o.at);
  } catch {
    return false;
  }
}

/**
 * May Google's sign-in start? Yes when the box was ticked before on this phone (`kept`) or is ticked
 * now; otherwise the line to show under the button (the same line as the gym join's). PURE.
 */
export function signInAgreementWords(i: { kept: boolean; ticked: boolean }): string | null {
  return i.kept || i.ticked ? null : AGREE_NEEDED;
}
