/**
 * Whole numbers grouped the PHONE's way (audit PG-22): "2,28,288" on an Indian phone,
 * "228,288" elsewhere. Every full number a member reads goes through here (`fmtInt`,
 * `fmtVol`).
 *
 * Only the GROUPING STYLE comes from the phone (Indian lakh grouping or Western). The digits
 * are always Latin and the separator always ",": a Marathi or Bengali phone would otherwise
 * get its own digits ("२,२८,२८८"), and a German one "1.250 kg" beside the app's own
 * "102.5 kg" — a thousand that reads like a decimal. Built by hand, so it never depends on
 * what Hermes' Intl supports. PURE apart from reading the phone's locale once.
 */
export type Grouping = 'indian' | 'western';

/** Regions that group in lakhs and crores. */
const INDIAN_REGIONS = new Set(['IN', 'BD', 'NP', 'PK', 'LK', 'BT']);
/** Indian languages: lakh grouping even when the locale names no region ("mr", "hi"). */
const INDIAN_LANGUAGES = new Set(['hi', 'mr', 'bn', 'ta', 'te', 'kn', 'ml', 'gu', 'pa', 'or', 'as', 'ur', 'ne', 'kok', 'sa']);

/** The grouping style a locale tag ("en-IN", "mr-IN-u-nu-deva", "de-DE") uses. PURE. */
export function groupingForLocale(locale: string | null | undefined): Grouping {
  const parts = (locale ?? '').replace(/_/g, '-').split('-u-')[0].split('-');
  const lang = (parts[0] ?? '').toLowerCase();
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase() ?? null;
  if (region && INDIAN_REGIONS.has(region)) return 'indian';
  if (!region && INDIAN_LANGUAGES.has(lang)) return 'indian';
  return 'western';
}

/** A whole number with "," between groups, Latin digits, in the given style. PURE. */
export function groupIntAs(n: number, grouping: Grouping): string {
  const v = Math.round(n);
  if (!Number.isFinite(v)) return String(v);
  const neg = v < 0;
  const digits = String(Math.abs(v));
  let out: string;
  if (grouping === 'indian' && digits.length > 3) {
    const head = digits.slice(0, -3);
    out = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}`;
  } else {
    out = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return neg && v !== 0 ? `-${out}` : out;
}

/** The phone's locale tag, or null when it can't be read. */
export function phoneLocale(): string | null {
  try {
    return new Intl.NumberFormat().resolvedOptions().locale ?? null;
  } catch {
    try {
      return new Intl.DateTimeFormat().resolvedOptions().locale ?? null;
    } catch {
      return null;
    }
  }
}

let grouping: Grouping | undefined;

/** A whole number grouped the phone's way (see the file note). */
export function groupInt(n: number): string {
  if (grouping === undefined) grouping = groupingForLocale(phoneLocale());
  return groupIntAs(n, grouping);
}
