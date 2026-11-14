/**
 * "Get started" (launch plan I5): a new gym's first steps (logic/getStarted.ts). The owner only.
 * R-526 (owner, 14 Nov 2026): out of Today into its own page, "Set up your gym" (/setup), with a progress ring on its
 * menu row while steps are left (the menu, the phone's More). The hand-ticked steps and "hidden" are kept in this
 * browser per gym (a convenience: losing them only shows the ring again). "Hidden" (the old "Hide this list") now
 * means: no ring, and the menu row moves down to "Your gym"; the page itself always shows the list.
 */
import { useCallback, useEffect, useState } from 'react';

import { useCan } from '../auth/AuthProvider';
import { getStartedSteps, nextStepAfter, stepForPath, type Step, type StepKey } from '../logic/getStarted';
import { progressShare, type SetupProgress } from '../logic/navGroups';
import { t } from '../lang/lang';
import { useCrm } from '../store';
import { Card, TOUCH, color, font, radius, space } from './kit';
import { navigate } from './router';

const keyFor = (gymId: string) => `forgeai.getStarted.${gymId}`;
/** Said on this page when a step is ticked on another screen, so the menu's ring moves at once. */
const CHANGED = 'forgeai:getstarted';

interface Saved {
  ticked: StepKey[];
  hidden: boolean;
}

function readSaved(gymId: string): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(gymId)) ?? 'null') as { ticked?: StepKey[]; hidden?: boolean } | null;
    return { ticked: Array.isArray(v?.ticked) ? v.ticked : [], hidden: v?.hidden === true };
  } catch (e) {
    console.warn('[get started] saved state unreadable', e);
    return { ticked: [], hidden: false };
  }
}

function save(gymId: string, v: Saved) {
  try {
    localStorage.setItem(keyFor(gymId), JSON.stringify(v));
  } catch (e) {
    console.warn('[get started] could not save', e);
  }
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch (e) {
    console.warn('[get started] could not tell the menu', e);
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

/** Open a step's screen, remembering it came from Set up your gym. */
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

export interface GetStartedState {
  steps: Step[];
  saved: Saved;
  /** The owner (the steps are the owner's jobs); staff never see the page or its row. */
  owner: boolean;
  allDone: boolean;
  progress: SetupProgress;
  /** Steps left and not moved down: the menu row sits at the top with its ring. */
  pending: boolean;
  update: (next: Saved) => void;
}

/** The one place the steps are worked out: the page, the menu row and More read the same list. */
export function useGetStarted(): GetStartedState {
  const { snapshot } = useCrm();
  const owner = useCan()('eraseOrDemo');
  const gymId = snapshot.gym.gymId;
  const [saved, setSaved] = useState(() => readSaved(gymId));
  // Another screen ticked a step (Branding, Staff, the poster), or another tab did: read it again.
  useEffect(() => {
    const again = () => {
      const now = readSaved(gymId);
      setSaved((prev) => (JSON.stringify(prev) === JSON.stringify(now) ? prev : now));
    };
    again();
    window.addEventListener(CHANGED, again);
    window.addEventListener('storage', again);
    return () => {
      window.removeEventListener(CHANGED, again);
      window.removeEventListener('storage', again);
    };
  }, [gymId]);
  const update = useCallback(
    (next: Saved) => {
      setSaved(next);
      save(gymId, next);
    },
    [gymId],
  );
  const steps = getStartedSteps(snapshot, new Set(saved.ticked));
  const done = steps.filter((x) => x.done).length;
  const allDone = done === steps.length;
  return { steps, saved, owner, allDone, progress: { done, total: steps.length }, pending: owner && !allDone && !saved.hidden, update };
}

/**
 * R-526: the set-up mark: a small ring, filled as far as the steps done, in the "done" green of the list's ticks. It
 * looks nothing like the orange number badges (things waiting) or the orange new-feature dots.
 */
export function ProgressRing({ progress, size = 16 }: { progress: SetupProgress; size?: number }) {
  const stroke = size <= 14 ? 2.5 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = progressShare(progress);
  return (
    <svg data-setup-ring="" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      {/* UAT (14 Nov 2026): a grey track all but vanished on the dark menu at 0 done; a faint green one reads as "to do". */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color.good} strokeOpacity={0.32} strokeWidth={stroke} />
      {share > 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color.good}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </svg>
  );
}

/** "3 of 8 steps done", for screen readers beside the ring. */
export function progressWords(p: SetupProgress): string {
  return t('{done} of {total} steps done', { done: p.done, total: p.total });
}

/** R-526: the steps on the Set up your gym page (owner only; the page is owner-only too, permissions.ts). */
export function GetStartedList() {
  const { steps, saved, owner, allDone, progress, update } = useGetStarted();
  if (!owner) return null;
  const link = { background: 'none', border: 'none', padding: 0, minHeight: TOUCH, cursor: 'pointer', fontFamily: font.body, fontSize: 14, fontWeight: 600, textAlign: 'left' } as const;

  return (
    <>
      <Card style={{ marginBottom: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
          <ProgressRing progress={progress} size={20} />
          <span style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: allDone ? color.good : color.ink }}>
            {allDone ? t('All done. Your gym is ready for members.') : t('{done} of {total} done', { done: progress.done, total: progress.total })}
          </span>
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
          {steps.map((s, i) => (
            <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
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
                  <span style={{ display: 'block', fontFamily: font.body, fontSize: 15, fontWeight: 700, color: s.done ? color.inkSecondary : color.ink, textDecoration: s.done ? 'line-through' : 'none' }}>
                    {titleOf(s)}
                  </span>
                  <span style={{ display: 'block', fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{t(s.hint)}</span>
                </span>
                <span aria-hidden style={{ fontFamily: font.body, fontSize: 20, color: color.inkMuted, flexShrink: 0 }}>›</span>
              </button>
              {s.manual && !s.done && (
                <button type="button" onClick={() => update({ ...saved, ticked: [...saved.ticked, s.key] })} style={{ ...link, color: color.inkSecondary, fontWeight: 400 }} aria-label={t('Mark “{step}” as done', { step: titleOf(s) })}>
                  {/* UAT A-14 (30 Oct 2026): a bare orange "Done" read as a status, not a button. */}
                  {t('Mark done')}
                </button>
              )}
            </li>
          ))}
        </ol>
      </Card>
      {/* The old "Hide this list": the row and its ring move down to "Your gym" (and back), the steps stay here. */}
      {allDone ? null : saved.hidden ? (
        <button type="button" onClick={() => update({ ...saved, hidden: false })} style={{ ...link, color: color.accentBright }}>
          {t('Show this page at the top of the menu again')}
        </button>
      ) : (
        <div>
          <button type="button" onClick={() => update({ ...saved, hidden: true })} style={{ ...link, color: color.inkSecondary }}>
            {t('Move this page to the bottom of the menu')}
          </button>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
            {t('You can still open it from Your gym in the menu.')}
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Owner, 1 Nov 2026: on a screen opened from the steps, a slim bar: "Next step: <title>" to the next step still to
 * do, and "Back to the list" (Set up your gym, R-526). Only while steps are left and the list is not moved down, for
 * the owner, and only on the opened step's own screen.
 */
export function NextStepBar({ path }: { path: string }) {
  const { steps, pending } = useGetStarted();
  const opened = readOpened();
  if (!pending || !opened) return null;
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
      aria-label={t('Set up your gym')}
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
      <button type="button" onClick={() => navigate('/setup')} style={{ ...linkStyle, fontWeight: 600, color: color.inkSecondary }}>
        {t('Back to the list')}
      </button>
    </nav>
  );
}
