/**
 * WhatsApp with the words already typed (Gym Panel step 4). Two shapes:
 *  - WhatsAppSheet: one member — pick the message (fees, plan ending, ended, haven't seen you,
 *    birthday, years with us, welcome), edit it, "Send on WhatsApp" opens the owner's WhatsApp on
 *    that member with it typed.
 *  - WhatsAppQueue: a whole list (a home tile's list, the fees-due list) one person at a time —
 *    "Send" then "Next", the way owners already work through a register. Sent ones are ticked.
 * The message goes from the owner's own WhatsApp, so there is no cost and no SMS credit.
 * Messages & offers step 1 (22 Oct 2026): English · हिन्दी · Both, remembered (ui/MessageLanguage).
 */

import { useCallback, useMemo, useState } from 'react';

import { atRiskList } from '../logic/attendance';
import { isBirthdayToday } from '../logic/homeTiles';
import { buildMessage, kindLabel, messageKindsFor, yearsWithGym, type MessageKind } from '../logic/whatsapp';
import { validateE164 } from '../logic/members';
import { whatsAppHref } from '../shop/invite';
import { useCrm } from '../store';
import type { MemberView } from '../types';
import { Button, ChipToggle, ErrorBanner, Sheet, TextField, color, font, radius, space } from './kit';
import { LanguagePicker, useMessageLang } from './MessageLanguage';

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
      Send on WhatsApp
    </a>
  );
}

export function WhatsAppSheet({ view, onClose }: { view: MemberView; onClose: () => void }) {
  const { snapshot, today } = useCrm();
  const [lang, setLang] = useMessageLang();
  const kinds = useMemo(() => {
    // "Haven't seen you" only for a member on the Away list (logic/attendance.ts), the same rule as
    // Visits → Losing the habit; "Years with us" only on the day they joined, a year or more ago.
    const away = atRiskList(snapshot.members, snapshot.memberships, snapshot.visits, today).some((r) => r.member.id === view.member.id);
    return messageKindsFor(view, isBirthdayToday(view.member.dateOfBirth, today), {
      away,
      yearsWithGym: yearsWithGym(view.member.joinedOn, today),
    });
  }, [view, today, snapshot.members, snapshot.memberships, snapshot.visits]);
  const [kind, setKind] = useState<MessageKind>(kinds[0]);
  const [text, setText] = useState(() => buildMessage(kinds[0], view, snapshot.gym, today, lang));
  const pick = (k: MessageKind) => {
    setKind(k);
    setText(buildMessage(k, view, snapshot.gym, today, lang));
  };
  const phoneOk = validateE164(view.member.phone) !== null;
  return (
    <Sheet title={`WhatsApp ${view.member.fullName}`} onClose={onClose}>
      <ChipToggle
        label="Which message"
        value={kind}
        onChange={(v) => pick(v as MessageKind)}
        options={kinds.map((k) => ({ value: k, label: kindLabel(k) }))}
      />
      <div style={{ marginTop: space.md }}>
        <LanguagePicker
          value={lang}
          onChange={(l) => {
            setLang(l);
            setText(buildMessage(kind, view, snapshot.gym, today, l));
          }}
        />
      </div>
      <TextField label="Message (you can change it)" value={text} onChange={setText} multiline />
      {!phoneOk && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>
            This mobile number is not complete, so WhatsApp can’t open it. Tap Edit on their page to fix it.
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
  const [lang, setLang] = useMessageLang();
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
  const text = v ? edited[v.member.id] ?? buildMessage(kind, v, snapshot.gym, today, lang) : '';
  const markSent = useCallback(() => {
    if (!v) return;
    setSent((s) => new Set(s).add(v.member.id));
  }, [v]);

  return (
    <Sheet
      title={`${kindLabel(kind)} · one by one`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))}>
            Back
          </Button>
          {i < people.length - 1 ? (
            <Button onClick={() => setI(Math.min(people.length - 1, i + 1))}>{sent.has(v?.member.id ?? '') ? 'Next' : 'Skip'}</Button>
          ) : (
            <Button onClick={onClose}>Done</Button>
          )}
        </>
      }
    >
      {people.length === 0 ? (
        <p style={body}>Nobody on this list has a full mobile number.</p>
      ) : (
        <>
          <p style={{ ...body, color: color.ink, fontWeight: 700 }}>
            {`${i + 1} of ${people.length}: ${v.member.fullName}`}
            {sent.has(v.member.id) ? ' · sent' : ''}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            {`${sent.size} sent so far`}
            {skipped > 0 ? ` · ${skipped} without a full mobile number left out` : ''}
          </p>
          <div style={{ marginTop: space.md }}>
            <LanguagePicker
              value={lang}
              onChange={(l) => {
                setLang(l);
                // Words changed by hand were in the other language: start from the ready words.
                setEdited({});
              }}
            />
          </div>
          <TextField
            label="Message (you can change it)"
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
