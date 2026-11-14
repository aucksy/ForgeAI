/**
 * Today → "Get started" (launch plan I5): a new gym's first six steps (logic/getStarted.ts). The
 * owner only; gone when every step is done or when hidden. The hand-ticked steps and "hidden"
 * are kept in this browser per gym (a convenience: losing them only shows the card again).
 */
import { useState } from 'react';

import { useCan } from '../auth/AuthProvider';
import { getStartedSteps, nextStepAfter, stepForPath, type Step, type StepKey } from '../logic/getStarted';
import { t } from '../lang/lang';
import { useCrm } from '../store';
import { Card, SectionTitle, TOUCH, color, font, radius, space } from './kit';
import { navigate } from './router';
import { useSetupTurn } from './SetupSlot';

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

/**
 * Owner, 1 Nov 2026: the step the owner opened from the list, so its screen can offer "Next step".
 * Kept for this tab only (sessionStorage); losing it only hides the bar.
 */
const OPENED_KEY = 'forgeai.getStarted.opened';

function readOpened(): StepKey | null {
  try {
    return (sessionStorage.getItem(OPENED_KEY) as StepKey | null) ?? null;
  } catch (e) {
    console.warn('[get started] opened step unreadable', e);
    return null;
  }
}

/** Open a step's screen, remembering it came from Get started. */
function openStep(s: Step) {
  try {
    sessionStorage.setItem(OPENED_KEY, s.key);
  } catch (e) {
    console.warn('[get started] could not keep the opened step', e);
  }
  navigate(s.path);
}

/** A step's words, in the language chosen on this device. */
const titleOf = (s: Step) => t(s.title);

/** Ticks a hand-ticked step from another screen (Branding ticks "logo and colours" once a look is saved). */
export function tickGetStarted(gymId: string, key: StepKey) {
  const v = readSaved(gymId);
  if (!v.ticked.includes(key)) save(gymId, { ...v, ticked: [...v.ticked, key] });
}

export function GetStartedCard() {
  const { snapshot } = useCrm();
  const owner = useCan()('eraseOrDemo');
  const gymId = snapshot.gym.gymId;
  const [state, setState] = useState(() => readSaved(gymId));
  const steps = getStartedSteps(snapshot, new Set(state.ticked));
  // Fresh eyes (14 Nov 2026): one set-up card on Today at a time; Get started goes first.
  const myTurn = useSetupTurn('get-started', owner && !state.hidden && !steps.every((s) => s.done));
  if (!myTurn) return null;

  const update = (next: { ticked: StepKey[]; hidden: boolean }) => {
    setState(next);
    save(gymId, next);
  };
  const link = { background: 'none', border: 'none', padding: 0, minHeight: TOUCH, cursor: 'pointer', fontFamily: font.body, fontSize: 14, fontWeight: 700 } as const;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' }}>
        <SectionTitle>{t('Get started')}</SectionTitle>
        <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {t('{done} of {total} done', { done: steps.filter((x) => x.done).length, total: steps.length })}
        </span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
        {steps.map((s, i) => (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.sm}px 0`, borderTop: i ? `1px solid ${color.border}` : 'none' }}>
            {/* R-85 (owner, 23 Oct 2026): the whole step opens the screen where it is done, not only its title. */}
            <button
              type="button"
              className="tap-row"
              onClick={() => openStep(s)}
              aria-label={s.done ? `${titleOf(s)} (${t('done')}). ${t('Open')}` : `${titleOf(s)}. ${t('Open')}`}
              style={{ flex: 1, minWidth: 0, minHeight: TOUCH, display: 'flex', alignItems: 'center', gap: space.md, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}
            >
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
              <span style={{ display: 'block', fontFamily: font.body, fontSize: 14, fontWeight: 700, color: s.done ? color.inkSecondary : color.ink, textDecoration: s.done ? 'line-through' : 'none' }}>
                {titleOf(s)}
              </span>
              <span style={{ display: 'block', fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{t(s.hint)}</span>
            </span>
            <span aria-hidden style={{ fontFamily: font.body, fontSize: 20, color: color.inkMuted, flexShrink: 0 }}>›</span>
            </button>
            {s.manual && !s.done && (
              <button type="button" onClick={() => update({ ...state, ticked: [...state.ticked, s.key] })} style={{ ...link, color: color.inkSecondary, fontWeight: 400 }} aria-label={t('Mark “{step}” as done', { step: titleOf(s) })}>
                {/* UAT A-14 (30 Oct 2026): a bare orange "Done" read as a status, not a button. */}
                {t('Mark done')}
              </button>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => update({ ...state, hidden: true })} style={{ ...link, color: color.inkSecondary }}>
        {t('Hide this list')}
      </button>
    </Card>
  );
}

/**
 * Owner, 1 Nov 2026: on a screen opened from Get started, a slim bar: "Next step: <title>" to the next
 * step still to do, and "Back to the list" (Today). Only while Get started is unfinished and not
 * hidden, for the owner, and only on the opened step's own screen.
 */
export function NextStepBar({ path }: { path: string }) {
  const { snapshot } = useCrm();
  const owner = useCan()('eraseOrDemo');
  const opened = readOpened();
  if (!owner || !opened) return null;
  const saved = readSaved(snapshot.gym.gymId);
  const steps = getStartedSteps(snapshot, new Set(saved.ticked));
  if (saved.hidden || steps.every((s) => s.done)) return null;
  const here = stepForPath(steps, path);
  if (!here || here.key !== opened) return null;
  const next = nextStepAfter(steps, here.key);

  const linkStyle = {
    background: 'none',
    border: 'none',
    padding: 0,
    minHeight: TOUCH,
    cursor: 'pointer',
    fontFamily: font.body,
    fontSize: 14,
    textAlign: 'left',
  } as const;

  return (
    <nav
      aria-label={t('Get started')}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        columnGap: space.lg,
        padding: `0 ${space.lg}px`,
        marginBottom: space.lg,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        background: color.surfaceSunken,
      }}
    >
      {next ? (
        <button type="button" onClick={() => openStep(next)} style={{ ...linkStyle, fontWeight: 700, color: color.accentBright, minWidth: 0 }}>
          {t('Next step: {step}', { step: titleOf(next) })} ›
        </button>
      ) : (
        <span style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary, padding: `${space.sm}px 0` }}>{t('This is the last step on the list.')}</span>
      )}
      <button type="button" onClick={() => navigate('/')} style={{ ...linkStyle, fontWeight: 600, color: color.inkSecondary }}>
        {t('Back to the list')}
      </button>
    </nav>
  );
}
