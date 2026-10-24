/**
 * The branch switch at the top of the panel (#41). Only an owner with 2 or more branches sees it;
 * everyone else sees the gym's name, as before. "All branches" opens the totals page for every
 * branch; a branch makes it the open one (every screen is then that branch's).
 */

import { useState } from 'react';

import { color, font, radius, space } from '../ui/kit';
import { navigate, replace, useRoute } from '../ui/router';
import { useBranchActions } from './BranchProvider';
import { useBranches } from './context';
import { NEEDS_INTERNET_WORDS, useOffline } from '../ui/offlineContext';

export const ALL_BRANCHES = '__all';

export function BranchSwitch({ gymName, compact = false }: { gymName: string; compact?: boolean }) {
  const { branches, multi, canOpenOthers, currentGymId } = useBranches();
  const { switchTo } = useBranchActions();
  const route = useRoute();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Offline front desk, step 3: another branch opens only online (this device keeps one branch's copy).
  const { offline } = useOffline();

  if (!multi || !canOpenOthers) {
    return (
      <div
        style={
          compact
            ? { fontFamily: font.display, fontSize: 15, fontWeight: 700, color: color.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            : { fontFamily: font.display, fontSize: 15, fontWeight: 700, color: color.ink }
        }
      >
        {gymName}
      </div>
    );
  }

  const onAll = route.segments[0] === 'branches';
  const value = onAll ? ALL_BRANCHES : currentGymId;

  const pick = async (id: string) => {
    setError(null);
    if (id === ALL_BRANCHES) return navigate('/branches');
    if (id === currentGymId) return navigate('/');
    setBusy(true);
    try {
      replace('/');
      await switchTo(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That branch could not be opened. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minWidth: 0, flex: compact ? 1 : undefined }}>
      <label style={{ display: 'block' }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Branch</span>
        <select
          aria-label="Branch"
          value={value}
          disabled={busy || offline}
          aria-description={offline ? NEEDS_INTERNET_WORDS : undefined}
          onChange={(e) => void pick(e.target.value)}
          style={{
            width: '100%',
            maxWidth: compact ? '100%' : 210,
            minHeight: 40,
            padding: `0 ${space.sm}px`,
            borderRadius: radius.md,
            border: `1px solid ${color.borderStrong}`,
            background: color.surface,
            color: color.ink,
            fontFamily: font.display,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          <option value={ALL_BRANCHES}>All branches</option>
          {branches.map((b) => (
            <option key={b.gymId} value={b.gymId}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {busy && <div role="status" style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 4 }}>Opening the branch…</div>}
      {error && <div role="alert" style={{ fontFamily: font.body, fontSize: 12, color: color.criticalText, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
