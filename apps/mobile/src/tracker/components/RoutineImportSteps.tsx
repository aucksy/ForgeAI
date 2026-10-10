/**
 * v0.28.0 — after a Hevy / Strong history import: bring the member's own routines in, one
 * question per screen (owner, 8 Oct 2026: "not overcrowd … guided and step by step").
 *   1. Routines found — each recent one ticked; names not used for a year fold, unticked.
 *   2. Check each routine, one per screen — the last workout's exercises ticked, up to 5 more
 *      done under that name offered ("Also done in Push 1").
 *   3. Follow them? — Home's "Today" becomes the member's next routine. A member following
 *      another plan is asked, never switched silently. Nothing ticked → nothing to save.
 *   4. Done — the folder "From Hevy"; a later import updates it.
 * v0.29.0: the same steps for routines copied from a Hevy share link (`link`): exactly as saved,
 * every exercise ticked, saved as the folder named in Hevy.
 *
 * Audit Phase 4 (owner, 8 Oct: one question per screen, only questions that need an answer):
 *  - a link's routines come over exactly as saved, so checking each one is optional ("Check
 *    each one"); Next goes straight on;
 *  - names new to ForgeAI ask "Same as ForgeAI's …?" (IM-15);
 *  - a single routine asks which folder it joins (IM-21); a folder asks whether to follow it,
 *    and says "in the order you do them" only when the member's history gave that order (IM-03);
 *  - copying again keeps the member's own changes, and the last screen says so (IM-22).
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';

import { listFolders, type ImportApp } from '../db/folderRepo';
import { setsSummary } from '../plans/routineSets';
import { folderChoices, type FolderChoice } from '../services/folderChoice';
import { matchesFrom, suggestMatches, type NameSuggestion } from '../services/importMatch';
import {
  followQuestion,
  homeToday,
  linkFollowQuestion,
  linkRotation,
  newExercisesIn,
  saveImportedRoutines,
  routineSaveFailureText,
  saveLinkedRoutines,
  type NewExercise,
} from '../services/routineImport';
import { chosenRoutines, findRoutines, rowKey, type FoundExercise, type FoundRoutine, type RebuildWorkout } from '../services/routineRebuild';
import { renamedIn } from '../services/hevyImport';
import { MatchRow, RenamedList } from './NewNamesCard';

const CAPTION = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 } as const;
const HEAD = { fontFamily: type.heading, fontSize: type.size.h3, color: color.ink } as const;

/** "5 Oct", or "Dec 2023" in another year. */
function when(iso: string): string {
  const y = Number(iso.slice(0, 4));
  if (y === new Date().getFullYear()) return tinyDate(iso);
  return `${tinyDate(iso).split(' ')[1]} ${y}`;
}

function setsText(e: FoundExercise): string {
  // Phase 4: "2 warm-up · 3 sets · 8–15 reps" — warm-ups told apart, a timed one shows its time.
  const s = e.setList && e.setList.length > 0 ? setsSummary(e.setList) : `${e.sets} set${e.sets === 1 ? '' : 's'}`;
  const secs = e.setList?.find((x) => x.durationSec != null)?.durationSec;
  if (e.timed && secs) return `${s} · ${secs >= 60 && secs % 60 === 0 ? `${secs / 60} min` : `${secs} s`}`;
  if (e.repMin == null || e.repMax == null) return s;
  return `${s} · ${e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`} reps`;
}

function TickRow({ label, sub, ticked, onPress }: { label: string; sub: string; ticked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm + 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: ticked ? color.accent : color.border,
          backgroundColor: ticked ? color.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ticked ? <Icon name="check" size={14} color={color.ink} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: ticked ? color.ink : color.inkSecondary }}>{label}</Text>
        <Text style={CAPTION}>{sub}</Text>
      </View>
    </Pressable>
  );
}

type Step =
  | { kind: 'list' }
  | { kind: 'check'; i: number }
  | { kind: 'new'; items: NewExercise[]; suggestions: NameSuggestion[] }
  | { kind: 'folder'; choices: FolderChoice[] }
  | { kind: 'follow' }
  | { kind: 'done'; routines: number; folder: string; today: string | null; created: number; keptEdits: string[] };

/** v0.29.0: routines read from a share link, with the folder's name. */
export interface LinkRoutines {
  url: string;
  /** A folder link, or one routine (which then joins a folder the member picks, IM-21). */
  kind?: 'folder' | 'routine';
  folderName: string;
  found: FoundRoutine[];
  /** Phase 4: read from the page's own data — every set's type known, exactly as saved. */
  exact?: boolean;
}

export function RoutineImportSteps({
  app,
  workouts,
  link,
  onClose,
  backRef,
}: {
  app: ImportApp;
  workouts?: readonly RebuildWorkout[];
  link?: LinkRoutines;
  onClose: () => void;
  /**
   * IM-10: Android Back inside the steps. The screen calls `backRef.current()`; it goes one
   * step back and returns true, or returns false on the first and last steps (Back leaves).
   */
  backRef?: MutableRefObject<(() => boolean) | null>;
}) {
  const router = useRouter();
  const appName = app === 'hevy' ? 'Hevy' : 'Strong';
  const found = useMemo(() => link?.found ?? findRoutines(workouts ?? []), [link, workouts]);
  const recent = found.filter((r) => r.recent);
  const older = found.filter((r) => !r.recent);
  // The count is the routines in use; names not used for a year are folded below it.
  const shownCount = recent.length > 0 ? recent.length : found.length;

  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [keep, setKeep] = useState<Set<string>>(() => new Set(recent.map((r) => r.title)));
  const [ticks, setTicks] = useState<Map<string, Set<string>>>(
    () => new Map(found.map((r) => [r.title, new Set(r.exercises.filter((e) => e.ticked).map(rowKey))])),
  );
  const [showOlder, setShowOlder] = useState(false);
  const [question, setQuestion] = useState<{ followingName: string | null; updatingName: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  /** v0.29.1: exercises new to ForgeAI the member chose not to add (left out of the routines). */
  const [leaveOut, setLeaveOut] = useState<Set<string>>(() => new Set());
  /** IM-15: new names the member said are ForgeAI's suggested exercise ("Same as …? Yes"). */
  const [same, setSame] = useState<Set<string>>(() => new Set());
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  /** IM-03: the member's real rotation of the link's routines, when their history says it. */
  const [order, setOrder] = useState<string[] | null>(null);
  /** A link's routines are checked one by one only when the member asks ("Check each one"). */
  const [checking, setChecking] = useState(!link);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const single = link?.kind === 'routine';
  // IM-15: a link's names ForgeAI knows under another name, shown with both.
  const [renamed, setRenamed] = useState<{ from: string; to: string }[]>([]);
  useEffect(() => {
    if (!link) return undefined;
    let live = true;
    void renamedIn(link.found.flatMap((r) => r.exercises.map((e) => e.title)))
      .then((r) => {
        if (live) setRenamed(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [link]);

  const kept: FoundRoutine[] = found.filter((r) => keep.has(r.title));
  /** The step before the follow / folder / new-names screens: the last check, else the list. */
  const beforeQuestions = (): Step => (checking && kept.length > 0 ? { kind: 'check', i: kept.length - 1 } : { kind: 'list' });

  // IM-10: Back goes to the previous step, exactly like each step's own Back button.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (step.kind === 'check') {
        setStep(step.i === 0 ? { kind: 'list' } : { kind: 'check', i: step.i - 1 });
        return true;
      }
      if (step.kind === 'new' || step.kind === 'follow' || step.kind === 'folder') {
        setStep(beforeQuestions());
        return true;
      }
      return false; // the list (Back leaves the steps) and done
    };
    return () => {
      backRef.current = null;
    };
  });

  // What Save writes: kept routines with at least one ticked exercise, less the new exercises
  // the member chose to leave out (applied here, so Back and Next never lose that choice).
  const ticked = useMemo(() => chosenRoutines(found, keep, ticks), [found, keep, ticks]);
  const saved = useMemo(
    () =>
      leaveOut.size === 0
        ? ticked
        : ticked.map((r) => ({ ...r, exercises: r.exercises.filter((e) => !leaveOut.has(e.title)) })).filter((r) => r.exercises.length > 0),
    [ticked, leaveOut],
  );

  const toggleRoutine = (title: string) =>
    setKeep((k) => {
      const n = new Set(k);
      if (n.has(title)) n.delete(title);
      else n.add(title);
      return n;
    });
  const toggleExercise = (routine: string, ex: string) =>
    setTicks((m) => {
      const n = new Map(m);
      const s = new Set(n.get(routine) ?? []);
      if (s.has(ex)) s.delete(ex);
      else s.add(ex);
      n.set(routine, s);
      return n;
    });

  const toFollow = async () => {
    setQuestion(await (link ? linkFollowQuestion(link.url) : followQuestion(app)).catch(() => ({ followingName: null, updatingName: null })));
    // IM-03: a link's folder goes in the member's real rotation when their history says it.
    if (link) setOrder(await linkRotation(saved.map((r) => r.title)).catch(() => null));
    setStep({ kind: 'follow' });
  };

  /** IM-21: one routine joins a folder the member picks (no new folder named after it). */
  const toFolder = async () => {
    const folders = await listFolders().catch(() => []);
    setStep({ kind: 'folder', choices: folderChoices(folders) });
  };

  /** After the names: a single routine asks for its folder; a folder asks about following. */
  const toLastQuestion = async () => {
    if (single) await toFolder();
    else await toFollow();
  };

  /**
   * v0.29.1: after the routines — a link's exercises ForgeAI does not have yet are shown first
   * (each is added as the member's own exercise, so its Hevy history and the routine stay one).
   * IM-15: each with ForgeAI's closest exercise, to say "same as". A file import asked on its
   * preview already.
   */
  const afterChecks = async () => {
    const items = link ? await newExercisesIn(ticked).catch(() => []) : [];
    if (items.length > 0) {
      // A close match is suggested, not chosen: until the member says "Yes" it is kept as new.
      const sug = await suggestMatches(items.map((i) => ({ title: i.title, logType: i.logType }))).catch(() => [] as NameSuggestion[]);
      setSuggestions(sug);
      setStep({ kind: 'new', items, suggestions: sug });
    } else await toLastQuestion();
  };

  const save = async (follow: boolean, folderId?: string | null) => {
    if (busy) return;
    setBusy(true);
    setSaveProblem(null);
    try {
      // Written out plainly: on the phone, `{ ...(await …) }` inside `a ? b : c` came back
      // without its fields (the done screen read "routines in", v0.29.0 phone test part J).
      let r: { routines: number; name: string; created: number; keptEdits: string[] };
      if (link) {
        r = await saveLinkedRoutines(link, saved, { follow, folderId, order, matches: matchesFrom(suggestions, same) });
      } else {
        const s = await saveImportedRoutines(app, saved, { follow });
        r = { routines: s.routines, name: s.name, created: 0, keptEdits: s.keptEdits };
      }
      // Home's own answer (its rotation reads every recent workout, not only this file).
      const today = await homeToday();
      success();
      setStep({ kind: 'done', routines: r.routines, folder: r.name, today, created: r.created, keptEdits: r.keptEdits });
    } catch (e) {
      warn();
      // IM-20: say what was already written (new exercises), never "Nothing was changed" then.
      setSaveProblem(routineSaveFailureText(e));
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- 1. routines found
  if (step.kind === 'list') {
    const row = (r: FoundRoutine) => (
      <TickRow
        key={r.title}
        label={r.title}
        sub={link ? `${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'}` : `${r.uses} workouts · last ${when(r.lastISO)}`}
        ticked={keep.has(r.title)}
        onPress={() => toggleRoutine(r.title)}
      />
    );
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={HEAD}>
            {link
              ? `We found ${shownCount} routine${shownCount === 1 ? '' : 's'} in “${link.folderName}”`
              : `We found ${shownCount} routine${shownCount === 1 ? '' : 's'} in your ${appName} workouts`}
          </Text>
          <Text style={CAPTION}>
            {link
              ? link.exact
                ? 'Copied exactly as saved in Hevy: warm-ups, sets, reps and rest.'
                : 'Copied as Hevy shows them: sets, reps and rest.'
              : `${appName} does not export routines, so we rebuilt them from the workouts you started from each one. You check each one next.`}
          </Text>
        </View>
        <Card>
          {recent.map(row)}
          {older.length > 0 ? (
            <>
              <Pressable
                onPress={() => setShowOlder((v) => !v)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm + 2 }}
              >
                <Icon name="chevron-right" size={16} color={color.inkMuted} />
                <Text style={{ ...CAPTION, color: color.inkSecondary }}>
                  {showOlder ? 'Hide the older names' : `${older.length} older name${older.length === 1 ? '' : 's'} (not used for a year)`}
                </Text>
              </Pressable>
              {showOlder ? older.map(row) : null}
            </>
          ) : null}
        </Card>
        {link ? <RenamedList renamed={renamed} /> : null}
        {link ? (
          // A link is exactly as saved: Next goes on; checking each one is there if wanted.
          <View style={{ gap: space.md }}>
            <PrimaryButton
              label={kept.length === 0 ? 'Tick a routine' : 'Next'}
              icon="chevron-right"
              disabled={kept.length === 0}
              onPress={() => {
                setChecking(false);
                void afterChecks();
              }}
            />
            {kept.length > 0 ? (
              <GhostButton
                label="Check each one"
                icon="check"
                onPress={() => {
                  setChecking(true);
                  setStep({ kind: 'check', i: 0 });
                }}
              />
            ) : null}
            <GhostButton label="Cancel" icon="close" onPress={onClose} />
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <PrimaryButton
              label={kept.length === 0 ? 'Tick a routine' : `Check ${kept.length === 1 ? 'it' : `these ${kept.length}`}`}
              icon="chevron-right"
              disabled={kept.length === 0}
              onPress={() => setStep({ kind: 'check', i: 0 })}
            />
            <GhostButton label="Skip routines" icon="close" onPress={onClose} />
          </View>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------- 2. one routine per screen
  if (step.kind === 'check') {
    const r = kept[step.i];
    if (!r) return null; // the list only changes on step 1
    const t = ticks.get(r.title) ?? new Set<string>();
    const last = r.exercises.filter((e) => e.ticked);
    const more = r.exercises.filter((e) => !e.ticked);
    const lastOne = step.i === kept.length - 1;
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={{ ...CAPTION, color: color.inkSecondary }}>
            {step.i + 1} of {kept.length}
          </Text>
          <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>{r.title}</Text>
          <Text style={CAPTION}>
            {link
              ? 'As saved in Hevy. Untick anything you don’t want.'
              : `From your last ${r.title} (${when(r.lastISO)}). Untick anything that is not in this routine.`}
          </Text>
        </View>
        <Card>
          {last.map((e) => (
            <TickRow key={rowKey(e)} label={e.title} sub={setsText(e)} ticked={t.has(rowKey(e))} onPress={() => toggleExercise(r.title, rowKey(e))} />
          ))}
        </Card>
        {more.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <View style={{ gap: 2 }}>
              <Text style={HEAD}>Also done in {r.title}</Text>
              <Text style={CAPTION}>Tick any you skip some days but keep in the routine.</Text>
            </View>
            <Card>
              {more.map((e) => (
                <TickRow
                  key={rowKey(e)}
                  label={e.title}
                  sub={`last ${when(e.lastISO)} · ${setsText(e)}`}
                  ticked={t.has(rowKey(e))}
                  onPress={() => toggleExercise(r.title, rowKey(e))}
                />
              ))}
            </Card>
          </View>
        ) : null}
        <Text style={CAPTION}>
          {link
            ? 'Sets, warm-ups, reps and rest are as saved in Hevy. You can change them later in the routine.'
            : 'Sets and reps are from the last time you did each one. You can change them later in the routine.'}
        </Text>
        <View style={{ gap: space.md }}>
          <PrimaryButton
            label="Next"
            icon="chevron-right"
            onPress={() => (lastOne ? void afterChecks() : setStep({ kind: 'check', i: step.i + 1 }))}
          />
          <GhostButton label="Back" icon="chevron-left" onPress={() => setStep(step.i === 0 ? { kind: 'list' } : { kind: 'check', i: step.i - 1 })} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- 2b. new to ForgeAI (a link)
  if (step.kind === 'new') {
    const suggested = new Map(step.suggestions.map((s) => [s.title, s]));
    const asked = step.items.filter((e) => suggested.get(e.title)?.match);
    const plain = step.items.filter((e) => !suggested.get(e.title)?.match);
    const adding = plain.filter((e) => !leaveOut.has(e.title)).length + asked.length;
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={HEAD}>
            {step.items.length} name{step.items.length === 1 ? ' is' : 's are'} new to ForgeAI
          </Text>
          <Text style={CAPTION}>
            {asked.length > 0
              ? 'Say “Yes” and the routine uses ForgeAI’s exercise, with your history. “Keep as new” adds it as your own exercise with this name.'
              : `We add ${step.items.length === 1 ? 'it' : 'them'} to your exercises with the same name, so your Hevy history and these routines stay together. Untick one to leave it out.`}
          </Text>
        </View>
        {asked.length > 0 ? (
          <Card>
            {asked.map((e) => (
              <MatchRow
                key={e.title}
                s={suggested.get(e.title) as NameSuggestion}
                same={same.has(e.title)}
                onAnswer={(yes) =>
                  setSame((s) => {
                    const n = new Set(s);
                    if (yes) n.add(e.title);
                    else n.delete(e.title);
                    return n;
                  })
                }
              />
            ))}
          </Card>
        ) : null}
        {plain.length > 0 ? (
        <Card>
          {plain.map((e) => (
            <TickRow
              key={e.title}
              label={e.title}
              sub={e.about}
              ticked={!leaveOut.has(e.title)}
              onPress={() =>
                setLeaveOut((s) => {
                  const n = new Set(s);
                  if (n.has(e.title)) n.delete(e.title);
                  else n.add(e.title);
                  return n;
                })
              }
            />
          ))}
        </Card>
        ) : null}
        <Text style={CAPTION}>Add a photo or change the muscle any time: Workout → Exercise library.</Text>
        <View style={{ gap: space.md }}>
          <PrimaryButton
            label={adding === 0 ? 'Leave them out' : 'Next'}
            icon="chevron-right"
            onPress={() => void toLastQuestion()}
          />
          <GhostButton label="Back" icon="chevron-left" onPress={() => setStep(beforeQuestions())} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- 3a. one routine: which folder?
  if (step.kind === 'folder') {
    const r = saved[0];
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={HEAD}>Add {r ? `“${r.title}”` : 'it'} to which folder?</Text>
          <Text style={CAPTION}>Your plan only changes if you pick it. A routine of the same name there is updated, not doubled.</Text>
        </View>
        <Card>
          {step.choices.map((c) => (
            <Pressable
              key={c.folderId ?? 'mine'}
              onPress={() => void save(false, c.folderId)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}, ${c.value}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}
            >
              <Icon name={c.following ? 'target' : 'calendar'} size={18} color={color.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{c.label}</Text>
                <Text style={CAPTION}>{c.value}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={color.inkMuted} />
            </Pressable>
          ))}
        </Card>
        {saveProblem ? <Text style={{ ...CAPTION, color: color.criticalText }}>{saveProblem}</Text> : null}
        <GhostButton label="Back" icon="chevron-left" onPress={() => setStep(beforeQuestions())} />
      </View>
    );
  }

  // ---------------------------------------------------------------- 3. follow them?
  if (step.kind === 'follow') {
    const back = () => setStep(beforeQuestions());
    // IM-03: "in the order you do them" only when it is (the file's rotation, or a link's from
    // the member's history); otherwise the order Hevy saved them in.
    const shown = link ? (order ? saved.slice().sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title)) : saved) : saved;
    const realOrder = !link || order != null;
    if (saved.length === 0) {
      return (
        <View style={{ gap: space.lg }}>
          <Text style={{ ...CAPTION, color: color.inkSecondary }}>Every exercise is unticked, so there is nothing to save. Go back and tick the ones in each routine.</Text>
          <GhostButton label="Back" icon="chevron-left" onPress={back} />
        </View>
      );
    }
    return (
      <View style={{ gap: space.lg }}>
        <Card style={{ gap: space.md, paddingVertical: space.xl }}>
          <Icon name="calendar" size={26} color={color.accent} />
          <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>Follow these as your plan?</Text>
          <Text style={{ ...CAPTION, color: color.inkSecondary }}>
            {realOrder
              ? `Home will show your next routine each day, in the order you do them: ${shown.map((r) => r.title).join(', ')}.`
              : `Home will show your next routine each day. As saved in Hevy: ${shown.map((r) => r.title).join(', ')}. Drag them into your order any time in Workout → Routines.`}
          </Text>
          {question?.followingName ? (
            <Text style={CAPTION}>You follow “{question.followingName}” now. It stays in your routines if you switch.</Text>
          ) : null}
          {question?.updatingName ? (
            <Text style={CAPTION}>This updates the routines in “{question.updatingName}”. Anything you changed in them yourself is kept.</Text>
          ) : null}
        </Card>
        {saveProblem ? <Text style={{ ...CAPTION, color: color.criticalText }}>{saveProblem}</Text> : null}
        <View style={{ gap: space.md }}>
          <PrimaryButton label={busy ? 'Saving…' : 'Follow them'} icon="check" loading={busy} onPress={() => void save(true)} />
          <GhostButton
            label={question?.followingName ? `Keep “${question.followingName}”` : 'Save without following'}
            icon="close"
            onPress={() => void save(false)}
          />
          <GhostButton label="Back" icon="chevron-left" onPress={back} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- 4. done
  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
        <Icon name="target" size={30} color={color.accent} />
        <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink, textAlign: 'center' }}>
          {step.routines} routine{step.routines === 1 ? '' : 's'} in {step.folder}
        </Text>
        <Text style={{ ...CAPTION, textAlign: 'center' }}>
          {question?.updatingName ? `${step.folder} is updated from this ${link ? 'link' : 'file'}.` : 'Find them in Workout → Routines.'}
          {step.keptEdits.length > 0 ? ` Your own changes to ${step.keptEdits.join(', ')} were kept.` : ''}
          {step.today && !single ? ` Home shows ${step.today} today.` : ''}
          {step.created > 0 ? ` ${countWord(step.created, 'new exercise')} added to your library.` : ''}
        </Text>
      </Card>
      <View style={{ gap: space.md }}>
        <PrimaryButton label="Open routines" icon="target" onPress={() => router.replace('/routines')} />
        <GhostButton label="Done" icon="check" onPress={onClose} />
      </View>
    </View>
  );
}
