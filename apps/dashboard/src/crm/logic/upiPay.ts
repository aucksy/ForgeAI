/**
 * Launch audit 3 Nov 2026 (owner side #4): the fee reminder said "pay on UPI" with no UPI ID, so a
 * member could not pay without calling the gym. The owner now types the gym's UPI ID once (Settings
 * -> Gym details), and the fee-due, renewal and receipt WhatsApp messages carry it in words AND as a
 * upi://pay link with the exact amount.
 *
 * Why both: a upi:// link opens GPay / PhonePe / Paytm with the amount filled in when the phone makes
 * it tappable, but WhatsApp does not always make a non-web link tappable. The UPI ID in plain words
 * always works: the member copies it into their UPI app.
 *
 * The UPI ID lives on the gym's own details record (crm_records kind 'gym', a JSON document), so no
 * database change was needed. PURE.
 */

import { formatINR, type Paise } from './money';

/** name@bank: letters, digits, dot, dash, underscore before the @; a bank handle after it. */
const UPI_ID = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/;

/** The UPI ID as kept: trimmed, lower case, spaces removed. Empty -> null. PURE. */
export function cleanUpiId(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/\s+/g, '').toLowerCase();
  return v ? v : null;
}

/** What is wrong with a typed UPI ID, in words, or null when it is fine (or left empty). PURE. */
export function upiIdError(raw: string | null | undefined): string | null {
  const v = cleanUpiId(raw);
  if (!v) return null;
  if (!v.includes('@')) return 'A UPI ID has an @ in it, like irontemple@okhdfc.';
  if (!UPI_ID.test(v)) return 'This does not look like a UPI ID. Type it like irontemple@okhdfc.';
  return null;
}

/** A usable UPI ID, or null. PURE. */
export function validUpiId(raw: string | null | undefined): string | null {
  const v = cleanUpiId(raw);
  return v && UPI_ID.test(v) ? v : null;
}

/** "1500.00": the amount a UPI link carries (rupees, two decimals). PURE. */
export function upiAmount(amountP: Paise): string {
  return (Math.round(amountP) / 100).toFixed(2);
}

/** Letters a UPI app shows safely in the payee name and note (no symbols, at most 40). */
function plain(text: string, max = 40): string {
  return text.replace(/[^A-Za-z0-9 .,-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * upi://pay?pa=<id>&pn=<payee>&am=<amount>&cu=INR&tn=<note> (NPCI's deep link). The @ stays as it is:
 * some UPI apps do not read %40. PURE.
 */
export function upiPayLink(o: { upiId: string; payee: string; amountP: Paise; note?: string }): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%40/g, '@');
  const parts = [
    `pa=${enc(o.upiId)}`,
    `pn=${enc(plain(o.payee) || 'Gym')}`,
    `am=${upiAmount(o.amountP)}`,
    'cu=INR',
  ];
  const note = o.note ? plain(o.note, 50) : '';
  if (note) parts.push(`tn=${enc(note)}`);
  return `upi://pay?${parts.join('&')}`;
}

/**
 * The two lines added to a message: who to pay and how much, then the link. Null when the gym has
 * no usable UPI ID or there is nothing to pay. PURE.
 */
export function payLines(
  o: { upiId: string | null | undefined; payee: string; amountP: Paise; note?: string },
  lang: 'en' | 'hi',
): string[] | null {
  const id = validUpiId(o.upiId);
  if (!id || !(o.amountP > 0)) return null;
  const link = upiPayLink({ upiId: id, payee: o.payee, amountP: o.amountP, note: o.note });
  const amount = formatINR(o.amountP);
  return lang === 'hi'
    ? [`UPI से ${amount} इस UPI ID पर भेजें: ${id}। या पेमेंट के लिए यह लिंक दबाएँ:`, link]
    : [`Pay ${amount} on UPI to ${id}. Or tap this link to pay:`, link];
}

/**
 * UAT 5 Nov 2026 (money): Settings -> Gym details keeps what is typed in its own boxes. When a
 * different gym opens under it (Load demo gym, Erase and start fresh), the boxes must start again from
 * THAT gym, or "Save details" would put the old gym's UPI ID (and name) on the new one. PURE.
 */
export function gymFormKey(gym: { gymId: string; createdAt: number }): string {
  return `${gym.gymId}:${gym.createdAt}`;
}

/** The Gym details boxes, filled from one gym's saved details. PURE. */
export function gymDetailsForm(gym: {
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  upiId?: string | null;
}): { name: string; phone: string; address: string; gstin: string; upiId: string } {
  return { name: gym.name, phone: gym.phone ?? '', address: gym.address ?? '', gstin: gym.gstin ?? '', upiId: gym.upiId ?? '' };
}
