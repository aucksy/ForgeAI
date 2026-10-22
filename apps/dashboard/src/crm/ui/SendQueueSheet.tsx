/**
 * WhatsApp "send to next" for a group (Messages & offers step 1, 22 Oct 2026): "1 of 52: Rahul
 * Sharma [Open WhatsApp] [Skip]". Each tap opens the owner's own WhatsApp on that member with the
 * words typed in (shop/invite.ts `whatsAppHref`), marks them done and moves to the next one not done.
 * Who was done is remembered in this browser for this gym and this message (logic/sendQueue.ts), so
 * a reload or a break carries on; changed words start the list again.
 */

import { useState } from 'react';

import { browserStore, clearDone, nextNotDone, queueList, readDone, saveDone } from '../logic/sendQueue';
import { whatsAppHref } from '../shop/invite';
import { useCrm } from '../store';
import type { MemberView } from '../types';
import { Button, Sheet, color, font, radius, space } from './kit';

const body = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function SendQueueSheet({
  group,
  textFor,
  signature,
  onePerNumber,
  onClose,
}: {
  /** The people to go through (any order: the list is A to Z). */
  group: readonly MemberView[];
  /** The words for one member (the same for all, or their own). */
  textFor: (v: MemberView) => string;
  /** Fingerprint of the message (logic/sendQueue.ts `messageSignature`): new words, a new list. */
  signature: string;
  /** The same words for all: a shared number gets them once. False for personal messages. */
  onePerNumber: boolean;
  onClose: () => void;
}) {
  const { snapshot } = useCrm();
  const gymId = snapshot.gym.gymId;
  // The list as it was when the sheet opened: sending changes nothing in it, and a live list would
  // move people under the owner's thumb.
  const [list] = useState(() => queueList(group, onePerNumber));
  const { people, noPhone, sharedPhone } = list;
  const [done, setDone] = useState<Set<string>>(() => readDone(browserStore(), gymId, signature));
  const [at, setAt] = useState(() => nextNotDone(people, done, 0));

  const doneCount = people.filter((v) => done.has(v.member.id)).length;
  const v = at < people.length ? people[at] : undefined;
  const text = v ? textFor(v) : '';
  const href = v ? whatsAppHref(text, v.member.phone) : '';

  const markDone = (id: string) => {
    const next = new Set(done).add(id);
    setDone(next);
    saveDone(browserStore(), gymId, signature, next);
    setAt(nextNotDone(people, next, at + 1));
  };

  const leftOut = [
    noPhone > 0 ? `${noPhone} without a full mobile number left out` : '',
    sharedPhone > 0 ? `${sharedPhone} sharing a number with someone above, sent once` : '',
  ].filter(Boolean);

  return (
    <Sheet
      title="WhatsApp one by one"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={at === 0 || people.length === 0} onClick={() => setAt(Math.max(0, at - 1))}>
            Back
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {people.length === 0 ? (
        <p style={body}>Nobody in this group has a full mobile number.</p>
      ) : !v ? (
        <>
          <p role="status" style={{ ...body, color: color.ink, fontWeight: 700 }}>
            {doneCount === people.length
              ? `All ${people.length} done.`
              : `End of the list. ${people.length - doneCount} not sent yet.`}
          </p>
          {leftOut.length > 0 && <p style={{ ...body, marginTop: 4 }}>{leftOut.join(' · ')}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
            {doneCount < people.length && (
              <Button onClick={() => setAt(nextNotDone(people, done, 0))}>Go to the first one not sent</Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                clearDone(browserStore(), gymId, signature);
                setDone(new Set());
                setAt(0);
              }}
            >
              Start the list again
            </Button>
          </div>
        </>
      ) : (
        <>
          <p role="status" style={{ ...body, color: color.ink, fontWeight: 700, fontSize: 15 }}>
            {`${at + 1} of ${people.length}: ${v.member.fullName}`}
            {done.has(v.member.id) ? ' · done' : ''}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            {[`${doneCount} done so far`, ...leftOut].join(' · ')}
          </p>
          <div
            style={{
              marginTop: space.md,
              padding: space.md,
              borderRadius: radius.md,
              background: color.surfaceSunken,
              border: `1px solid ${color.border}`,
              fontFamily: font.body,
              fontSize: 14,
              color: color.ink,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {text}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: space.sm, marginTop: space.lg }}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open WhatsApp for ${v.member.fullName}`}
              onClick={(e) => {
                // Opened here, with THIS member's link, before the list moves on: letting the link
                // open by itself after the click could read the next member's link instead.
                e.preventDefault();
                window.open(href, '_blank', 'noopener');
                markDone(v.member.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 48,
                borderRadius: radius.pill,
                background: '#25D366',
                color: '#06280F',
                fontFamily: font.body,
                fontWeight: 800,
                fontSize: 15,
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              Open WhatsApp
            </a>
            <Button variant="ghost" full onClick={() => setAt(nextNotDone(people, done, at + 1))} ariaLabel={`Skip ${v.member.fullName}`}>
              Skip
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
