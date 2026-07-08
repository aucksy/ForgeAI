import { useState } from 'react';

import { isAtRisk } from '../lib/format';
import { color, font, radius, space } from '../theme';
import type { Gym, MemberSummary } from '../types';
import { MembersTable } from './MembersTable';
import { AtRiskList, StreakLeaderboard } from './Panels';
import { Button, StatTile } from './ui';

function Header({
  gym,
  email,
  onReload,
  onSignOut,
}: {
  gym: Gym;
  email: string;
  onReload: () => void;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gym.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — ignore, the code is visible anyway
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: space.md,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontFamily: font.display, fontSize: 26, fontWeight: 700, color: color.ink }}>
          {gym.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginTop: 6 }}>
          <span style={{ color: color.inkMuted, fontSize: 13 }}>Join code</span>
          <button
            onClick={() => void copy()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: space.sm,
              background: color.surfaceSunken,
              border: `1px solid ${color.borderStrong}`,
              borderRadius: radius.pill,
              padding: '4px 12px',
              color: color.ink,
            }}
          >
            <span style={{ fontFamily: font.mono, fontWeight: 700, letterSpacing: 1 }}>{gym.join_code}</span>
            <span style={{ color: copied ? color.goodText : color.inkMuted, fontSize: 11 }}>
              {copied ? 'copied' : 'copy'}
            </span>
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <span style={{ color: color.inkMuted, fontSize: 13 }}>{email}</span>
        <Button variant="ghost" onClick={onReload}>
          Refresh
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function Dashboard({
  gym,
  members,
  email,
  onReload,
  onSignOut,
}: {
  gym: Gym;
  members: MemberSummary[];
  email: string;
  onReload: () => void;
  onSignOut: () => void;
}) {
  const atRisk = members.filter((m) => isAtRisk(m.last_active_at));
  const activeCount = members.length - atRisk.length;
  const leaders = [...members]
    .filter((m) => m.current_streak > 0)
    .sort((a, b) => b.current_streak - a.current_streak)
    .slice(0, 5);
  // All-time record → use longest_streak (a record shouldn't drop when a current
  // streak breaks). The leaderboard below is the *active* streak view.
  const longestStreak = members.reduce((mx, m) => Math.max(mx, m.longest_streak), 0);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: `${space.xxl}px ${space.xl}px ${space.xxxl}px` }}>
      <Header gym={gym} email={email} onReload={onReload} onSignOut={onSignOut} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: space.md,
          marginTop: space.xl,
        }}
      >
        <StatTile label="Members" value={members.length} />
        <StatTile label="Active this week" value={activeCount} tone="good" />
        <StatTile label="At risk" value={atRisk.length} tone={atRisk.length > 0 ? 'critical' : undefined} />
        <StatTile label="Longest streak" value={longestStreak} tone="accent" />
      </div>

      <div style={{ marginTop: space.xl }}>
        <MembersTable members={members} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: space.lg,
          marginTop: space.lg,
        }}
      >
        <AtRiskList members={atRisk} />
        <StreakLeaderboard members={leaders} />
      </div>
    </div>
  );
}
