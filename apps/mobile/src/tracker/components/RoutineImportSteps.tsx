/**
 * v0.28.0 — after a Hevy / Strong history import: bring the member's own routines in, one
 * question per screen (owner, 8 Oct 2026: "not overcrowd … guided and step by step").
 *   1. Routines found — each recent one ticked; names not used for a year fold, unticked.
 *   2. Check each routine, one per screen — the last workout's exercises ticked, up to 5 more
 *      done under that name offered ("Also done in Push 1").
 *   3. Follow them? — Home's "Today" becomes the member's next routine. A member following
 *      another plan is asked, never switched silently.
 *   4. Done — the folder "From Hevy"; a later import updates it.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import type { ImportApp } from '../db/folderRepo';
import { APP_FOLDER_NAME, followQuestion, saveImportedRoutines } from '../services/routineImport';
import { chosenRoutines, findRoutines, nextUp, type FoundExercise, type FoundRoutine, type RebuildWorkout } from '../services/routineRebuild';

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

type Step = { kind: 'list' } | { kind: 'check'; i: number } | { kind: 'follow' } | { kind: 'done'; routines: number; followed: boolean };

export function RoutineImportSteps({ app, workouts, onClose }: { app: ImportApp; workouts: readonly RebuildWorkout[]; onClose: () => void }) {
  const router = useRouter();
  const appName = app === 'hevy' ? 'Hevy' : 'Strong';
  const folderName = APP_FOLDER_NAME[app];
  const found = useMemo(() => findRoutines(workouts), [workouts]);
  const recent = found.filter((r) => r.recent);
  const older = found.filter((r) => !r.recent);

  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [keep, setKeep] = useState<Set<string>>(() => new Set(recent.map((r) => r.title)));
  const [ticks, setTicks] = useState<Map<string, Set<string>>>(
    () => new Map(found.map((r) => [r.title, new Set(r.exercises.filter((e) => e.ticked).map((e) => e.title))])),
  );
  const [showOlder, setShowOlder] = useState(false);
  const [question, setQuestion] = useState<{ followingName: string | null; updating: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const kept: FoundRoutine[] = found.filter((r) => keep.has(r.title));
  const order = kept.map((r) => r.title);
  const upNext = nextUp(order, workouts);

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
    setQuestion(await followQuestion(app).catch(() => ({ followingName: null, updating: false })));
    setStep({ kind: 'follow' });
  };

  const save = async (follow: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const chosen = chosenRoutines(found, keep, ticks);
      const r = await saveImportedRoutines(app, chosen, { follow });
      success();
      setStep({ kind: 'done', routines: r.routines, followed: follow });
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
        sub={`${r.uses} workouts · last ${when(r.lastISO)}`}
        ticked={keep.has(r.title)}
        onPress={() => toggleRoutine(r.title)}
      />
    );
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={HEAD}>
            We found {found.length} routine{found.length === 1 ? '' : 's'} in your {appName} workouts
          </Text>
          <Text style={CAPTION}>
            {appName} does not export routines, so we rebuilt them from the workouts you started from each one. You check
            each one next.
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
                <Icon name={showOlder ? 'chevron-left' : 'chevron-right'} size={16} color={color.inkMuted} />
                <Text style={{ ...CAPTION, color: color.inkSecondary }}>
                  {older.length} older name{older.length === 1 ? '' : 's'} (not used for a year)
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
            From your last {r.title} ({when(r.lastISO)}). Untick anything that is not in this routine.
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
        <Text style={CAPTION}>Sets and reps are from the last time you did each one. You can change them later in the routine.</Text>
        <View style={{ gap: space.md }}>
          <PrimaryButton
            label="Next"
            icon="chevron-right"
            onPress={() => (lastOne ? void toFollow() : setStep({ kind: 'check', i: step.i + 1 }))}
          />
          <GhostButton label="Back" icon="chevron-left" onPress={() => setStep(step.i === 0 ? { kind: 'list' } : { kind: 'check', i: step.i - 1 })} />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- 3. follow them?
  if (step.kind === 'follow') {
    return (
      <View style={{ gap: space.lg }}>
        <Card style={{ gap: space.md, paddingVertical: space.xl }}>
          <Icon name="calendar" size={26} color={color.accent} />
          <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>Follow these as your plan?</Text>
          <Text style={{ ...CAPTION, color: color.inkSecondary }}>
            Home will show your next routine each day, in the order you do them.
            {upNext ? ` Next up: ${upNext.next} (after your last ${upNext.after}).` : ''}
          </Text>
          {question?.followingName ? (
            <Text style={CAPTION}>
              You follow “{question.followingName}” now. It stays in your routines if you switch.
            </Text>
          ) : null}
        </Card>
        <View style={{ gap: space.md }}>
          <PrimaryButton label={busy ? 'Saving…' : 'Follow them'} icon="check" loading={busy} onPress={() => void save(true)} />
          <GhostButton label={question?.followingName ? `Keep “${question.followingName}”` : 'Not now'} icon="close" onPress={() => void save(false)} />
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
          {step.routines} routine{step.routines === 1 ? '' : 's'} in {folderName}
        </Text>
        <Text style={{ ...CAPTION, textAlign: 'center' }}>
          {question?.updating ? `${folderName} now matches this file.` : 'Find them in Workout → Routines.'}
          {step.followed && upNext ? ` Home shows ${upNext.next} next.` : ''}
        </Text>
      </Card>
      <View style={{ gap: space.md }}>
        <PrimaryButton label="Open routines" icon="target" onPress={() => router.replace('/routines')} />
        <GhostButton label="Done" icon="check" onPress={onClose} />
      </View>
    </View>
  );
}
