/**
 * R-561 (owner, 15 Nov 2026): "each payment notification gets its own colour ... so the owner can single them out".
 * A payment notice's colour, mark and small "Payment" label (logic/bellGroups.ts paymentTone), in the bell panel and on
 * Today's "Latest from your members". Colour, mark and words together, never the colour alone.
 */
import type { ReactNode } from 'react';

import { t } from '../lang/lang';
import { PAY_WORDS, type PayTone } from '../logic/bellGroups';
import { color, font, radius } from './kit';

/** A payment notice's colour, mark and words (colour is never the only sign). */
const PAY_LOOK: Record<PayTone, { ink: string; edge: string; words: string; mark: ReactNode }> = {
  paid: {
    ink: color.goodText,
    edge: color.good,
    words: PAY_WORDS.paid,
    // A tick in a circle.
    mark: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.6 2.6L16 9.6" />
      </>
    ),
  },
  check: {
    ink: color.warning,
    edge: color.warning,
    words: PAY_WORDS.check,
    // A clock: waiting for someone to check the bank.
    mark: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  problem: {
    ink: color.criticalText,
    edge: color.critical,
    words: PAY_WORDS.problem,
    // A warning sign.
    mark: (
      <>
        <path d="M12 3.5 2.8 19.5h18.4L12 3.5z" />
        <path d="M12 10v4.2M12 17.2v.1" />
      </>
    ),
  },
};

/** The tint behind a payment notice: the tone's colour, faint, in either theme. */
const tint = (c: string) => `color-mix(in srgb, ${c} 13%, transparent)`;

/** The small "Payment" label with its mark; the tone in words for a screen reader. */
export function PaymentTag({ tone }: { tone: PayTone }) {
  const look = PAY_LOOK[tone];
  return (
    <span
      data-pay-tone={tone}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px 1px 5px',
        borderRadius: radius.pill,
        border: `1px solid ${look.edge}`,
        color: look.ink,
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {look.mark}
      </svg>
      {t(PAY_WORDS.label)}
      <span style={visuallyHidden}>{`: ${t(look.words)}`}</span>
    </span>
  );
}

/** The row style of a payment notice (the bell and Today's "Latest from your members" share it). */
export function paymentRowLook(tone: PayTone): { borderLeft: string; background: string } {
  const look = PAY_LOOK[tone];
  return { borderLeft: `3px solid ${look.edge}`, background: tint(look.edge) };
}


const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
