/**
 * R-561 (owner, 15 Nov 2026): "it should be a theme across the system that if you have different categories inside a
 * panel, then those category headings should be easy to notice." ONE look for every category heading: the side menu's
 * groups, the phone's More page, the bell panel's groups and the sheets with sections. Small capitals in full-strength
 * ink and heavy weight (the rows under it are lighter and not in capitals), a thin line above it and room above the
 * line, so a group starts where the line is. It reads as a label: no underline, no button shape, no accent colour.
 */
import type { CSSProperties, ReactNode } from 'react';

import { color, font, space } from './kit';

/** The heading's words: the same in every place (an element may add its own margin or padding). */
export const groupLabelText: CSSProperties = {
  fontFamily: font.body,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  // CSS capitals, so a screen reader says the word ("Members"), not the letters.
  textTransform: 'uppercase',
  color: color.ink,
  lineHeight: 1.3,
};

/** The thin line above a group and the room above it. `first`: the first group in its box, no line. */
export function groupLabelRule(first: boolean, roomAbove: number = space.lg): CSSProperties {
  return first ? {} : { borderTop: `1px solid ${color.border}`, marginTop: roomAbove, paddingTop: space.md };
}

/** A count beside the heading ("Your gym · 3"), in the same quiet pill everywhere. */
export function GroupCount({ n }: { n: number }) {
  return (
    <span
      data-group-count=""
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        borderRadius: 999,
        background: color.surfaceSunken,
        border: `1px solid ${color.border}`,
        color: color.ink,
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0,
        textTransform: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {n}
    </span>
  );
}

/** A category heading as an element of its own (h2 by default). */
export function GroupLabel({
  children,
  first = false,
  count,
  as: Tag = 'h2',
  id,
  roomAbove,
}: {
  children: ReactNode;
  first?: boolean;
  count?: number;
  as?: 'h2' | 'h3' | 'p';
  id?: string;
  roomAbove?: number;
}) {
  return (
    <Tag
      id={id}
      data-group-label=""
      style={{
        ...groupLabelText,
        ...groupLabelRule(first, roomAbove),
        margin: 0,
        marginBottom: space.sm,
        ...(first ? {} : { marginTop: roomAbove ?? space.lg }),
        display: 'flex',
        alignItems: 'center',
        gap: space.sm,
      }}
    >
      <span>{children}</span>
      {count !== undefined ? <GroupCount n={count} /> : null}
    </Tag>
  );
}
