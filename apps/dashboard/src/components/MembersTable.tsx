import type { ReactNode } from 'react';

import { fmtWeight, isAtRisk, relativeDay } from '../lib/format';
import { color, font, space } from '../theme';
import type { MemberSummary } from '../types';
import { Avatar, Card, Pill, SectionTitle } from './ui';

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        textAlign: right ? 'right' : 'left',
        padding: `10px ${space.xl}px`,
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: color.inkMuted,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, mono }: { children: ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      style={{
        textAlign: right ? 'right' : 'left',
        padding: `12px ${space.xl}px`,
        color: color.inkSecondary,
        fontFamily: mono ? font.mono : font.body,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

export function MembersTable({ members }: { members: MemberSummary[] }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: `${space.xl}px ${space.xl}px ${space.md}px` }}>
        <SectionTitle>Members ({members.length})</SectionTitle>
      </div>
      {members.length === 0 ? (
        <div style={{ padding: `0 ${space.xl}px ${space.xl}px`, color: color.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
          No members have synced yet. Share your join code — a member appears here after their first
          logged workout.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr style={{ borderTop: `1px solid ${color.border}`, borderBottom: `1px solid ${color.border}` }}>
                <Th>Member</Th>
                <Th>Last active</Th>
                <Th right>Streak</Th>
                <Th right>7d</Th>
                <Th right>30d</Th>
                <Th right>Weight</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.member_id} style={{ borderTop: `1px solid ${color.border}` }}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                      <Avatar name={m.display_name} />
                      <span style={{ color: color.ink, fontWeight: 600 }}>{m.display_name ?? 'Member'}</span>
                    </div>
                  </Td>
                  <Td>
                    {isAtRisk(m.last_active_at) ? (
                      <Pill tone="critical">{relativeDay(m.last_active_at)}</Pill>
                    ) : (
                      relativeDay(m.last_active_at)
                    )}
                  </Td>
                  <Td right mono>
                    <span style={{ color: m.current_streak > 0 ? color.accentBright : color.inkMuted }}>
                      {m.current_streak}
                    </span>
                  </Td>
                  <Td right mono>
                    {m.workouts_7d}
                  </Td>
                  <Td right mono>
                    {m.workouts_30d}
                  </Td>
                  <Td right mono>
                    {fmtWeight(m.weight_kg)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
