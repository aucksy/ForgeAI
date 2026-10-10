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
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import type { ImportApp } from '../db/folderRepo';
import {
  followQuestion,
  homeToday,
  linkFollowQuestion,
  newExercisesIn,
  saveImportedRoutines,
  saveLinkedRoutines,
  type NewExercise,
} from '../services/routineImport';
import { chosenRoutines, findRoutines, type FoundExercise, type FoundRoutine, type RebuildWorkout } from '../services/routineRebuild';

const CAPTION = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 } as const;
const HEAD = { fontFamily: type.heading, fontSize: type.size.h3, color: color.ink } as const;

/** "5 Oct", or "Dec 2023" in another year. */
function when(iso: string): string {
  const y = Number(iso.slice(0, 4));
  if (y === new Date().getFullYear()) return tinyDate(iso);
  return `${tinyDate(iso).split(' ')[1]} ${y}`;
}

function setsText(e: FoundExercise): string {
  const s = `${e.sets} set${e.sets === 1 ? '' : 's'}`;
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
  | { kind: 'new'; items: NewExercise[] }
  | { kind: 'follow' }
  | { kind: 'done'; routines: number; folder: string; today: string | null; created: number };

/** v0.29.0: routines read from a share link, with the folder's name and each exercise's rest. */
export interface LinkRoutines {
  url: string;
  folderName: string;
  found: FoundRoutine[];
  rests: ReadonlyMap<string, number>;
}

export function RoutineImportSteps({
  app,
  workouts,
  link,
  onClose,
}: {
  app: ImportApp;
  workouts?: readonly RebuildWorkout[];
  link?: LinkRoutines;
  onClose: () => void;
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
    () => new Map(found.map((r) => [r.title, new Set(r.exercises.filter((e) => e.ticked).map((e) => e.title))])),
  );
  const [showOlder, setShowOlder] = useState(false);
  const [question, setQuestion] = useState<{ followingName: string | null; updatingName: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  /** v0.29.1: exercises new to ForgeAI the member chose not to add (left out of the routines). */
  const [leaveOut, setLeaveOut] = useState<Set<string>>(() => new Set());

  const kept: FoundRoutine[] = found.filter((r) => keep.has(r.title));
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
    setStep({ kind: 'follow' });
  };

  /**
   * v0.29.1: after the last routine — a link's exercises ForgeAI does not have yet are shown first
   * (each is added as the member's own exercise, so its Hevy history and the routine stay one).
   * A file import made them already, with the history.
   */
  const afterChecks = async () => {
    const items = link ? await newExercisesIn(ticked).catch(() => []) : [];
    if (items.length > 0) setStep({ kind: 'new', items });
    else await toFollow();
  };

  /** The unticked new exercises are left out by `saved`; now ask about following. */
  const addNew = async () => {
    await toFollow();
  };

  const save = async (follow: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // Written out plainly: on the phone, `{ ...(await …) }` inside `a ? b : c` came back
      // without its fields (the done screen read "routines in", v0.29.0 phone test part J).
      let r: { routines: number; name: string; created: number };
      if (link) {
        r = await saveLinkedRoutines(link, saved, { follow });
      } else {
        const s = await saveImportedRoutines(app, saved, { follow });
        r = { routines: s.routines, name: s.name, created: 0 };
      }
      // Home's own answer (its rotation reads every recent workout, not only this file).
      const today = await homeToday();
      success();
      setStep({ kind: 'done', routines: r.routines, folder: r.name, today, created: r.created });
    } catch {
      warn();
      Alert.alert('Couldn’t save the routines', 'Nothing was changed. Please try again.');
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
              ? 'Copied exactly as saved in Hevy. You check each one next.'
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
        <View style={{ gap: space.md }}>
          <PrimaryButton
            label={kept.length === 0 ? 'Tick a routine' : `Check ${kept.length === 1 ? 'it' : `these ${kept.length}`}`}
            icon="chevron-right"
            disabled={kept.length === 0}
            onPress={() => setStep({ kind: 'check', i: 0 })}
          />
          <GhostButton label="Skip routines" icon="close" onPress={onClose} />
        </View>
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
            <TickRow key={e.title} label={e.title} sub={setsText(e)} ticked={t.has(e.title)} onPress={() => toggleExercise(r.title, e.title)} />
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
                  key={e.title}
                  label={e.title}
                  sub={`last ${when(e.lastISO)} · ${setsText(e)}`}
                  ticked={t.has(e.title)}
                  onPress={() => toggleExercise(r.title, e.title)}
                />
              ))}
            </Card>
          </View>
        ) : null}
        <Text style={CAPTION}>
          {link
            ? 'Sets, reps and rest are as saved in Hevy. You can change them later in the routine.'
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
    const adding = step.items.filter((e) => !leaveOut.has(e.title)).length;
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={HEAD}>
            {step.items.length} exercise{step.items.length === 1 ? ' is' : 's are'} new to ForgeAI
          </Text>
          <Text style={CAPTION}>
            We add {step.items.length === 1 ? 'it' : 'them'} to your exercises with the same name, so your Hevy history and these
            routines stay together. Untick one to leave it out.
          </Text>
        </View>
        <Card>
          {step.items.map((e) => (
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
        <Text style={CAPTION}>Add a photo or change the muscle any time: Workout → Exercise library.</Text>
        <View style={{ gap: space.md }}>
          <PrimaryButton
            label={adding === 0 ? 'Leave them out' : `Add ${adding === 1 ? 'it' : `these ${adding}`}`}
            icon="chevron-right"
            onPress={() => void addNew()}
          />
          <GhostButton label="Back" icon="chevron-left" onPress={() => setStep({ kind: 'check', i: kept.length - 1 })} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- 3. follow them?
  if (step.kind === 'follow') {
    const back = () => setStep({ kind: 'check', i: kept.length - 1 });
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
            Home will show your next routine each day, in the order you do them: {saved.map((r) => r.title).join(', ')}.
          </Text>
          {question?.followingName ? (
            <Text style={CAPTION}>You follow “{question.followingName}” now. It stays in your routines if you switch.</Text>
          ) : null}
          {question?.updatingName ? (
            <Text style={CAPTION}>This replaces the routines in “{question.updatingName}” with these.</Text>
          ) : null}
        </Card>
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
          {question?.updatingName ? `${step.folder} now matches this ${link ? 'link' : 'file'}.` : 'Find them in Workout → Routines.'}
          {step.today ? ` Home shows ${step.today} today.` : ''}
          {step.created > 0 ? ` ${step.created} new exercise${step.created === 1 ? '' : 's'} added to your library.` : ''}
        </Text>
      </Card>
      <View style={{ gap: space.md }}>
        <PrimaryButton label="Open routines" icon="target" onPress={() => router.replace('/routines')} />
        <GhostButton label="Done" icon="check" onPress={onClose} />
      </View>
    </View>
  );
}
