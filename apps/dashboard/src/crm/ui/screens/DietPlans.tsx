/**
 * Diet plans from the trainer (R-120, 24 Oct 2026).
 *
 * The list of plans (withdrawn ones folded away), the builder (title, goal, calories and protein a
 * day if wanted, meals with a time and one food per line, notes, who gets it), a starter set of plain
 * samples for Indian gyms to copy, and Member detail's card and "Send a diet plan". Sent like workout
 * plans: to members by name and/or to everyone on a membership plan who has it today. Saved on the
 * gym's server (0035), so it needs the gym online and the internet. The member reads it in the MettleUp
 * app (Gym → Diet plan). Owner and Staff (trainers) alike (permission `editWorkoutPlans`). Nothing is
 * deleted: Withdraw stops it going out. Words and rules: logic/dietPlans.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import {
  copyOfDiet,
  dietErrorWords,
  dietPayload,
  dietSendChoices,
  dietSizeWords,
  dietsForMember,
  dietWithMember,
  dietWithoutMember,
  DIET_LIMITS,
  DOCTOR_LINE,
  draftFromStarter,
  draftOfDiet,
  emptyDietDraft,
  emptyMeal,
  splitDiets,
  STARTER_DIETS,
  type DietDraft,
  type DietMealDraft,
  type DietPlan,
} from '../../logic/dietPlans';
import { assignSummary } from '../../logic/workoutPlans';
import { isNoSuchFunction } from '../../logic/workoutOffer';
import * as bodyApi from '../../shop/bodyApi';
import { errorWords } from '../../shop/logic';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Row, SectionTitle, Sheet, TextField, Toast, TOUCH, color, font, space } from '../kit';
import { AssignSection, ChoiceRow } from './WorkoutPlans';

/** The line the list, the builder and the member's card show: where the member finds it. */
export const MEMBERS_SEE_DIET = 'Members see their plan in the MettleUp app (Gym → Diet plan) after they check in at the gym once.';

type Server = 'unknown' | 'yes' | 'no';

function failWords(e: unknown): string {
  return dietErrorWords(e) ?? errorWords(e);
}

/** The gym's diet plans from the server, with save and withdraw. `key` null: the gym is not online. */
function useDietPlans() {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const [server, setServer] = useState<Server>('unknown');
  const [plans, setPlans] = useState<DietPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      const list = await bodyApi.listDiets(key);
      setServer('yes');
      setPlans(list);
      setError(null);
    } catch (e) {
      if (isNoSuchFunction(e)) {
        setServer('no');
        return;
      }
      console.warn('[ForgeErr] diet plans: reading the list', e);
      setError(failWords(e));
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (d: DietDraft): Promise<DietPlan> => {
      if (!key) throw new Error('Put your gym online first.');
      const { payload, problem } = dietPayload(d);
      if (!payload) throw new Error(problem ?? 'Check the plan and try again.');
      try {
        const saved = await bodyApi.saveDiet(key, payload);
        setPlans((cur) => [saved, ...(cur ?? []).filter((p) => p.id !== saved.id)]);
        return saved;
      } catch (e) {
        console.warn('[ForgeErr] diet plans: saving', e);
        throw new Error(failWords(e));
      }
    },
    [key],
  );

  const withdraw = useCallback(
    async (id: string): Promise<void> => {
      if (!key) return;
      try {
        const saved = await bodyApi.withdrawDiet(key, id);
        setPlans((cur) => (cur ?? []).map((p) => (p.id === saved.id ? saved : p)));
      } catch (e) {
        console.warn('[ForgeErr] diet plans: withdrawing', e);
        throw new Error(failWords(e));
      }
    },
    [key],
  );

  return { online, server, plans, error, reload, save, withdraw };
}

function useFlash(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  return [toast, flash];
}

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

// ---------------------------------------------------------------- the screen

export function DietPlansScreen() {
  const { online, server, plans, error, reload, save, withdraw } = useDietPlans();
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<DietDraft | null>(null);
  const [withdrawing, setWithdrawing] = useState<DietPlan | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, flash] = useFlash();
  const { open, withdrawn } = useMemo(() => splitDiets(plans ?? []), [plans]);

  const newButton =
    online && server === 'yes' ? (
      <Button needsInternet onClick={() => setStarting(true)}>
        + New plan
      </Button>
    ) : undefined;

  return (
    <>
      <PageHeader title="Diet plans" subtitle="Send members what to eat" actions={newButton} />
      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

      {!online ? (
        <Card>
          <EmptyState title="Diet plans need your gym online" body="Members’ phones read the plans from your gym’s server. Put your gym online first (Settings → Put your gym online)." />
        </Card>
      ) : server === 'no' ? (
        <Card>
          <EmptyState title="Diet plans are not switched on for your gym yet" body="They will appear here once your gym’s server has them." />
        </Card>
      ) : error && plans == null ? (
        <Card>
          <ErrorBanner>{error}</ErrorBanner>
          <Button variant="ghost" onClick={() => void reload()}>
            Try again
          </Button>
        </Card>
      ) : plans == null ? (
        <p style={quiet}>Loading…</p>
      ) : (
        <>
          <p style={{ ...quiet, fontSize: 13, margin: `0 0 ${space.lg}px` }}>{MEMBERS_SEE_DIET}</p>
          <Card style={{ marginBottom: space.lg }}>
            <SectionTitle>Plans</SectionTitle>
            {open.length === 0 ? (
              <EmptyState
                title="No diet plans yet"
                body="Start from a sample, like “Fat loss veg · 1,600 kcal”, change what you like, and send it to members or to everyone on a membership plan."
                action={newButton}
              />
            ) : (
              <div style={{ display: 'grid' }}>
                {open.map((p, i) => (
                  <DietRow
                    key={p.id}
                    plan={p}
                    first={i === 0}
                    actions={
                      <>
                        <Button variant="ghost" needsInternet onClick={() => setEditing(draftOfDiet(p))} ariaLabel={`Edit ${p.title}`}>
                          Edit
                        </Button>
                        <Button variant="quiet" needsInternet onClick={() => setEditing(copyOfDiet(p))} ariaLabel={`Make a copy of ${p.title}`}>
                          Make a copy
                        </Button>
                        <Button variant="quiet" tone="danger" needsInternet onClick={() => setWithdrawing(p)} ariaLabel={`Withdraw ${p.title}`}>
                          Withdraw
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          {withdrawn.length > 0 && (
            <Card>
              <button type="button" aria-expanded={showWithdrawn} onClick={() => setShowWithdrawn((v) => !v)} style={foldStyle}>
                <span>Withdrawn plans ({withdrawn.length})</span>
                <span aria-hidden style={{ color: color.inkMuted }}>
                  {showWithdrawn ? '▴' : '▾'}
                </span>
              </button>
              {showWithdrawn && (
                <div style={{ display: 'grid', marginTop: space.sm }}>
                  <p style={{ ...quiet, fontSize: 12, marginBottom: space.sm }}>Members no longer get these.</p>
                  {withdrawn.map((p, i) => (
                    <DietRow
                      key={p.id}
                      plan={p}
                      first={i === 0}
                      actions={
                        <Button variant="quiet" needsInternet onClick={() => setEditing(copyOfDiet(p))} ariaLabel={`Make a copy of ${p.title}`}>
                          Make a copy
                        </Button>
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {starting && (
        <StartDietSheet
          onClose={() => setStarting(false)}
          onPick={(d) => {
            setStarting(false);
            setEditing(d);
          }}
        />
      )}
      {editing && (
        <DietPlanSheet
          initial={editing}
          save={save}
          onClose={() => setEditing(null)}
          onSaved={(plan, isNew) => {
            const sent = plan.assign.memberIds.length + plan.assign.planIds.length > 0;
            flash(!sent ? `“${plan.title}” saved. Tick members to send it.` : isNew ? `“${plan.title}” saved and sent.` : `“${plan.title}” updated.`);
          }}
        />
      )}
      {withdrawing && (
        <Sheet
          title="Withdraw this plan?"
          onClose={() => setWithdrawing(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setWithdrawing(null)}>
                Keep it
              </Button>
              <Button
                tone="danger"
                needsInternet
                onClick={async () => {
                  const target = withdrawing;
                  setWithdrawing(null);
                  setActionError(null);
                  try {
                    await withdraw(target.id);
                    flash('Plan withdrawn.');
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : 'Could not withdraw it. Try again.');
                  }
                }}
              >
                Withdraw
              </Button>
            </>
          }
        >
          <p style={quiet}>
            <strong style={{ color: color.ink }}>{withdrawing.title}</strong>
            {' will stop showing in members’ apps the next time they open the Gym tab. You can’t send this plan again; make a copy of it instead.'}
          </p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

const foldStyle = {
  appearance: 'none',
  width: '100%',
  minHeight: TOUCH,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: color.ink,
  fontFamily: font.display,
  fontSize: 16,
  fontWeight: 600,
} as const;

function DietRow({ plan, first, actions }: { plan: DietPlan; first: boolean; actions?: ReactNode }) {
  const { snapshot } = useCrm();
  return (
    <div style={{ borderTop: first ? undefined : `1px solid ${color.border}`, padding: `${space.sm}px 0` }}>
      <Row gap={space.sm} align="center">
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>{plan.title}</div>
          <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>{assignSummary(plan, snapshot.plans)}</div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {dietSizeWords(plan)} · Updated {formatDay(dateISOFromEpoch(plan.updatedAt))}
            {plan.byName ? ` · by ${plan.byName}` : ''}
          </div>
        </div>
        {actions && <Row gap={space.xs}>{actions}</Row>}
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- starting

function StarterList({ memberIds, onPick }: { memberIds: readonly string[]; onPick: (d: DietDraft) => void }) {
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      {STARTER_DIETS.map((s) => (
        <ChoiceRow key={s.key} title={s.title} sub={`${s.goal} · ${s.proteinG} g protein`} body={s.summary} onClick={() => onPick(draftFromStarter(s, memberIds))} />
      ))}
      <ChoiceRow title="Start empty" sub="Write every meal yourself" onClick={() => onPick(emptyDietDraft(memberIds))} />
    </div>
  );
}

function StartDietSheet({ memberIds = [], onPick, onClose }: { memberIds?: readonly string[]; onPick: (d: DietDraft) => void; onClose: () => void }) {
  return (
    <Sheet
      title="New diet plan"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <p style={{ ...quiet, fontSize: 13, marginBottom: space.md }}>Start from a sample and change anything you like, or start empty. The samples are everyday Indian food, not medical advice.</p>
      <StarterList memberIds={memberIds} onPick={onPick} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- the builder

function DietPlanSheet({
  initial,
  save,
  onClose,
  onSaved,
}: {
  initial: DietDraft;
  save: (d: DietDraft) => Promise<DietPlan>;
  onClose: () => void;
  onSaved?: (plan: DietPlan, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<DietDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  const set = (patch: Partial<DietDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setMeal = (i: number, patch: Partial<DietMealDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, meals: d.meals.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  };

  const submit = async () => {
    if (saving) return;
    const { problem } = dietPayload(draft);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      const plan = await save(draft);
      onSaved?.(plan, isNew);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={isNew ? 'New diet plan' : 'Edit diet plan'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button needsInternet onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Save plan' : 'Save changes'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ ...quiet, fontSize: 13 }}>{MEMBERS_SEE_DIET}</p>
      <TextField label="Plan name" value={draft.title} onChange={(v) => set({ title: v })} placeholder="Fat loss veg · 1,600 kcal" autoFocus={isNew} />
      <TextField label="Goal (optional)" value={draft.goal} onChange={(v) => set({ goal: v })} placeholder="Lose fat slowly and keep your strength" />
      <div style={pairGrid}>
        <TextField label="Calories a day (optional)" inputMode="numeric" value={draft.kcal} onChange={(v) => set({ kcal: v })} placeholder="1600" hint="kcal" />
        <TextField label="Protein a day (optional)" inputMode="numeric" value={draft.proteinG} onChange={(v) => set({ proteinG: v })} placeholder="90" hint="grams" />
      </div>

      <div style={{ height: space.lg }} />
      <SectionTitle
        action={
          <Button variant="ghost" disabled={draft.meals.length >= DIET_LIMITS.meals} onClick={() => set({ meals: [...draft.meals, emptyMeal()] })}>
            + Add a meal
          </Button>
        }
      >
        Meals
      </SectionTitle>
      <div style={{ display: 'grid', gap: space.md }}>
        {draft.meals.map((m, i) => (
          <fieldset key={i} aria-label={`Meal ${i + 1}`} style={{ border: `1px solid ${color.border}`, borderRadius: 12, padding: `0 ${space.md}px ${space.md}px`, margin: 0, minWidth: 0 }}>
            <div style={pairGrid}>
              <TextField label="Meal" value={m.name} onChange={(v) => setMeal(i, { name: v })} placeholder="Breakfast" />
              <TextField label="Time (optional)" value={m.time} onChange={(v) => setMeal(i, { time: v })} placeholder="8:00 am" />
            </div>
            <TextField label="Food, one per line" value={m.itemsText} onChange={(v) => setMeal(i, { itemsText: v })} placeholder={'2 roti\n1 bowl dal\n1 bowl sabzi'} multiline />
            <div style={{ marginTop: space.xs }}>
              <Button variant="quiet" tone="danger" ariaLabel={`Remove meal ${m.name.trim() || i + 1}`} disabled={draft.meals.length <= 1} onClick={() => set({ meals: draft.meals.filter((_, j) => j !== i) })}>
                Remove this meal
              </Button>
            </div>
          </fieldset>
        ))}
      </div>

      <TextField label="Notes for the member (optional)" value={draft.notes} onChange={(v) => set({ notes: v })} placeholder={`Drink 3 litres of water a day. ${DOCTOR_LINE}`} multiline />
      {!draft.notes.includes(DOCTOR_LINE) && (
        <div style={{ marginTop: space.xs }}>
          <Button variant="quiet" onClick={() => set({ notes: `${draft.notes.trim()} ${DOCTOR_LINE}`.trim() })}>
            Add “{DOCTOR_LINE}”
          </Button>
        </div>
      )}

      <div style={{ height: space.lg }} />
      <AssignSection assign={draft.assign} onChange={(assign) => set({ assign })} />
    </Sheet>
  );
}

const pairGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', columnGap: space.md } as const;

// ---------------------------------------------------------------- Member detail

/**
 * Member detail → Diet plan: the plans this member gets (by name, or through their membership plan),
 * and "Send a diet plan" (a saved plan in one tap, a sample, or a new one with them ticked).
 */
export function MemberDietCard({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { snapshot, today } = useCrm();
  const { online, server, plans, error, reload, save } = useDietPlans();
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<DietDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, flash] = useFlash();
  const mine = useMemo(() => dietsForMember(plans ?? [], memberId, snapshot.memberships, today), [plans, memberId, snapshot.memberships, today]);
  const choices = useMemo(() => dietSendChoices(plans ?? [], memberId, snapshot.memberships, today), [plans, memberId, snapshot.memberships, today]);

  const sendOne = async (plan: DietPlan) => {
    if (busy) return;
    setBusy(plan.id);
    setSendError(null);
    try {
      await save(dietWithMember(plan, memberId));
      setSending(false);
      flash(`“${plan.title}” sent to ${memberName}.`);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send this plan. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const stopOne = async (plan: DietPlan) => {
    try {
      await save(dietWithoutMember(plan, memberId));
      flash(`${memberName} no longer gets “${plan.title}”.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not change it. Try again.');
    }
  };

  const ready = online && server === 'yes' && plans != null;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <section aria-label="Diet plan">
      <SectionTitle
        action={
          ready ? (
            <Button variant="ghost" needsInternet onClick={() => setSending(true)}>
              Send a diet plan
            </Button>
          ) : undefined
        }
      >
        Diet plan
      </SectionTitle>
      {!online ? (
        <p style={quiet}>Diet plans are kept on your gym’s server. Put your gym online first (Settings → Put your gym online).</p>
      ) : server === 'no' ? (
        <p style={quiet}>Diet plans are not switched on for your gym yet.</p>
      ) : error && plans == null ? (
        <>
          <ErrorBanner>{error}</ErrorBanner>
          <Button variant="ghost" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      ) : plans == null ? (
        <p style={quiet}>Loading…</p>
      ) : mine.length === 0 ? (
        <p style={quiet}>No diet plan sent yet. {MEMBERS_SEE_DIET}</p>
      ) : (
        <div style={{ display: 'grid', gap: space.xs }}>
          {mine.map((p) => {
            const byName = p.assign.memberIds.includes(memberId);
            return (
              <Row key={p.id} gap={space.sm}>
                <div style={{ flex: '1 1 200px', minWidth: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
                  <span style={{ color: color.ink, fontWeight: 600 }}>{p.title}</span>
                  {byName ? '' : ' · through their membership plan'}
                  <div style={{ fontSize: 12, color: color.inkMuted }}>{dietSizeWords(p)}</div>
                </div>
                {byName && (
                  <Button variant="quiet" needsInternet ariaLabel={`Stop sending ${p.title} to ${memberName}`} onClick={() => void stopOne(p)}>
                    Stop sending
                  </Button>
                )}
              </Row>
            );
          })}
        </div>
      )}

      {sending && (
        <Sheet
          title={`Send a diet plan to ${memberName}`}
          onClose={() => setSending(false)}
          footer={
            <Button variant="ghost" onClick={() => setSending(false)}>
              Cancel
            </Button>
          }
        >
          {sendError && <ErrorBanner>{sendError}</ErrorBanner>}
          <p style={{ ...quiet, fontSize: 13, marginBottom: space.md }}>{MEMBERS_SEE_DIET}</p>
          {choices.length > 0 && (
            <>
              <SectionTitle>Your gym’s diet plans</SectionTitle>
              <div style={{ display: 'grid', gap: space.sm, marginBottom: space.lg }}>
                {choices.map(({ plan, already }) => (
                  <ChoiceRow
                    key={plan.id}
                    title={plan.title}
                    sub={`${dietSizeWords(plan)} · ${assignSummary(plan, snapshot.plans)}`}
                    disabled={already || busy !== null}
                    ariaLabel={already ? `${plan.title}: already sent` : `Send ${plan.title} to ${memberName}`}
                    onClick={() => void sendOne(plan)}
                    side={
                      already ? (
                        <Pill>Already sent</Pill>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: color.accentBright, whiteSpace: 'nowrap' }}>{busy === plan.id ? 'Sending…' : 'Send'}</span>
                      )
                    }
                  />
                ))}
              </div>
            </>
          )}
          <SectionTitle>{choices.length > 0 ? 'Or make one for them' : 'Make one for them'}</SectionTitle>
          <div style={{ display: 'grid', gap: space.sm }}>
            <ChoiceRow
              title="Start from a sample"
              sub="Fat loss, muscle gain or keep your weight"
              onClick={() => {
                setSending(false);
                setStarting(true);
              }}
            />
            <ChoiceRow
              title="Write a new plan"
              sub="Every meal yourself"
              onClick={() => {
                setSending(false);
                setEditing(emptyDietDraft([memberId]));
              }}
            />
          </div>
        </Sheet>
      )}
      {starting && (
        <StartDietSheet
          memberIds={[memberId]}
          onClose={() => setStarting(false)}
          onPick={(d) => {
            setStarting(false);
            setEditing(d);
          }}
        />
      )}
      {editing && (
        <DietPlanSheet
          initial={editing}
          save={save}
          onClose={() => setEditing(null)}
          onSaved={(plan) => flash(plan.assign.memberIds.includes(memberId) ? `“${plan.title}” saved and sent to ${memberName}.` : `“${plan.title}” saved.`)}
        />
      )}
      {toast && <Toast message={toast} />}
      </section>
    </Card>
  );
}
