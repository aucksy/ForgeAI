/**
 * Messages & offers (22 Oct 2026; was Shop → Messages, gym messages Phase 1): ready messages to
 * members, who gets them, and what was sent.
 *
 *  1. Pick a ready message (Gym news, Offers, Events, Personal) or write your own. The words are
 *     logic/messageTemplates.ts, in English · हिन्दी · Both, with boxes for the blanks (a day, a
 *     time, a festival from a list, an amount) instead of [brackets]. A letter count warns before the
 *     server's limits (60 and 300), and the offer limits (1 a day, 3 a week) are checked before
 *     sending.
 *  2. Who gets it: everyone, or a group worked out from the gym's own records (logic/audience.ts):
 *     "In the app: 34 members. Not in the app: 52." STEP 1 LIMIT: in the app it still goes to every
 *     app member (the server has no groups yet), and the screen says so for a smaller group.
 *  3. Send in the app (Gym news, Offers, Events; the server is 0008_gym_messages.sql), and/or
 *     WhatsApp one by one down the group (ui/SendQueueSheet.tsx). Personal messages (plan ending,
 *     plan ended, birthday, haven't seen you) are WhatsApp only, each member's own words.
 *
 * "Take back" removes a sent message from every inbox (a typo, a cancelled offer).
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  AUDIENCE_LABEL,
  AUDIENCE_TYPES,
  appPhones,
  audienceMembers,
  audiencePlans,
  phone10,
  reachOf,
  everyoneCount,
  startingAudience,
  withoutApp,
  type Audience,
  type AudienceData,
  type AudienceType,
} from '../logic/audience';
import { activeBatches } from '../logic/batches';
import { lengthState, lengthWords, letterCount } from '../logic/messageWords';
import {
  TEMPLATE_GROUPS,
  composeWords,
  isPersonal,
  missingSlots,
  templateById,
  templatesIn,
  whatsAppWords,
  type BroadcastTemplate,
  type Slot,
  type SlotValues,
  type TemplateGroup,
  type Words,
} from '../logic/messageTemplates';
import { countOf } from '../logic/plural';
import { browserStore, messageSignature, queueList, readDone } from '../logic/sendQueue';
import { buildMessage, signLine } from '../logic/whatsapp';
import { useCrm } from '../store';
import type { MemberView } from '../types';
import { LanguagePicker, useMessageLang } from '../ui/MessageLanguage';
import { SendQueueSheet } from '../ui/SendQueueSheet';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  Pill,
  SectionTitle,
  SelectField,
  TOUCH,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
  useIsCompact,
} from '../ui/kit';
import { Link } from '../ui/router';
import * as api from './api';
import { MutationGate, timeAgo, type AppMember } from './logic';
import {
  BODY_MAX,
  MESSAGE_KINDS,
  TITLE_MAX,
  capProblem,
  draftProblem,
  isCapped,
  isWaiting,
  kindLabel,
  messageErrorWords,
  seenText,
  sendAtFromLocal,
  whenWords,
  type MessageDraft,
  type MessageKind,
  type SentMessage,
} from './messages';
import { useOfferServer } from './offerServer';
import { usePoll, useShop } from './ShopProvider';

type GroupPick = TemplateGroup | 'custom';
type Scope = 'notInApp' | 'all';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary } as const;

export function MessagesSection({ startWith }: { startWith?: string }) {
  const { cloud, handleError, now } = useShop();
  const { snapshot, memberViews, today } = useCrm();
  const compact = useIsCompact();
  const key = cloud?.ownerKey ?? null;
  const [lang, setLang] = useMessageLang();
  // #49 step 2 (0025): a server that knows groups and times. Until then, exactly the step 1 page.
  const groups = useOfferServer(key) === 'yes';
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [laterText, setLaterText] = useState('');

  const opening = templateById(startWith);
  const [group, setGroup] = useState<GroupPick>(opening?.group ?? 'news');
  const [templateId, setTemplateId] = useState<string | null>(opening?.id ?? null);
  const [values, setValues] = useState<Record<string, string>>({});
  /** Words the owner changed by hand (a ready message), or wrote (their own). */
  const [manual, setManual] = useState<Words | null>(null);
  const [customKind, setCustomKind] = useState<MessageKind>('announcement');
  const [audience, setAudience] = useState<Audience>(() => startingAudience(opening?.audience ?? 'everyone', snapshot.plans));
  const [scopeChoice, setScopeChoice] = useState<Scope | null>(null);

  const [sent, setSent] = useState<SentMessage[] | null>(null);
  const [appMembers, setAppMembers] = useState<AppMember[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** The in-app message just sent (its fingerprint), so the same words are not sent twice. */
  const [sentSig, setSentSig] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  // A refresh that left before a Send or Take back must not paint the list as it was (logic.ts).
  const gate = useRef(new MutationGate()).current;

  const load = useCallback(async () => {
    if (!key) return;
    const stamp = gate.stamp();
    try {
      const [list, people] = await Promise.all([api.listMessages(key), api.listAppMembers(key)]);
      if (!gate.fresh(stamp)) return;
      setSent(list);
      setAppMembers(people);
    } catch (e) {
      setError(handleError(e));
    }
  }, [key, handleError, gate]);

  usePoll(load, 30_000, key !== null);

  // ------------------------------------------------ the message
  const template = templateById(templateId);
  const personal = template && isPersonal(template) ? template : null;
  const broadcast: BroadcastTemplate | null = template && !isPersonal(template) ? template : null;
  const custom = group === 'custom';
  const picked = custom || template !== null;

  const ready = useMemo(() => (broadcast ? composeWords(broadcast, values, lang) : null), [broadcast, values, lang]);
  const words: Words = manual ?? ready ?? { title: '', body: '' };
  const kind: MessageKind = custom ? customKind : (broadcast?.kind ?? 'announcement');
  const draft: MessageDraft = { kind, title: words.title, body: words.body };
  const missing = broadcast && !manual ? missingSlots(broadcast, values) : [];
  // Personal messages are each member's own words (logic/whatsapp.ts): nothing to fill in.
  const problem = personal ? null : missing.length > 0 ? `Fill in: ${missing.map((s) => s.label).join(', ')}.` : draftProblem(draft);
  const later = groups && when === 'later' ? sendAtFromLocal(laterText, now) : null;
  const cap = capProblem(kind, sent, now, later?.ok ? later.at : now);

  const gymName = snapshot.gym.name;
  const sign = signLine(snapshot.gym, lang === 'hi' ? 'hi' : 'en');
  const waText = whatsAppWords(words, sign);
  const signature = personal ? `personal:${personal.id}:${lang}:${today}` : messageSignature(waText);
  const draftSig = messageSignature(`${kind}\n${words.title}\n${words.body}`);
  const alreadySent = sentSig !== null && sentSig === draftSig;

  // ------------------------------------------------ who gets it
  const data: AudienceData = useMemo(
    () => ({ views: memberViews, members: snapshot.members, memberships: snapshot.memberships, visits: snapshot.visits, today }),
    [memberViews, snapshot.members, snapshot.memberships, snapshot.visits, today],
  );
  const target: Audience = useMemo(
    () => (personal ? { type: personal.audience } : audience),
    [personal, audience],
  );
  const groupMembers = useMemo(() => audienceMembers(target, data), [target, data]);
  const phones = useMemo(() => appPhones(appMembers ?? []), [appMembers]);
  const everyone = target.type === 'everyone';
  // 0025: the group's own app members (matched by mobile number, as the server matches check-ins).
  const groupAppIds = useMemo(() => {
    if (!groups || everyone) return null;
    const wanted = new Set(groupMembers.map((v) => phone10(v.member.phone)).filter((p): p is string => p !== null));
    return (appMembers ?? []).filter((a) => {
      const p = phone10(a.phone);
      return p !== null && wanted.has(p);
    }).map((a) => a.memberId);
  }, [groups, everyone, groupMembers, appMembers]);
  const baseReach = reachOf(target, groupMembers, phones, appMembers?.length ?? 0);
  const reach = groups ? { ...baseReach, widerInApp: false } : baseReach;
  const groupEmptyInApp = groupAppIds !== null && appMembers !== null && groupAppIds.length === 0;
  // A group send waits for the app-member list: until it is in, the group's app members are unknown.
  const groupLoading = groupAppIds !== null && appMembers === null;
  // "Not in the app" only when the app send can go (or went): a send limit that blocks it leaves the
  // members with the app to WhatsApp too (review fix).
  const appSendOpen = alreadySent || cap === null;
  const scope: Scope =
    personal || !cloud
      ? 'all'
      : (scopeChoice ?? ((everyone || groups) && reach.inApp > 0 && appSendOpen ? 'notInApp' : 'all'));
  const queueGroup = useMemo(
    () => (scope === 'notInApp' ? withoutApp(groupMembers, phones) : groupMembers),
    [scope, groupMembers, phones],
  );
  const queuePeople = useMemo(() => queueList(queueGroup, !personal).people, [queueGroup, personal]);
  // Read on every draw (a small list in this browser): closing the sheet redraws, so it is current.
  const remembered = readDone(browserStore(), snapshot.gym.gymId, signature);
  const doneHere = queuePeople.filter((v) => remembered.has(v.member.id)).length;

  const textFor = useCallback(
    (v: MemberView) => (personal ? buildMessage(personal.waKind, v, snapshot.gym, today, lang) : waText),
    [personal, snapshot.gym, today, lang, waText],
  );

  // ------------------------------------------------ actions
  const pickTemplate = (id: string) => {
    const t = templateById(id);
    if (!t) return;
    setTemplateId(id);
    setManual(null);
    setConfirming(false);
    setScopeChoice(null);
    setAudience(startingAudience(t.audience, snapshot.plans));
  };

  const pickCustom = (k: MessageKind) => {
    const start = MESSAGE_KINDS.find((x) => x.kind === k)!;
    setGroup('custom');
    setTemplateId(null);
    setCustomKind(k);
    setConfirming(false);
    // Starting words only replace what the owner has not written yet.
    setManual((m) => ({
      title: custom && m?.title.trim() ? m.title : start.title,
      body: custom && m?.body.trim() ? m.body : start.body,
    }));
  };

  const pickGroup = (g: GroupPick) => {
    if (g === 'custom') return pickCustom(customKind);
    setGroup(g);
    if (template?.group !== g) {
      setTemplateId(null);
      setManual(null);
    }
    setConfirming(false);
  };

  const setValue = (k: string, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setConfirming(false);
  };

  const editWords = (part: 'title' | 'body', v: string) => {
    setManual({ ...words, [part]: part === 'title' ? v.slice(0, TITLE_MAX + 20) : v.slice(0, BODY_MAX + 60) });
    setConfirming(false);
  };

  const send = async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const opts = groups ? { to: groupAppIds, sendAt: later?.ok ? later.iso : null } : {};
      const m = await gate.run(() => api.sendMessage(key, draft, opts));
      setSent((prev) => [m, ...(prev ?? [])]);
      setSentSig(draftSig);
      setConfirming(false);
      const who = m.recipients === 1 ? '1 member' : `${m.recipients} members`;
      setToast(m.sendAt !== null && m.sendAt > Date.now() ? `Goes out ${whenWords(m.sendAt)} to ${who} in the app.` : `Sent to ${who} in the app.`);
      window.setTimeout(() => setToast(null), 3000);
    } catch (e) {
      const words = messageErrorWords(e);
      setError(/BAD_KEY/.test(String((e as { message?: unknown })?.message ?? '')) ? handleError(e) : words);
      setConfirming(false);
      // A slow answer can come after the message was saved: look again before the owner re-sends.
      void load();
    } finally {
      setBusy(false);
    }
  };

  const takeBack = async (m: SentMessage) => {
    if (!key) return;
    if (!window.confirm(`Take back “${m.title}”? It is removed from every member’s inbox.`)) return;
    try {
      await gate.run(() => api.withdrawMessage(key, m.id));
      setSent((prev) => prev?.map((x) => (x.id === m.id ? { ...x, withdrawn: true } : x)) ?? prev);
    } catch (e) {
      setError(messageErrorWords(e));
    }
  };

  // ------------------------------------------------ group picker lists
  const plans = useMemo(() => audiencePlans(snapshot.plans), [snapshot.plans]);
  const batches = useMemo(() => activeBatches(memberViews.map((v) => v.member)), [memberViews]);
  // Counted once per change of the gym's records, not on every letter typed (the Away list reads
  // every check-in).
  const groupOptions = useMemo(
    () =>
      AUDIENCE_TYPES.filter((t) => (t === 'plan' ? plans.length > 0 : t === 'batch' ? batches.length > 0 : true)).map((t) => ({
        value: t,
        label:
          t === 'plan' || t === 'batch'
            ? `${AUDIENCE_LABEL[t]}…`
            : `${AUDIENCE_LABEL[t]} (${t === 'everyone' ? everyoneCount(data.views, phones, appMembers?.length ?? null) : audienceMembers({ type: t }, data).length})`,
      })),
    [plans, batches, data, phones, appMembers],
  );
  const planOptions = useMemo(
    () => plans.map((p) => ({ value: p.id, label: `${p.name} (${audienceMembers({ type: 'plan', planId: p.id }, data).length})` })),
    [plans, data],
  );
  const pickAudience = (t: AudienceType) => {
    setScopeChoice(null);
    setConfirming(false);
    if (t === 'plan') return setAudience({ type: 'plan', planId: audience.planId ?? plans[0]?.id ?? null });
    if (t === 'batch') return setAudience({ type: 'batch', batch: audience.batch ?? batches[0]?.key ?? null });
    setAudience({ type: t });
  };

  const pad = compact ? space.lg : undefined;
  const appCount = appMembers?.length ?? null;

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ------------------------------------------------ 1. pick */}
      <Card pad={pad} style={{ marginBottom: space.lg }}>
        <SectionTitle>Pick a message</SectionTitle>
        <ChipToggle
          label="Kind of message"
          wrap
          value={group}
          onChange={(v) => pickGroup(v as GroupPick)}
          options={[...TEMPLATE_GROUPS.map((g) => ({ value: g.value, label: g.label })), { value: 'custom', label: 'Write my own' }]}
        />
        <div
          role="group"
          aria-label={custom ? 'Type of message' : 'Ready messages'}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: space.sm, marginTop: space.md }}
        >
          {custom
            ? MESSAGE_KINDS.map((k) => (
                <ChoiceButton key={k.kind} label={k.label} pressed={customKind === k.kind} onClick={() => pickCustom(k.kind)} />
              ))
            : templatesIn(group).map((t) => (
                <ChoiceButton key={t.id} label={t.label} pressed={templateId === t.id} onClick={() => pickTemplate(t.id)} />
              ))}
        </div>
        {group === 'personal' && (
          <p style={{ ...quiet, marginTop: space.md }}>
            Sent on WhatsApp only, one member at a time, each with their own name and dates.
          </p>
        )}
      </Card>

      {picked && (
        <>
          {/* ------------------------------------------------ 2. the words */}
          <div
            style={{
              display: 'grid',
              gap: space.lg,
              gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)',
              alignItems: 'start',
              marginBottom: space.lg,
            }}
          >
            <Card pad={pad}>
              <SectionTitle>{personal ? personal.label : 'The words'}</SectionTitle>
              {!custom && (
                <>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>Language</div>
                  <LanguagePicker
                    value={lang}
                    onChange={(l) => {
                      setLang(l);
                      // The ready words in the new language (words changed by hand were in the old one).
                      if (broadcast) setManual(null);
                      setConfirming(false);
                    }}
                  />
                </>
              )}

              {broadcast && (
                <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', columnGap: space.md }}>
                  {broadcast.slots.map((s) => (
                    <SlotBox key={s.key} slot={s} values={values} setValue={setValue} planNames={plans.map((p) => p.name)} />
                  ))}
                </div>
              )}

              {!personal && (
                <>
                  <TextField label="Title" value={words.title} onChange={(v) => editWords('title', v)} placeholder="Gym closed on Sunday" />
                  <LetterCount text={words.title} max={TITLE_MAX} />
                  <TextField
                    label="Message"
                    value={words.body}
                    multiline
                    onChange={(v) => editWords('body', v)}
                    placeholder="A line or two members should know"
                  />
                  <LetterCount text={words.body} max={BODY_MAX} />
                  {broadcast && manual && (
                    <p style={{ ...quiet, marginTop: space.sm }}>
                      You changed the words by hand, so the boxes above no longer change them.{' '}
                      <button type="button" onClick={() => setManual(null)} style={linkButton}>
                        Use the boxes again
                      </button>
                    </p>
                  )}
                  {isCapped(kind) && (
                    <p style={{ ...quiet, marginTop: space.sm, fontSize: 12, color: color.inkMuted }}>
                      Members get at most one offer or event a day in the app, and three a week.
                    </p>
                  )}
                  {/* Not "Write a title." over an untouched page of your own: only once there are words. */}
                  {problem && !(custom && !words.title.trim() && !words.body.trim()) && (
                    <p role="status" style={{ ...quiet, marginTop: space.sm, color: color.warning }}>
                      {problem}
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card pad={pad}>
              <SectionTitle>{personal ? 'What a member gets' : 'What members see'}</SectionTitle>
              {personal ? (
                groupMembers[0] ? (
                  <WhatsAppPreview name={groupMembers[0].member.fullName} text={textFor(groupMembers[0])} />
                ) : (
                  <p style={quiet}>Nobody is in this list today.</p>
                )
              ) : (
                <InboxPreview draft={draft} gymName={cloud?.name ?? gymName} />
              )}
            </Card>
          </div>

          {/* ------------------------------------------------ 3. who gets it */}
          <Card pad={pad} style={{ marginBottom: space.xl }}>
            <SectionTitle>Who gets it</SectionTitle>
            {personal ? (
              <p style={{ ...quiet, fontSize: 14, color: color.ink }}>
                {`${AUDIENCE_LABEL[personal.audience]}: ${countOf(groupMembers.length, 'member')}.`}
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', columnGap: space.md, marginTop: -space.md }}>
                  <SelectField label="Group" value={audience.type} onChange={(v) => pickAudience(v as AudienceType)} options={groupOptions} />
                  {audience.type === 'plan' && (
                    <SelectField
                      label="Plan"
                      value={audience.planId ?? ''}
                      onChange={(v) => setAudience({ type: 'plan', planId: v })}
                      options={planOptions}
                    />
                  )}
                  {audience.type === 'batch' && (
                    <SelectField
                      label="Batch"
                      value={audience.batch ?? ''}
                      onChange={(v) => setAudience({ type: 'batch', batch: v })}
                      options={batches.map((b) => ({ value: b.key, label: `${b.name} (${b.countN})` }))}
                    />
                  )}
                </div>
                <div style={{ marginTop: space.md, display: 'grid', gap: 6 }}>
                  {cloud ? (
                    <>
                      <p style={{ ...quiet, fontSize: 14, color: color.ink }}>
                        {!everyone ? `In this group: ${countOf(reach.group, 'member')}. ` : ''}
                        {appCount === null
                          ? 'Counting who has the app…'
                          : groupAppIds !== null
                            ? `In the app: ${countOf(groupAppIds.length, 'member')} of this group. Not in the app: ${reach.notInApp}.`
                            : `In the app: ${countOf(reach.inApp, 'member')}. Not in the app: ${reach.notInApp}.`}
                      </p>
                      {groupEmptyInApp && (
                        <p role="note" style={{ ...quiet, color: color.warning }}>
                          Nobody in this group has the MettleUp app yet. Send it on WhatsApp.
                        </p>
                      )}
                      {reach.widerInApp && (
                        <p role="note" style={{ ...quiet, color: color.warning }}>
                          In the app this goes to everyone; for just this group, use WhatsApp.
                        </p>
                      )}
                      {appCount === 0 && (
                        <p style={quiet}>
                          No member has joined in the app yet. Send them your gym’s link (
                          <Link to="/settings/invite">
                            <span style={{ color: color.accentBright }}>Invite members</span>
                          </Link>
                          ). New members also see messages from the last 14 days.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{ ...quiet, fontSize: 14, color: color.ink }}>{`In this group: ${countOf(reach.group, 'member')}.`}</p>
                      <p style={quiet}>
                        The MettleUp member app is not turned on for your gym, so this goes on WhatsApp only.{' '}
                        <Link to="/shop">
                          <span style={{ color: color.accentBright }}>Turn it on</span>
                        </Link>
                      </p>
                    </>
                  )}
                </div>
              </>
            )}

            {/* In the app (not for personal messages: those are one member's own words). */}
            {!personal && cloud && (
              <div style={{ marginTop: space.lg, paddingTop: space.lg, borderTop: `1px solid ${color.border}` }}>
                <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink, marginBottom: space.sm }}>In the MettleUp app</div>
                {groups && !alreadySent && (
                  <div style={{ marginBottom: space.md }}>
                    <ChipToggle
                      label="When"
                      value={when}
                      onChange={(v) => {
                        setWhen(v === 'later' ? 'later' : 'now');
                        setConfirming(false);
                      }}
                      options={[
                        { value: 'now', label: 'Now' },
                        { value: 'later', label: 'Pick a day and time' },
                      ]}
                    />
                    {when === 'later' && (
                      <TextField
                        label="Day and time"
                        type="datetime-local"
                        value={laterText}
                        onChange={(v) => {
                          setLaterText(v);
                          setConfirming(false);
                        }}
                        error={laterText && later && !later.ok ? later.problem : null}
                        hint="India time. It appears in members' inbox then. You can cancel it until it goes."
                      />
                    )}
                  </div>
                )}
                {cap && (
                  <p role="status" style={{ ...quiet, color: color.warning, marginBottom: space.sm }}>
                    {cap}
                  </p>
                )}
                {groupLoading && !alreadySent && (
                  <p role="status" style={{ ...quiet, marginBottom: space.sm }}>
                    Still loading who in this group has the app…
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
                  {alreadySent ? (
                    <Pill tone="good">{later?.ok ? 'Timed in the app' : 'Sent in the app'}</Pill>
                  ) : !confirming ? (
                    <Button
                      disabled={busy || problem !== null || cap !== null || groupEmptyInApp || groupLoading || (later !== null && !later.ok)}
                      onClick={() => setConfirming(true)}
                    >
                      Send in the app
                    </Button>
                  ) : (
                    <>
                      <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink }}>
                        {groupAppIds !== null
                          ? `Goes to ${countOf(groupAppIds.length, 'member')} of this group in the app${later?.ok ? ` on ${whenWords(later.at)}` : ''}. Send ${later?.ok ? 'then' : 'now'}?`
                          : later?.ok
                            ? `Goes to every member in the app on ${whenWords(later.at)}. Send then?`
                            : appCount === 0
                              ? 'No member has the app yet. Members who join in the next 14 days will see it. Send now?'
                              : appCount === null
                                ? 'Goes to every member in the app. Send now?'
                                : reach.widerInApp
                                  ? `Goes to all ${countOf(appCount ?? 0, 'member')} in the app, not only this group. Send now?`
                                  : `Goes to ${countOf(appCount ?? 0, 'member')} in the app. Send now?`}
                      </span>
                      <Button disabled={busy} onClick={() => void send()}>
                        {busy ? 'Sending…' : 'Yes, send'}
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                        Not yet
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* On WhatsApp, one by one, from the owner's own phone. */}
            <div style={{ marginTop: space.lg, paddingTop: space.lg, borderTop: `1px solid ${color.border}` }}>
              <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink, marginBottom: space.sm }}>On WhatsApp</div>
              {!personal && cloud && reach.inApp > 0 && reach.notInApp > 0 && (
                <div style={{ marginBottom: space.md }}>
                  <ChipToggle
                    label="Send on WhatsApp to"
                    value={scope}
                    onChange={(v) => setScopeChoice(v as Scope)}
                    options={[
                      { value: 'notInApp', label: 'Not in the app', count: reach.notInApp },
                      { value: 'all', label: 'Whole group', count: reach.group },
                    ]}
                  />
                </div>
              )}
              <Button variant={personal || !cloud ? 'primary' : 'ghost'} disabled={problem !== null || queuePeople.length === 0} onClick={() => setQueueOpen(true)}>
                {`WhatsApp one by one (${queuePeople.length})`}
              </Button>
              <p style={{ ...quiet, marginTop: space.sm }}>
                {doneHere > 0
                  ? `${doneHere} of ${queuePeople.length} done on WhatsApp for this message.`
                  : 'Opens your own WhatsApp with the words typed in. It costs nothing.'}
              </p>
            </div>
          </Card>
        </>
      )}

      {queueOpen && (
        <SendQueueSheet
          group={queueGroup}
          textFor={textFor}
          signature={signature}
          onePerNumber={!personal}
          onClose={() => setQueueOpen(false)}
        />
      )}

      {/* ------------------------------------------------ sent */}
      {cloud && (
        <>
          <SectionTitle>Sent in the app</SectionTitle>
          {sent === null && !error ? (
            <Card>
              <EmptyState title="Loading…" />
            </Card>
          ) : sent && sent.length === 0 ? (
            <Card>
              <EmptyState title="Nothing sent yet" body="Messages you send in the app show here, with how many members have seen each one." />
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: space.sm }}>
              {(sent ?? []).map((m) => (
                <Card key={m.id} pad={space.lg} style={{ opacity: m.withdrawn ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginBottom: 6 }}>
                    <Pill tone={isCapped(m.kind) ? 'accent' : 'muted'}>{kindLabel(m.kind)}</Pill>
                    {m.toGroup && <Pill tone="muted">To a group</Pill>}
                    {m.withdrawn && <Pill tone="critical">{m.sendAt !== null && m.sendAt > m.createdAt ? 'Cancelled' : 'Taken back'}</Pill>}
                    <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{timeAgo(m.createdAt, now)}</span>
                  </div>
                  <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{m.title}</div>
                  {m.body && (
                    <div style={{ marginTop: 4, fontFamily: font.body, fontSize: 14, color: color.inkSecondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {m.body}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
                    <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
                      {isWaiting(m, now) && m.sendAt !== null ? `Goes out ${whenWords(m.sendAt)} · ${m.recipients === 1 ? '1 member' : `${m.recipients} members`}` : seenText(m)}
                    </span>
                    {!m.withdrawn &&
                      (isWaiting(m, now) ? (
                        <Button variant="quiet" onClick={() => void takeBack(m)} ariaLabel={`Cancel ${m.title}`}>
                          Cancel
                        </Button>
                      ) : (
                        <Button variant="quiet" onClick={() => void takeBack(m)} ariaLabel={`Take back ${m.title}`}>
                          Take back
                        </Button>
                      ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

const linkButton: React.CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: color.accentBright,
  textDecoration: 'underline',
  cursor: 'pointer',
};

/** A ready message (or a type of your own) to pick: a big target, pressed when picked. */
function ChoiceButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        appearance: 'none',
        minHeight: TOUCH,
        padding: '8px 12px',
        borderRadius: radius.md,
        border: `1px solid ${pressed ? 'transparent' : color.borderStrong}`,
        background: pressed ? color.accentSoft : 'transparent',
        color: pressed ? color.accentBright : color.ink,
        fontFamily: font.body,
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

/** "54 of 60 letters · 6 left", in the warning colour near the limit and red over it. */
function LetterCount({ text, max }: { text: string; max: number }) {
  const n = letterCount(text);
  const state = lengthState(n, max);
  return (
    <div
      aria-live="polite"
      style={{
        fontFamily: font.body,
        fontSize: 12,
        marginTop: 5,
        fontWeight: state === 'ok' ? 400 : 700,
        color: state === 'over' ? color.criticalText : state === 'near' ? color.warning : color.inkMuted,
      }}
    >
      {lengthWords(n, max)}
    </div>
  );
}

const OTHER = 'other';

/** One blank of a ready message, as a proper box: a date, a time, a list, an amount. */
function SlotBox({
  slot,
  values,
  setValue,
  planNames,
}: {
  slot: Slot;
  values: SlotValues;
  setValue: (key: string, value: string) => void;
  planNames: string[];
}) {
  const v = values[slot.key] ?? '';
  switch (slot.kind) {
    case 'day':
    case 'date':
      return <TextField label={slot.label} type="date" value={v} onChange={(x) => setValue(slot.key, x)} />;
    case 'time':
      return <TextField label={slot.label} type="time" value={v} onChange={(x) => setValue(slot.key, x)} />;
    case 'choice':
      return (
        <div style={{ minWidth: 0 }}>
          <SelectField
            label={slot.label}
            value={v}
            onChange={(x) => setValue(slot.key, x)}
            options={[{ value: '', label: 'Pick one' }, ...(slot.options ?? []).map((o) => ({ value: o.id, label: o.en })), { value: OTHER, label: 'Other (type it)' }]}
          />
          {v === OTHER && (
            <TextField label={`${slot.label}, in your words`} value={values[`${slot.key}.other`] ?? ''} onChange={(x) => setValue(`${slot.key}.other`, x.slice(0, 40))} />
          )}
        </div>
      );
    case 'amount':
      return <TextField label={slot.label} value={v} inputMode="numeric" prefix="₹" onChange={(x) => setValue(slot.key, x.replace(/\D/g, '').slice(0, 7))} />;
    case 'discount':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: space.sm, minWidth: 0 }}>
          <TextField label={slot.label} value={v} inputMode="numeric" onChange={(x) => setValue(slot.key, x.replace(/\D/g, '').slice(0, 7))} />
          <SelectField
            label="In"
            value={values[`${slot.key}.unit`] === '₹' ? '₹' : '%'}
            onChange={(x) => setValue(`${slot.key}.unit`, x)}
            options={[
              { value: '%', label: '%' },
              { value: '₹', label: '₹' },
            ]}
          />
        </div>
      );
    case 'days':
    case 'number':
      return <TextField label={slot.label} value={v} inputMode="numeric" onChange={(x) => setValue(slot.key, x.replace(/\D/g, '').slice(0, 3))} />;
    case 'plan':
      return planNames.length > 0 ? (
        <SelectField label={slot.label} value={v} onChange={(x) => setValue(slot.key, x)} options={[{ value: '', label: 'Pick one' }, ...planNames.map((n) => ({ value: n, label: n }))]} />
      ) : (
        <TextField label={slot.label} value={v} onChange={(x) => setValue(slot.key, x.slice(0, 40))} placeholder="Quarterly" />
      );
    case 'text':
      return <TextField label={slot.label} value={v} onChange={(x) => setValue(slot.key, x.slice(0, 40))} placeholder={slot.placeholder} />;
  }
}

/** The message as one card in the member's inbox (dark, like the app). */
function InboxPreview({ draft, gymName }: { draft: MessageDraft; gymName: string }) {
  return (
    <div style={{ background: '#07080C', borderRadius: radius.lg, padding: space.lg, border: `1px solid ${color.border}` }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: '#9097A8', marginBottom: space.sm }}>{gymName} · now</div>
      <div style={{ background: '#12141B', borderRadius: radius.md, padding: space.md }}>
        <div style={{ fontFamily: font.body, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: '#FF8B4A', marginBottom: 4 }}>
          {kindLabel(draft.kind)}
        </div>
        <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, color: '#F4F5F8', overflowWrap: 'anywhere' }}>
          {draft.title.trim() || 'Your title'}
        </div>
        <div style={{ marginTop: 4, fontFamily: font.body, fontSize: 13, color: '#B9BFCC', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {draft.body.trim() || 'Your message'}
        </div>
      </div>
    </div>
  );
}

/** One member's WhatsApp words, as a chat bubble. */
function WhatsAppPreview({ name, text }: { name: string; text: string }) {
  return (
    <>
      <p style={{ ...quiet, marginBottom: space.sm }}>{`For example, ${name}:`}</p>
      <div
        style={{
          background: '#0B2E1E',
          color: '#E9F5EE',
          borderRadius: radius.md,
          padding: space.md,
          fontFamily: font.body,
          fontSize: 14,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {text}
      </div>
    </>
  );
}
