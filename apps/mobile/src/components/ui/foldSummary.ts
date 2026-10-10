import { groupInt } from '@/lib/numberFormat';

/** A noun as "set", or with an irregular plural as { one: 'entry', other: 'entries' }. */
export type FoldNoun = string | { one: string; other: string };

/** "12 sets · see them" when folded shut, "12 sets · hide them" when open. */
export function foldSummary(count: number, noun: FoldNoun, open: boolean): string {
  const one = typeof noun === 'string' ? noun : noun.one;
  const other = typeof noun === 'string' ? `${noun}s` : noun.other;
  const word = count === 1 ? one : other;
  const them = count === 1 ? 'it' : 'them';
  return `${groupInt(count)} ${word} · ${open ? 'hide' : 'see'} ${them}`;
}
