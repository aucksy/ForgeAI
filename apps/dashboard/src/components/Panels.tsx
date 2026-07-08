import type { ReactNode } from 'react';

import { relativeDay } from '../lib/format';
import { color, font, radius, space } from '../theme';
import type { MemberSummary } from '../types';
import { Avatar, Card, Pill, SectionTitle } from './ui';

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: color.inkMuted, fontSize: 14 }}>{children}</div>;
}

/** Members with no activity within AT_RISK_DAYS (already filtered by the caller). */
export function AtRiskList({ members }: { members: MemberSummary[] }) {
  return (
    <Card>
      <SectionTitle>At risk</SectionTitle>
      {members.length === 0 ? (
        <Empty>Everyone's been active this week. 🔥</Empty>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {members.map((m) => (
            <div key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
              <Avatar name={m.display_name} />
              <span style={{ flex: 1, color: color.ink, fontWeight: 600, fontSize: 14 }}>
                {m.display_name ?? 'Member'}
              </span>
              <Pill tone="critical">{relativeDay(m.last_active_at)}</Pill>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Top members by current streak (already sorted + sliced by the caller). */
export function StreakLeaderboard({ members }: { members: MemberSummary[] }) {
  return (
    <Card>
      <SectionTitle>Streak leaders</SectionTitle>
      {members.length === 0 ? (
        <Empty>No active streaks yet.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {members.map((m, i) => (
            <div key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: radius.pill,
                  background: i === 0 ? color.accentSoft : color.surfaceSunken,
                  color: i === 0 ? color.accentBright : color.inkMuted,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <span style={{ flex: 1, color: color.ink, fontWeight: 600, fontSize: 14 }}>
                {m.display_name ?? 'Member'}
              </span>
              <span style={{ fontFamily: font.mono, fontWeight: 700, color: color.accentBright }}>
                {m.current_streak}
                <span style={{ color: color.inkMuted, fontWeight: 400, fontSize: 12 }}> d</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
