/**
 * WhatsApp with the words already typed (Gym Panel step 4). Two shapes:
 *  - WhatsAppSheet: one member — pick the message (fees, plan ending, ended, birthday, welcome),
 *    edit it, "Send on WhatsApp" opens the owner's WhatsApp on that member with it typed.
 *  - WhatsAppQueue: a whole list (a home tile's list, the fees-due list) one person at a time —
 *    "Send" then "Next", the way owners already work through a register. Sent ones are ticked.
 * The message goes from the owner's own WhatsApp, so there is no cost and no SMS credit.
 */

import { useCallback, useMemo, useState } from 'react';

import { tr } from '../i18n';
import { isBirthdayToday } from '../logic/homeTiles';
import { buildMessage, kindLabel, messageKindsFor, type MessageKind } from '../logic/whatsapp';
import { validateE164 } from '../logic/members';
import { whatsAppHref } from '../shop/invite';
import { useCrm } from '../store';
import type { MemberView } from '../types';
import { Button, ChipToggle, ErrorBanner, Sheet, TextField, color, font, radius, space } from './kit';

const body = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

function SendLink({ href, onSent, disabled }: { href: string; onSent?: () => void; disabled?: boolean }) {
  if (disabled) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onSent}
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
      }}
    >
      {tr('Send on WhatsApp', 'WhatsApp par bhejo')}
    </a>
  );
}

export function WhatsAppSheet({ view, onClose }: { view: MemberView; onClose: () => void }) {
  const { snapshot, today } = useCrm();
  const kinds = useMemo(() => messageKindsFor(view, isBirthdayToday(view.member.dateOfBirth, today)), [view, today]);
  const [kind, setKind] = useState<MessageKind>(kinds[0]);
  const [text, setText] = useState(() => buildMessage(kinds[0], view, snapshot.gym, today));
  const pick = (k: MessageKind) => {
    setKind(k);
    setText(buildMessage(k, view, snapshot.gym, today));
  };
  const phoneOk = validateE164(view.member.phone) !== null;
  return (
    <Sheet title={tr(`WhatsApp ${view.member.fullName}`, `${view.member.fullName} ko WhatsApp`)} onClose={onClose}>
      <ChipToggle
        label={tr('Which message', 'Kaunsa message')}
        value={kind}
        onChange={(v) => pick(v as MessageKind)}
        options={kinds.map((k) => ({ value: k, label: kindLabel(k) }))}
      />
      <TextField label={tr('Message (you can change it)', 'Message (badal sakte hain)')} value={text} onChange={setText} multiline />
      {!phoneOk && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>
            {tr(
              'This mobile number is not complete, so WhatsApp cannot open on it. Fix it on Edit.',
              'Yeh mobile number poora nahi hai, isliye WhatsApp nahi khulega. Badlo par jaakar theek karein.',
            )}
          </ErrorBanner>
        </div>
      )}
      <div style={{ marginTop: space.lg }}>
        <SendLink href={whatsAppHref(text, view.member.phone)} disabled={!phoneOk} />
      </div>
    </Sheet>
  );
}

export function WhatsAppQueue({ views, kind, onClose }: { views: MemberView[]; kind: MessageKind; onClose: () => void }) {
  const { snapshot, today } = useCrm();
  // The list as it was when the queue opened. Working through it changes it (a member who pays
  // drops off "fees due"), and a live list would skip people or point past its end.
  const [list] = useState(() => views);
  const people = useMemo(() => list.filter((v) => validateE164(v.member.phone) !== null), [list]);
  const skipped = list.length - people.length;
  const [at, setI] = useState(0);
  const i = Math.min(at, Math.max(0, people.length - 1));
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const v = people[i];
  const [edited, setEdited] = useState<Record<string, string>>({});
  const text = v ? edited[v.member.id] ?? buildMessage(kind, v, snapshot.gym, today) : '';
  const markSent = useCallback(() => {
    if (!v) return;
    setSent((s) => new Set(s).add(v.member.id));
  }, [v]);

  return (
    <Sheet
      title={tr(`${kindLabel(kind)} · one by one`, `${kindLabel(kind)} · ek-ek karke`)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))}>
            {tr('Back', 'Peeche')}
          </Button>
          {i < people.length - 1 ? (
            <Button onClick={() => setI(Math.min(people.length - 1, i + 1))}>{sent.has(v?.member.id ?? '') ? tr('Next', 'Agla') : tr('Skip', 'Chhodo')}</Button>
          ) : (
            <Button onClick={onClose}>{tr('Done', 'Ho gaya')}</Button>
          )}
        </>
      }
    >
      {people.length === 0 ? (
        <p style={body}>{tr('Nobody on this list has a full mobile number.', 'Is list mein kisi ka poora mobile number nahi hai.')}</p>
      ) : (
        <>
          <p style={{ ...body, color: color.ink, fontWeight: 700 }}>
            {tr(`${i + 1} of ${people.length}: ${v.member.fullName}`, `${people.length} mein se ${i + 1}: ${v.member.fullName}`)}
            {sent.has(v.member.id) ? tr(' · sent', ' · bheja') : ''}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            {tr(`${sent.size} sent so far`, `Ab tak ${sent.size} bheje`)}
            {skipped > 0 ? tr(` · ${skipped} without a full mobile number left out`, ` · ${skipped} ka poora number nahi, chhod diye`) : ''}
          </p>
          <TextField
            label={tr('Message (you can change it)', 'Message (badal sakte hain)')}
            value={text}
            onChange={(t) => setEdited((e) => ({ ...e, [v.member.id]: t }))}
            multiline
          />
          <div style={{ marginTop: space.lg }}>
            <SendLink href={whatsAppHref(text, v.member.phone)} onSent={markSent} />
          </div>
        </>
      )}
    </Sheet>
  );
}
