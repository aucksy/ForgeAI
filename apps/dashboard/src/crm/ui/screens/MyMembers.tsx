/**
 * F109 "Training progress" (/trainer; OWNER-INBOX #46, DECIDED 24 Oct 2026). Who to talk to today and what to say: one
 * plain line per member ("New best: Leg press 120 kg × 10", "No workout for 9 days", "Asked for help today"), this
 * week's workouts and kg, the best sets, and two ready WhatsApp messages ("Well done", "How's it going?").
 *
 * A trainer (a person the owner ticked "Trainer") sees only the members the owner gave them; the owner sees every
 * member who shares, with their trainer. Only what the member's phone sends while "Share my workouts with my
 * trainers" is on: never body weight, photos or notes. Read on the gym's server (0050); hidden until it is there.
 * Rules and words: logic/trainerView.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { formatDayShort } from '../../logic/dates';
import {
  howIsItGoingMessage,
  memberLine,
  setText,
  sortMembers,
  trainerErrorWords,
  weekBars,
  weekLine,
  wellDoneMessage,
  type TrainerMember,
  type TrainerMembers,
} from '../../logic/trainerView';
import { whatsAppHref } from '../../shop/invite';
import { errorWords } from '../../shop/logic';
import * as trainerApi from '../../shop/trainerApi';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Row, color, font, radius, space } from '../kit';
import { navigate } from '../router';

type Load =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'refused' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: TrainerMembers };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;

export function MyMembersScreen() {
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

  return (
    <>
      <PageHeader
        title="Training progress"
        subtitle={owner ? 'Every member who shares their workouts, and their trainer' : 'Your members: who to talk to today'}
        actions={
          <Button variant="ghost" onClick={() => void fetchList()}>
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
            <MemberRow key={m.appId} m={m} today={today} owner={owner} from={owner ? null : me} />
          ))}
          <p style={small}>Members can switch sharing off in their app at any time. Body weight, photos and notes are never shared.</p>
        </div>
      )}
    </>
  );
}

function MemberRow({ m, today, owner, from }: { m: TrainerMember; today: string; owner: boolean; from: string | null }) {
  const line = memberLine(m, today);
  const tone = line.kind === 'help' || line.kind === 'quiet' ? 'warn' : line.kind === 'best' ? 'good' : 'muted';
  const bars = weekBars(m.summary, today);
  const top = Math.max(1, ...bars);
  return (
    <Card>
      <Row gap={space.sm}>
        <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>
          {m.memberId ? (
            <a href={`#/members/${encodeURIComponent(m.memberId)}`} style={{ color: color.ink }} onClick={(e) => { e.preventDefault(); navigate(`/members/${m.memberId}`); }}>
              {m.name}
            </a>
          ) : (
            m.name
          )}
        </strong>
        <Pill tone={tone}>{line.text}</Pill>
        {owner && <Pill tone="muted">{m.trainerName ? `Trainer: ${m.trainerName}` : 'No trainer'}</Pill>}
      </Row>
      <p style={{ ...quiet, marginTop: space.sm }}>{weekLine(m.summary, today)}</p>
      <div aria-label="Workouts each week, last 12 weeks" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28, marginTop: space.sm }}>
        {bars.map((n, i) => (
          <span
            key={i}
            title={`${n} ${n === 1 ? 'workout' : 'workouts'}`}
            style={{ width: 10, height: Math.max(2, Math.round((n / top) * 28)), borderRadius: radius.sm, background: n > 0 ? color.accent : color.border }}
          />
        ))}
      </div>
      {m.summary.best.length > 0 && (
        <details style={{ marginTop: space.sm }}>
          <summary style={{ ...quiet, cursor: 'pointer' }}>Best sets</summary>
          <ul style={{ ...quiet, margin: `${space.sm}px 0 0`, paddingLeft: space.lg }}>
            {m.summary.best.map((b) => (
              <li key={b.n}>{setText(b)}</li>
            ))}
            {m.summary.records.map((r) => (
              <li key={`r-${r.n}-${r.d}`}>{`New best on ${formatDayShort(r.d)}: ${setText(r)}`}</li>
            ))}
          </ul>
        </details>
      )}
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
