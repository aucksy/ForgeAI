/**
 * Aadhaar and PAN numbers in an old file are never imported (Project Tracker #47, decided with option
 * A, 23 Oct 2026; DPDP data minimisation). PURE, no imports, so both the import (importMembers.ts) and
 * the AI step (aiImport.ts) use it.
 *
 *  - A whole column of them (by its name, or because most of its cells are one) is left out, and the
 *    screen says so.
 *  - One inside a cell that IS imported (notes, address, an extra detail) is cut out of the text, and
 *    the row says so.
 *
 * An Aadhaar number is 12 digits, never starting 0 or 1, with a Verhoeff check digit (UIDAI): the
 * check is what stops a 12-digit amount or a +91 mobile from being taken for one.
 */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** The Verhoeff check over a string of digits (the last one is the check digit). */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i += 1) c = D[c]![P[i % 8]![Number(rev[i])]!]!;
  return c === 0;
}

/** 12 digits (spaces or dashes between groups allowed), not starting 0 or 1, check digit right. */
export function isAadhaar(text: string): boolean {
  const t = text.trim();
  if (!/^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(t)) return false;
  const digits = t.replace(/\D/g, '');
  // Review of #47: "91" + a 10-digit mobile written as one number is a mobile, not an Aadhaar
  // (about 1 in 10 of them pass the check digit by chance). Written 4-4-4 it is still an Aadhaar.
  if (/^91[6-9]\d{9}$/.test(t)) return false;
  return /^[2-9]/.test(digits) && verhoeffValid(digits);
}

/** A masked Aadhaar as UIDAI prints it: XXXX XXXX 1234. */
const MASKED_AADHAAR = /^[xX*]{4}[\s-]?[xX*]{4}[\s-]?\d{4}$/;
/** PAN: five letters, four digits, one letter (ABCDE1234F). */
const PAN = /^[A-Za-z]{5}\d{4}[A-Za-z]$/;

export type IdKind = 'aadhaar' | 'pan';

/** Is this whole cell an ID number? PURE. */
export function idNumberKind(text: string): IdKind | null {
  const t = text.trim();
  if (isAadhaar(t) || MASKED_AADHAAR.test(t)) return 'aadhaar';
  if (PAN.test(t)) return 'pan';
  return null;
}

/** A column NAME that says it holds ID numbers (English, Hinglish, Hindi), already lower case. */
const ID_HEADER = /(^|[^\p{L}])(aadhaar|aadhar|adhaar|adhar|aadhar card|uid|uidai|pan|pan card|pan no|pancard|आधार|पैन)([^\p{L}]|$)/u;

export function isIdHeader(header: string): boolean {
  return ID_HEADER.test(header.toLowerCase());
}

/**
 * Is this column ID numbers? Only by what is IN it: 60% of its filled cells are an Aadhaar or a PAN.
 * Review of #47: a NAME alone ("Name as per Aadhaar", "Aadhaar linked mobile", "Member UID") is not
 * enough; such a column only gets a note (`isIdHeader`), and any ID number in it is cut out anyway.
 * PURE.
 */
export function idColumnKind(cells: readonly string[]): IdKind | null {
  const filled = cells.map((c) => c.trim()).filter(Boolean);
  if (filled.length === 0) return null;
  const kinds = filled.map(idNumberKind);
  const aadhaar = kinds.filter((k) => k === 'aadhaar').length;
  const pan = kinds.filter((k) => k === 'pan').length;
  if (aadhaar / filled.length >= 0.6) return 'aadhaar';
  if (pan / filled.length >= 0.6) return 'pan';
  return null;
}

const AADHAAR_IN_TEXT = /(?<![\d+])(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}|[xX*]{4}[\s-]?[xX*]{4}[\s-]?\d{4})(?!\d)/g;
const PAN_IN_TEXT = /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/g;

export const ID_REMOVED = '[ID number removed]';

/**
 * Cut any Aadhaar or PAN number out of a piece of text (a note, an address, an extra detail).
 * `removed` says whether anything was cut. PURE.
 */
export function scrubIds(text: string): { text: string; removed: boolean } {
  let removed = false;
  let out = text.replace(AADHAAR_IN_TEXT, (m) => {
    if (!isAadhaar(m) && !MASKED_AADHAAR.test(m)) return m;
    removed = true;
    return ID_REMOVED;
  });
  out = out.replace(PAN_IN_TEXT, () => {
    removed = true;
    return ID_REMOVED;
  });
  return { text: out, removed };
}
