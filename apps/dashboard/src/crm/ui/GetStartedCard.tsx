/**
 * Today → "Get started" (launch plan I5): a new gym's first five steps (logic/getStarted.ts). The
 * owner only; gone when every step is done or when hidden. The two hand-ticked steps and "hidden"
 * are kept in this browser per gym (a convenience: losing them only shows the card again).
 */
import { useState } from 'react';

import { useCan } from '../auth/AuthProvider';
import { getStartedSteps, stepsLine, type StepKey } from '../logic/getStarted';
import { useCrm } from '../store';
import { Card, SectionTitle, TOUCH, color, font, space } from './kit';
import { navigate } from './router';

const keyFor = (gymId: string) => `forgeai.getStarted.${gymId}`;

function readSaved(gymId: string): { ticked: StepKey[]; hidden: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(gymId)) ?? 'null') as { ticked?: StepKey[]; hidden?: boolean } | null;
    return { ticked: Array.isArray(v?.ticked) ? v.ticked : [], hidden: v?.hidden === true };
  } catch (e) {
    console.warn('[get started] saved state unreadable', e);
    return { ticked: [], hidden: false };
  }
}

function save(gymId: string, v: { ticked: StepKey[]; hidden: boolean }) {
  try {
    localStorage.setItem(keyFor(gymId), JSON.stringify(v));
  } catch (e) {
    console.warn('[get started] could not save', e);
  }
}

export function GetStartedCard() {
  const { snapshot } = useCrm();
  const owner = useCan()('eraseOrDemo');
  const gymId = snapshot.gym.gymId;
  const [state, setState] = useState(() => readSaved(gymId));
  const steps = getStartedSteps(snapshot, new Set(state.ticked));
  if (!owner || state.hidden || steps.every((s) => s.done)) return null;

  const update = (next: { ticked: StepKey[]; hidden: boolean }) => {
    setState(next);
    save(gymId, next);
  };
  const link = { background: 'none', border: 'none', padding: 0, minHeight: TOUCH, cursor: 'pointer', fontFamily: font.body, fontSize: 14, fontWeight: 700 } as const;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' }}>
        <SectionTitle>Get started</SectionTitle>
        <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{stepsLine(steps)}</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
        {steps.map((s, i) => (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.sm}px 0`, borderTop: i ? `1px solid ${color.border}` : 'none' }}>
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontFamily: font.body,
                fontSize: 13,
                fontWeight: 800,
                background: s.done ? color.good : 'transparent',
                border: s.done ? 'none' : `2px solid ${color.borderStrong}`,
                color: s.done ? '#07080C' : color.inkSecondary,
              }}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => navigate(s.path)}
                aria-label={s.done ? `${s.title} (done)` : s.title}
                style={{ ...link, minHeight: 0, color: s.done ? color.inkSecondary : color.ink, textAlign: 'left', textDecoration: s.done ? 'line-through' : 'none' }}
              >
                {s.title}
              </button>
              <span style={{ display: 'block', fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{s.hint}</span>
            </span>
            {s.manual && !s.done && (
              <button type="button" onClick={() => update({ ...state, ticked: [...state.ticked, s.key] })} style={{ ...link, color: color.accentBright }} aria-label={`Mark "${s.title}" as done`}>
                Done
              </button>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => update({ ...state, hidden: true })} style={{ ...link, color: color.inkSecondary }}>
        Hide this list
      </button>
    </Card>
  );
}
