/**
 * F109 "Training progress" (/trainer; OWNER-INBOX #46, DECIDED 24 Oct 2026). Who to talk to today and what to say: one
 * plain line per member ("New best: Leg press 120 kg × 10", "No workout for 9 days", "Asked for help today"), and two
 * ready WhatsApp messages ("Well done", "How's it going?").
 *
 * R-535 / R-537 (owner, 14 Nov 2026: one week says nothing; show whether they are progressing, as lines): each card
 * shows a 12-week line of workouts a week and one tag ("Getting stronger", "Steady", "Dropping", "Not enough data
 * yet") from the member's strength score, and opens `/trainer/<list member id>`: the member's full progress over
 * everything their app shares (ui/ProgressView.tsx). The list reads a member's workouts only when the card comes
 * into view, at most 3 at a time, so a long list stays light on a phone.
 *
 * A trainer (a person the owner ticked "Trainer") sees only the members the owner gave them; the owner sees every
 * member who shares, with their trainer. Only what the member's phone sends while "Share my workouts with my
 * trainers" is on: never body weight, photos or notes. Read on the gym's server (0050); hidden until it is there.
 * Rules and words: logic/trainerView.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../lang/lang';
import { progressTag } from '../../logic/progressTrend';
import {
  howIsItGoingMessage,
  memberLine,
  sortMembers,
  trainerErrorWords,
  weekBars,
  wellDoneMessage,
  type TrainerMember,
  type TrainerMembers,
} from '../../logic/trainerView';
import { whatsAppHref } from '../../shop/invite';
import { errorWords } from '../../shop/logic';
import * as questionsApi from '../../shop/questionsApi';
import * as trainerApi from '../../shop/trainerApi';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Row, color, font, radius, space } from '../kit';
import { ProgressDetail, Sparkline, TrendPill, forgetProgress, useMemberProgress, useSeen } from '../ProgressView';
import { navigate } from '../router';

type Load =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'refused' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: TrainerMembers };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

export function MyMembersScreen({ memberId = null }: { memberId?: string | null }) {
  const { session } = useAuth();
  const { today } = useCrm();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const me = session?.person?.name ?? null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchList = useCallback(async () => {
    if (!key) return;
    setLoad({ state: 'loading' });
    try {
      const r = await trainerApi.getTrainerMembers(key);
      setLoad(r === 'missing' ? { state: 'missing' } : r === 'refused' ? { state: 'refused' } : { state: 'ready', data: r });
    } catch (e) {
      console.warn('[ForgeErr] my members: reading', e);
      setLoad({ state: 'error', message: trainerErrorWords(e) ?? errorWords(e) });
    }
  }, [key]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const sorted = useMemo(() => (load.state === 'ready' ? sortMembers(load.data.members, today) : []), [load, today]);
  const owner = load.state === 'ready' && load.data.role === 'owner';

  if (memberId && key) {
    const m = load.state === 'ready' ? (load.data.members.find((x) => x.memberId === memberId) ?? null) : null;
    return <MemberProgressPage ownerKey={key} memberId={memberId} member={m} today={today} owner={owner} />;
  }

  return (
    <>
      <PageHeader
        title="Training progress"
        subtitle={owner ? 'Every member who shares their workouts, and their trainer' : 'Your members: who to talk to today'}
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              forgetProgress();
              void fetchList();
            }}
          >
            Refresh
          </Button>
        }
      />
      {!key ? (
        <Card>
          <EmptyState title="Training progress needs your gym online" body="Put your gym online first (Settings → Sign-in & data)." />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title="Training progress is not ready for your gym yet" body="It will appear here once your gym’s server has it." />
        </Card>
      ) : load.state === 'refused' ? (
        <Card>
          <EmptyState title="Only trainers and the owner see this" body="Ask the owner to tick you as a trainer in Staff & sign-in." />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchList()}>
            Try again
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>Loading…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState
            title="No members to show yet"
            body={
              owner
                ? 'Members show here once they use the MettleUp app with your gym. Give each one a trainer on their member page.'
                : 'The owner gives you members on each member’s page. They show here once they use the MettleUp app.'
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: space.md }}>
          {sorted.map((m) => (
            <MemberRow key={m.appId} m={m} today={today} owner={owner} from={owner ? null : me} ownerKey={key} />
          ))}
          <p style={small}>Members can switch sharing off in their app at any time. Body weight, photos and notes are never shared.</p>
        </div>
      )}
    </>
  );
}

function MemberRow({ m, today, owner, from, ownerKey }: { m: TrainerMember; today: string; owner: boolean; from: string | null; ownerKey: string | null }) {
  const line = memberLine(m, today);
  const tone = line.kind === 'help' || line.kind === 'quiet' ? 'warn' : line.kind === 'best' ? 'good' : 'muted';
  const bars = weekBars(m.summary, today);
  const total = bars.reduce((a, n) => a + n, 0);
  // R-535: the member's workouts are read only once the card is near the screen.
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const { p } = useMemberProgress(ownerKey, m.memberId, seen);
  const tag = useMemo(() => (p && p.shared && p.hasRecent ? progressTag(p.recent, today) : null), [p, today]);
  const open = () => {
    if (m.memberId) navigate(`/trainer/${m.memberId}`);
  };
  const head = tag?.headline;
  return (
    <Card>
      <Row gap={space.sm}>
        <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>
          {m.memberId ? (
            <a href={`#/trainer/${encodeURIComponent(m.memberId)}`} style={{ color: color.ink }} onClick={(e) => { e.preventDefault(); open(); }}>
              {m.name}
            </a>
          ) : (
            m.name
          )}
        </strong>
        <Pill tone={tone}>{line.text}</Pill>
        {owner && <Pill tone="muted">{m.trainerName ? `Trainer: ${m.trainerName}` : 'No trainer'}</Pill>}
      </Row>
      <div ref={seenRef} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <Sparkline values={bars} ariaLabel={`${t('Workouts per week, last 12 weeks')}: ${bars.join(', ')}`} />
        <div style={{ minWidth: 0 }}>
          <p style={{ ...quiet, color: color.ink, fontWeight: 600 }}>{total === 1 ? t('1 workout in 12 weeks') : t('{n} workouts in 12 weeks', { n: total })}</p>
          <p style={small}>{t('Workouts per week, last 12 weeks')}</p>
        </div>
      </div>
      {tag ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm }} data-testid="progress-tag">
          <TrendPill trend={tag.overall} />
          {head && head.before != null && head.now != null ? (
            <span style={quiet}>
              {head.kind === 'kg'
                ? t('{name}: strength score {before} → {now} kg', { name: head.n, before: head.before, now: head.now })
                : t('{name}: most reps {before} → {now}', { name: head.n, before: head.before, now: head.now })}
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ marginTop: space.sm }}>
        {m.memberId ? (
          <Button variant="ghost" onClick={open} ariaLabel={t('See full progress of {name}', { name: m.name })}>
            {t('See full progress')}
          </Button>
        ) : (
          <p style={small}>{t('This member is not on your gym’s list yet, so their full progress cannot open.')}</p>
        )}
      </div>
      <div style={{ marginTop: space.md }}>
        <Row gap={space.sm}>
          <a href={whatsAppHref(wellDoneMessage(m, today, from), m.phone)} target="_blank" rel="noopener noreferrer" style={linkButton}>
            WhatsApp: Well done
          </a>
          <a href={whatsAppHref(howIsItGoingMessage(m, today, from), m.phone)} target="_blank" rel="noopener noreferrer" style={linkButton}>
            WhatsApp: How’s it going?
          </a>
        </Row>
      </div>
      {!m.phone && <p style={{ ...small, marginTop: space.sm }}>No mobile number on the gym’s list: WhatsApp will ask who to send it to.</p>}
    </Card>
  );
}

/** R-535: one member's full progress (`/trainer/<list member id>`). */
function MemberProgressPage({ ownerKey, memberId, member, today, owner }: { ownerKey: string; memberId: string; member: TrainerMember | null; today: string; owner: boolean }) {
  const { p, failed } = useMemberProgress(ownerKey, memberId);
  const missing = questionsApi.questionsMissing();
  return (
    <>
      <PageHeader
        title={member?.name ?? t('Training progress')}
        subtitle={member ? (owner && member.trainerName ? `${t('Training progress')} · Trainer: ${member.trainerName}` : t('Training progress')) : undefined}
        actions={
          <Button variant="ghost" onClick={() => navigate('/trainer')}>
            {t('Back to Training progress')}
          </Button>
        }
      />
      <Card>
        {failed ? (
          <ErrorBanner>{t('Could not read this member’s progress. Check the internet and try again.')}</ErrorBanner>
        ) : missing ? (
          <EmptyState title="Training progress is not ready for your gym yet" body="It will appear here once your gym’s server has it." />
        ) : !p ? (
          <p style={quiet}>Loading…</p>
        ) : !p.allowed ? (
          <p style={quiet}>{t('Only the owner and this member’s own trainer can see this.')}</p>
        ) : !p.shared ? (
          <p style={quiet}>
            This member is not sharing workouts from the MettleUp app. They can switch on “Share my workouts with my trainers” in the app’s
            settings.
          </p>
        ) : (
          <ProgressDetail p={p} today={today} />
        )}
      </Card>
      <div style={{ marginTop: space.md }}>
        <Button variant="ghost" onClick={() => navigate(`/members/${memberId}`)}>
          {t('Open member page')}
        </Button>
      </div>
    </>
  );
}

const linkButton = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 40,
  padding: `0 ${space.md}px`,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.pill,
  fontFamily: font.body,
  fontSize: 14,
  fontWeight: 600,
  color: color.ink,
  textDecoration: 'none',
} as const;
