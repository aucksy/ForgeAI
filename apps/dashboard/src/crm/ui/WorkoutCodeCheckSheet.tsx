/**
 * "Check workout code" (Messages & offers step 1, item 6; OWNER-INBOX #49). The member opens "Show
 * my workouts to the desk" in the app; the desk types the code here. Each workout day is matched
 * against the gym's own check-ins (logic/claimMatch.ts): "8 of 10 workouts match a check-in". The
 * owner then gives the reward with Freeze / extra days (gift); the front desk asks the owner.
 * Nothing is saved: the check is only read on this screen.
 */

import { useState } from 'react';

import { checkClaim, claimSummary, CODE_OLD_DAYS, type ClaimCheck } from '../logic/claimMatch';
import { formatDay } from '../logic/dates';
import type { Visit } from '../types';
import { Button, Sheet, TextField, color, font, space } from './kit';

const CHECK_IN_WORDS: Record<Visit['source'], string> = { desk: 'Checked in at the desk', app: 'Checked in on the app', import: 'Checked in (imported)' };

export function WorkoutCodeCheckSheet({
  visits,
  today,
  onGive,
  onClose,
}: {
  /** This member's check-ins. */
  visits: readonly Visit[];
  today: string;
  /** The owner's way to give extra days; absent for the front desk or with no plan to extend. */
  onGive?: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ClaimCheck | null>(null);

  const check = () => setResult(checkClaim(code, visits, today));
  const body = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary, lineHeight: 1.45 } as const;

  return (
    <Sheet
      title="Check workout code"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled={code.trim() === ''} onClick={check}>
            Check
          </Button>
        </>
      }
    >
      <p style={body}>
        For the workout offer. The member opens “Show my workouts to the desk” in the app. Type the code from their phone.
      </p>
      <TextField
        label="Workout code"
        value={code}
        onChange={(v) => {
          setCode(v);
          setResult(null);
        }}
        placeholder="K3Q9P-X2M7A"
        autoFocus
        error={result && !result.ok ? result.problem : null}
      />
      {result?.ok && (
        <div style={{ marginTop: space.lg }}>
          <p role="status" style={{ ...body, color: color.ink, fontWeight: 700, fontSize: 15 }}>
            {claimSummary(result)}
          </p>
          <p style={{ ...body, marginTop: 4 }}>
            {`Code made on ${formatDay(result.madeOn)}.`}
            {result.old ? ` It is more than ${CODE_OLD_DAYS} days old: ask for a new code to see the newest workouts.` : ''}
          </p>
          {result.days.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: `${space.md}px 0 0`, display: 'grid', gap: 6 }}>
              {[...result.days].reverse().map((d) => (
                <li key={d.day} style={{ display: 'flex', justifyContent: 'space-between', gap: space.md, fontFamily: font.body, fontSize: 14 }}>
                  <span style={{ color: color.ink }}>{formatDay(d.day)}</span>
                  <span style={{ color: d.checkIn ? color.goodText : color.inkMuted, textAlign: 'right' }}>
                    {d.checkIn ? `✓ ${CHECK_IN_WORDS[d.checkIn]}` : 'No check-in: does not count'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.matched > 0 && (
            <div style={{ marginTop: space.lg }}>
              {onGive ? (
                <Button variant="ghost" onClick={onGive}>
                  Give extra days
                </Button>
              ) : (
                <p style={body}>The owner gives the extra days.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
