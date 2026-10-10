/**
 * Migrate from Hevy — pick a Hevy export (.csv/.xlsx), preview what will be
 * imported, choose Replace vs Merge, then write it into local history. Fully
 * offline: the file is read from disk and parsed on-device (SheetJS); no upload.
 *
 * v0.27.0: the same screen imports a Strong export (`/import?from=strong`): Strong's CSV is read
 * by `strongImport.ts` into the Hevy import's own shape, so preview, Replace / Merge and the
 * write are shared. An older Strong file does not say its units — the member says, once.
 *
 * v0.28.0: a file shared to ForgeAI from Android's share menu arrives here as `?file=` (copied
 * into the app's cache): it is read straight away — Hevy or Strong told by its content — so the
 * member lands on the preview. After the import, the member's own routines (`RoutineImportSteps`).
 *
 * Audit Phase 4: a picked file is told apart by its content too (IM-18: a Strong file through
 * "Import from Hevy" imports as Strong); a file that is neither says so (IM-17); the date range
 * has its years (IM-08); a file already imported says "All 12 workouts are already here" (IM-09);
 * an older Strong file asks "Bench Press 100 — kg or lb?" with no answer chosen for the member
 * (IM-06); names new to ForgeAI ask "Same as ForgeAI's …?" (IM-15).
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card, GhostButton, Icon, IconButton, PrimaryButton, Screen, UndoBar, askConfirm } from '@/components/ui';
import { countOwnWorkouts, isDemoData, prepareImportOverDemo } from '@/onboarding/db/dataActions';
import { replaceConfirmBody, replaceImpact, restoreSafetyCopy, takeSafetyCopy, type SafetyCopy } from '@/onboarding/db/importSafety';
import { normalizeName } from '@/onboarding/form';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { success, warn } from '@/lib/haptics';
import { useBackGuard } from '@/lib/useBackGuard';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';
import {
  parseHevyBase64,
  previewImport,
  runImport,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type ParsedHevy,
} from '@/tracker/services/hevyImport';
import { dateOrderQuestion, type DateOrder } from '@/tracker/services/importDates';
import { matchesFrom, suggestMatches, type NameSuggestion } from '@/tracker/services/importMatch';
import { allHereText, dateRangeText, doneTitle, importButtonLabel, unitsQuestion } from '@/tracker/services/importWords';
import { findRoutines } from '@/tracker/services/routineRebuild';
import { looksLikeStrong, parseStrongText, strongFileInfo, unitsExample, type FileUnits } from '@/tracker/services/strongImport';
import { NewNamesCard, RenamedList } from '@/tracker/components/NewNamesCard';
import { RoutineImportSteps } from '@/tracker/components/RoutineImportSteps';
import { removeWorkoutFromHealth, sendWorkoutsToHealth } from '@/tracker/phone/healthConnect';
import { shareProblemText, sharedFileKind } from '@/tracker/phone/sharedImport';

type Phase = 'idle' | 'preview' | 'importing' | 'done' | 'routines' | 'undone';

const CAPTION = {
  fontFamily: type.body,
  fontSize: type.size.sub,
  color: color.inkMuted,
  lineHeight: 19,
} as const;

function StatRow({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: space.sm + 2,
      }}
    >
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>
        {label}
      </Text>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: tint ?? color.ink }}>
        {value}
      </Text>
    </View>
  );
}

function ModeOption({
  label,
  body,
  selected,
  onPress,
  danger,
}: {
  label: string;
  body: string;
  selected: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: selected ? color.accentSoft : color.surfaceSunken,
        borderWidth: 1,
        borderColor: selected ? color.accent : color.border,
        opacity: pressed ? 0.7 : 1,
        gap: 4,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon
          name={selected ? 'check' : 'chevron-right'}
          size={16}
          color={selected ? color.accent : color.inkMuted}
        />
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{label}</Text>
      </View>
      <Text style={{ ...CAPTION, color: danger && selected ? color.criticalText : color.inkMuted }}>{body}</Text>
    </Pressable>
  );
}

export default function ImportScreen() {
  useKeepAwake(); // a long import shouldn't be interrupted by the screen sleeping
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; file?: string; name?: string; type?: string; shareError?: string }>();
  // A shared file says which app it came from by its content (read below).
  const [strong, setStrong] = useState(params.from === 'strong');
  const appName = strong ? 'Strong' : 'Hevy';
  // Strong (older files only): the units the file was written in, when it does not say. IM-06:
  // nothing is chosen for the member — Import waits for the answer, asked with a real set.
  const [strongText, setStrongText] = useState<string | null>(null);
  const [fileUnits, setFileUnits] = useState<FileUnits | null>(null);
  const [unitsExampleSet, setUnitsExampleSet] = useState<{ exercise: string; value: number } | null>(null);
  // Review fix: number-only dates that read two ways ("03/04/2026") and nothing in the file
  // settles it — the member says which (never guessed); Import waits for the answer.
  const [dateAsk, setDateAsk] = useState<string | null>(null);
  const [dateAnswer, setDateAnswer] = useState<DateOrder | null>(null);
  const hevyBase64 = useRef<string | null>(null);
  // An older Strong file that does not say its units (IM-06): the units question is shown.
  const [unitsAsk, setUnitsAsk] = useState(false);
  // IM-15: names new to ForgeAI with ForgeAI's closest exercise; the ones the member said "Yes" to.
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  const [same, setSame] = useState<Set<string>>(() => new Set());

  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedHevy | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  // Plain-words problems on the screen itself (no Android pop-ups). IM-17: a shared file ForgeAI
  // could not take says why.
  const [problem, setProblem] = useState<string | null>(() => shareProblemText(typeof params.shareError === 'string' ? params.shareError : null));

  // DS-05 / IM-01: over the demo, the whole demo goes first and the member gives their name.
  const [demo, setDemo] = useState(false);
  const [ownWorkouts, setOwnWorkouts] = useState(0);
  const [memberName, setMemberName] = useState('');
  const [nameProblem, setNameProblem] = useState(false);

  // IM-05: a copy of everything from before the import, so it can be undone on this screen.
  const undoCopy = useRef<SafetyCopy | null>(null);
  // The workouts the import wrote: Undo takes exactly these away (a workout saved since stays).
  const undoImported = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [undoBar, setUndoBar] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  // v0.28.1: workouts Replace deleted are taken out of Health Connect too, once Undo is no
  // longer possible (the member leaves this screen), so an undo never finds them gone there.
  const pendingHealth = useRef<string[]>([]);
  // Audit IM-16: the imported workouts go to Health Connect (when it is on) at the same moment;
  // Phase 6 review fix: so do earlier imports a Merge added sets to (their copy is replaced).
  const pendingSend = useRef<string[]>([]);
  const mounted = useRef(true);

  const flushHealth = (): void => {
    const gone = pendingHealth.current;
    const add = pendingSend.current;
    pendingHealth.current = [];
    pendingSend.current = [];
    undoCopy.current = null;
    if (gone.length === 0 && add.length === 0) return;
    void (async () => {
      for (const id of gone) await removeWorkoutFromHealth(id);
      await sendWorkoutsToHealth(add);
    })();
  };
  useEffect(
    () => () => {
      mounted.current = false;
      flushHealth();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // IM-10: Android Back. While the import writes, ask (leaving lets it finish; it is never
  // cancelled half-way); inside the routine steps, go one step back.
  const leaving = useRef(false);
  const stepsBack = useRef<(() => boolean) | null>(null);
  const close = (): void => {
    leaving.current = true;
    router.back();
  };
  useBackGuard((leave) => {
    if (leaving.current) return false;
    if (phase === 'importing') {
      void askConfirm({
        title: 'Import is running — keep waiting?',
        body: 'If you leave, it finishes in the background. It is never stopped half-way.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep waiting',
      }).then((go) => {
        if (!go) return;
        leaving.current = true;
        leave();
      });
      return true;
    }
    if (phase === 'routines') return stepsBack.current?.() ?? false;
    return false;
  });

  /** Read a picked or shared file into the preview. `asStrong` null = tell by its content. */
  const readFile = async (uri: string, name: string, asStrong: boolean | null, kind: 'sheet' | 'text' = 'text'): Promise<void> => {
    let p: ParsedHevy;
    let isStrong = asStrong;
    try {
      if (isStrong === null) {
        isStrong = kind === 'text' ? looksLikeStrong(await FileSystem.readAsStringAsync(uri)) : false;
        setStrong(isStrong);
      }
      if (isStrong) {
        const text = await FileSystem.readAsStringAsync(uri);
        if (!looksLikeStrong(text)) {
          throw new Error('That doesn’t look like a Strong export. In Strong, export your data and pick the .csv file.');
        }
        const info = strongFileInfo(text);
        // Read as kg for the counts; an older file waits for the member's answer (IM-06).
        p = parseStrongText(text, info.fileUnits ?? 'metric'); // throws a plain-words Error on a bad file
        // Kept to read again when the member answers the units or the date question.
        setStrongText(info.unitsKnown && !p.dateQuestion ? null : text);
        setFileUnits(info.unitsKnown ? info.fileUnits ?? 'metric' : null);
        setUnitsAsk(!info.unitsKnown);
        setUnitsExampleSet(info.unitsKnown ? null : unitsExample(text));
        hevyBase64.current = null;
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        try {
          p = parseHevyBase64(base64); // throws a user-safe Error on a bad file
        } catch (e) {
          // IM-17 / IM-18: neither app's columns — say so in plain words.
          if (e instanceof Error && /unexpected columns/.test(e.message)) throw new Error(NOT_AN_EXPORT);
          throw e;
        }
        setStrongText(null);
        setFileUnits(null);
        setUnitsAsk(false);
        hevyBase64.current = p.dateQuestion ? base64 : null;
      }
      setDateAsk(p.dateQuestion ?? null);
      setDateAnswer(null);
    } finally {
      // v0.28.1 / IM-19: the picked or shared copy (a whole workout history) does not stay in
      // the cache, also when the file could not be read.
      const cache = FileSystem.cacheDirectory;
      if (cache && uri.startsWith(cache)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
    if (p.workouts.length === 0) throw new Error('No workouts were found in that file.');
    const pv = await previewImport(p);
    setSuggestions(
      await suggestMatches(pv.newExercises.map((title) => ({ title, logType: pv.newExerciseTypes[title] ?? null }))).catch(() =>
        pv.newExercises.map((title) => ({ title, match: null })),
      ),
    );
    setSame(new Set());
    setParsed(p);
    setPreview(pv);
    setFileName(name || `${isStrong ? 'Strong' : 'Hevy'} export`);
    // v0.27.0: with the member's own workouts here, Merge is the safe start (a second import
    // must not delete what was logged in ForgeAI since). Replace only over nothing.
    // v0.28.1: a failed check is NOT demo data — never start on Replace over real workouts.
    const isDemo = await isDemoData().catch(() => false);
    const own = isDemo ? await countOwnWorkouts().catch(() => pv.existingWorkouts) : pv.existingWorkouts;
    setDemo(isDemo);
    setOwnWorkouts(own);
    // Over the demo the demo goes anyway; Merge keeps any workout the member logged themselves.
    setMode(own > 0 || isDemo ? 'merge' : 'replace');
    setPhase('preview');
  };

  const onPick = async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'], // Hevy exports vary (.csv text or a mislabelled .xlsx); parser validates
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      // IM-18: told apart by its content, like a shared file (a Strong file picked through
      // "Import from Hevy" imports as Strong; the button's app is only where the screen starts).
      await readFile(asset.uri, asset.name, null, sharedFileKind({ name: asset.name ?? '', type: asset.mimeType ?? '' }));
    } catch (e) {
      warn();
      setProblem(readProblemText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // v0.28.0: a shared file — read it once, straight away.
  const sharedRead = useRef(false);
  useEffect(() => {
    const uri = typeof params.file === 'string' ? params.file : null;
    if (!uri || sharedRead.current) return;
    sharedRead.current = true;
    busyRef.current = true;
    setBusy(true);
    const name = typeof params.name === 'string' ? params.name : '';
    readFile(uri, name, null, sharedFileKind({ name, type: typeof params.type === 'string' ? params.type : '' }))
      .catch((e: unknown) => {
        warn();
        setProblem(readProblemText(e));
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.file]);

  const onImport = async (): Promise<void> => {
    if (busyRef.current || !parsed) return;
    setProblem(null);
    const name = normalizeName(memberName);
    if (demo && name.length === 0) {
      setNameProblem(true);
      warn();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      // IM-05: Replace names what it deletes, and how much of it is not in the file.
      if (mode === 'replace') {
        const impact = await replaceImpact(parsed.workouts).catch(() => ({ removed: ownWorkouts, onlyHere: ownWorkouts }));
        if (impact.removed > 0) {
          const ok = await askConfirm({
            title: `Delete ${impact.removed} workout${impact.removed === 1 ? '' : 's'} first?`,
            body: replaceConfirmBody(impact.onlyHere),
            confirmLabel: 'Replace',
            destructive: true,
          });
          if (!ok) return;
        }
      }

      // The copy first: if it cannot be made, nothing is deleted.
      let copy: SafetyCopy | null = null;
      if (mode === 'replace' || demo) {
        try {
          copy = await takeSafetyCopy();
        } catch {
          warn();
          setProblem('Couldn’t keep a copy of your workouts first, so nothing was changed. Please try again.');
          return;
        }
      }

      setProgress({ done: 0, total: parsed.workouts.length });
      setPhase('importing');
      let demoGone = false;
      try {
        // DS-05 / IM-01: the whole demo goes BEFORE the import, so Merge never mixes into it.
        if (demo) {
          // Refused (no-op) when the stored data is no longer the demo: the import then runs
          // as an ordinary import over the member's own data.
          demoGone = (await prepareImportOverDemo(name)).prepared;
        }
        const r = await runImport(parsed, {
          mode,
          matches: matchesFrom(suggestions, same),
          onProgress: (done, total) => {
            if (done % 5 === 0 || done === total) setProgress({ done, total });
          },
        });
        void useOnboarding.getState().refreshDemoFlag();
        void useDashboard.getState().refresh().catch(() => undefined);
        // The demo was removed before the import, so every replaced workout is the member's.
        pendingHealth.current = r.replacedSessionIds ?? [];
        pendingSend.current = [...(r.createdSessionIds ?? []), ...(r.extendedSessionIds ?? [])];
        if (!mounted.current) {
          // The member left while it ran: no undo now; Health Connect catches up at once.
          flushHealth();
          return;
        }
        undoCopy.current = copy;
        undoImported.current = r.createdSessionIds ?? [];
        setCanUndo(copy !== null);
        if (copy) {
          const n = r.replacedSessionIds?.length ?? 0;
          setUndoBar(demo ? 'Demo removed, history imported' : `${n} workout${n === 1 ? '' : 's'} replaced`);
        }
        setResult(r);
        setPhase('done');
        success();
      } catch {
        warn();
        // The import is one transaction and rolled back. Removing the demo was not part of it:
        // put it back, so "nothing was changed" stays true.
        let restored = !demoGone;
        if (demoGone && copy) {
          restored = await restoreSafetyCopy(copy)
            .then(() => true)
            .catch(() => false);
          void useOnboarding.getState().refreshDemoFlag();
        }
        if (mounted.current) setPhase('preview');
        setProblem(
          restored
            ? 'The import failed. Nothing was changed. Please try again.'
            : 'The import failed. The demo data was removed; your own workouts are untouched. Please try again.',
        );
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // IM-05: Undo — everything back exactly as it was before the import.
  const onUndo = async (): Promise<void> => {
    const copy = undoCopy.current;
    if (!copy || undoing) return;
    setUndoing(true);
    setUndoBar(null);
    setProblem(null);
    try {
      await restoreSafetyCopy(copy, { importedSessionIds: undoImported.current });
      undoCopy.current = null;
      pendingHealth.current = []; // the replaced workouts are back; Health Connect keeps them
      pendingSend.current = []; // the imported ones are gone again: nothing to send
      setCanUndo(false);
      void useOnboarding.getState().refreshDemoFlag();
      void useDashboard.getState().refresh().catch(() => undefined);
      setPhase('undone');
      success();
    } catch {
      warn();
      setProblem('Couldn’t undo the import. Your imported workouts are still here. Please try again.');
    } finally {
      setUndoing(false);
    }
  };

  // An older Strong file: the member says which units it was written in; read it again.
  const needsUnits = unitsAsk && fileUnits == null;
  const needsDate = dateAsk != null && dateAnswer == null;
  const onFileUnits = async (u: FileUnits): Promise<void> => {
    if (!strongText || busyRef.current) return;
    setFileUnits(u);
    try {
      const p = parseStrongText(strongText, u, dateAnswer ?? undefined);
      setParsed(p);
      setPreview(await previewImport(p));
    } catch {
      // the file read fine a moment ago; keep what is shown
    }
  };
  // The member's answer to the date question: the file is read again that way round.
  const onDateOrder = async (o: DateOrder): Promise<void> => {
    if (busyRef.current) return;
    setDateAnswer(o);
    try {
      const p = strongText != null ? parseStrongText(strongText, fileUnits ?? 'metric', o) : hevyBase64.current ? parseHevyBase64(hevyBase64.current, { dateOrder: o }) : null;
      if (!p) return;
      setParsed(p);
      setPreview(await previewImport(p));
    } catch {
      // the file read fine a moment ago; keep what is shown
    }
  };

  // v0.28.0: the member's own routines, rebuilt from the same file (offered after the import).
  const routineCount = useMemo(() => {
    if (!parsed) return 0;
    const found = findRoutines(parsed.workouts);
    const recent = found.filter((r) => r.recent).length;
    return recent > 0 ? recent : found.length;
  }, [parsed]);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Screen
      scroll={phase !== 'importing'}
      title={strong ? 'Import from Strong' : 'Migrate from Hevy'}
      right={
        phase === 'importing' ? undefined : (
          <IconButton icon="close" onPress={close} accessibilityLabel="Close" />
        )
      }
    >
      {problem ? (
        <Text style={{ ...CAPTION, color: color.criticalText, marginBottom: space.md }}>{problem}</Text>
      ) : null}

      {/* ---------- idle: choose a file ---------- */}
      {phase === 'idle' ? (
        <View style={{ gap: space.lg }}>
          <Card>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="calendar" size={20} color={color.accent} />
                <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                  Bring your {appName} history in
                </Text>
              </View>
              {strong ? (
                <Text style={CAPTION}>
                  In Strong, go to <Text style={{ color: color.inkSecondary }}>Settings → Export Strong Data</Text> and
                  save the <Text style={{ color: color.inkSecondary }}>.csv</Text> file. Then pick that file here.
                  Kilograms or pounds: both are read.
                </Text>
              ) : (
                <Text style={CAPTION}>
                  In Hevy, go to <Text style={{ color: color.inkSecondary }}>Settings → Export &amp; Backup Data</Text> and
                  export your workouts. Then pick that <Text style={{ color: color.inkSecondary }}>.csv</Text> (or{' '}
                  <Text style={{ color: color.inkSecondary }}>.xlsx</Text>) file here. Kilograms or pounds: both are read.
                </Text>
              )}
              <Text style={CAPTION}>Everything is processed on your phone — nothing is uploaded.</Text>
            </View>
          </Card>
          <PrimaryButton
            label={busy ? 'Reading…' : `Choose ${appName} file`}
            icon="chart"
            loading={busy}
            onPress={() => void onPick()}
          />
        </View>
      ) : null}

      {/* ---------- preview: what will be imported + mode ---------- */}
      {phase === 'preview' && preview ? (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="check" size={15} color={color.goodText} />
            <Text
              style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, flex: 1 }}
              numberOfLines={1}
            >
              {fileName}
            </Text>
          </View>

          <Card>
            <StatRow label="Workouts" value={String(preview.workouts)} />
            <StatRow label="Sets" value={String(preview.sets)} />
            <StatRow
              label="Exercises"
              value={`${preview.distinctExercises}  ·  ${preview.newExercises.length} new`}
            />
            {preview.alreadyHere > 0 ? (
              <StatRow label="Already in ForgeAI" value={String(preview.alreadyHere)} tint={color.inkMuted} />
            ) : null}
            {preview.timedSets > 0 ? (
              <StatRow label="Timed or distance sets" value={String(preview.timedSets)} />
            ) : null}
            {preview.skippedRows > 0 ? (
              <StatRow
                label="Skipped rows (empty)"
                value={String(preview.skippedRows)}
                tint={color.inkMuted}
              />
            ) : null}
            {preview.badDateRows > 0 ? (
              <StatRow label="Rows left out (date unreadable)" value={String(preview.badDateRows)} tint={color.criticalText} />
            ) : null}
            {preview.dateRange ? (
              <StatRow label="Date range" value={dateRangeText(preview.dateRange.fromISO, preview.dateRange.toISO)} />
            ) : null}
          </Card>

          {/* IM-09: a file already imported says so first. */}
          {allHereText(preview) && mode === 'merge' ? (
            <Card style={{ gap: space.xs }}>
              <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{allHereText(preview)}</Text>
              <Text style={CAPTION}>Nothing in this file is new to ForgeAI, so nothing will be added.</Text>
            </Card>
          ) : null}

          {/* IM-15: names new to ForgeAI, each with ForgeAI's closest exercise to say "same as". */}
          <NewNamesCard
            suggestions={suggestions}
            same={same}
            onAnswer={(title, yes) =>
              setSame((cur) => {
                const n = new Set(cur);
                if (yes) n.add(title);
                else n.delete(title);
                return n;
              })
            }
          />
          <RenamedList renamed={preview.renamed} />

          {/* Review fix: rows whose date could not be read are said, with one of them. */}
          {preview.badDateRows > 0 ? (
            <Text style={CAPTION}>
              {preview.badDateRows} row{preview.badDateRows === 1 ? '' : 's'} could not be read as a date
              {preview.badDateExample ? ` (for example “${preview.badDateExample}”)` : ''}, so {preview.badDateRows === 1 ? 'it is' : 'they are'} left out. Everything else comes in.
            </Text>
          ) : null}

          {/* Review fix: a date that reads two ways is asked about, with a date from the file. */}
          {dateAsk ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{dateOrderQuestion(dateAsk).question}</Text>
              <Text style={CAPTION}>This file writes dates as numbers only, and they can be read two ways. Pick the one that matches your workouts.</Text>
              <ModeOption label={dateOrderQuestion(dateAsk).dayFirst} selected={dateAnswer === 'dmy'} onPress={() => void onDateOrder('dmy')} body="Day, then month (as most of the world writes it)." />
              <ModeOption label={dateOrderQuestion(dateAsk).monthFirst} selected={dateAnswer === 'mdy'} onPress={() => void onDateOrder('mdy')} body="Month, then day (as the US writes it)." />
            </View>
          ) : null}

          {unitsAsk && strongText != null ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{unitsQuestion(unitsExampleSet)}</Text>
              <Text style={{ ...CAPTION }}>This file does not say its units. Pick the one Strong showed you.</Text>
              <ModeOption
                label="Kilograms and km"
                selected={fileUnits === 'metric'}
                onPress={() => void onFileUnits('metric')}
                body={unitsExampleSet ? `${unitsExampleSet.exercise}: ${unitsExampleSet.value} kg` : 'Choose this if Strong showed your weights in kg.'}
              />
              <ModeOption
                label="Pounds and miles"
                selected={fileUnits === 'imperial'}
                onPress={() => void onFileUnits('imperial')}
                body={unitsExampleSet ? `${unitsExampleSet.exercise}: ${unitsExampleSet.value} lb (${Math.round(unitsExampleSet.value * 0.45359237 * 10) / 10} kg)` : 'Choose this if Strong showed your weights in lb.'}
              />
            </View>
          ) : null}

          {/* DS-05 / IM-01: over the demo, the whole demo goes first, and the name with it. */}
          {demo ? (
            <Card style={{ gap: space.sm }}>
              <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>The demo goes first</Text>
              <Text style={CAPTION}>
                The sample member’s workouts, body weight, food, plan, records and name are removed, then your history comes in.
                {ownWorkouts > 0 ? ` Your own ${ownWorkouts} workout${ownWorkouts === 1 ? ' stays' : 's stay'}.` : ''}
              </Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginTop: space.xs }}>
                Your name
              </Text>
              <View
                style={{
                  minHeight: 46,
                  paddingHorizontal: space.md,
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: color.surfaceSunken,
                  borderWidth: 1,
                  borderColor: nameProblem ? color.criticalText : color.border,
                }}
              >
                <TextInput
                  value={memberName}
                  onChangeText={(t) => {
                    setMemberName(t);
                    setNameProblem(false);
                  }}
                  placeholder="First and last name"
                  placeholderTextColor={color.inkMuted}
                  autoCapitalize="words"
                  maxLength={60}
                  accessibilityLabel="Your name"
                  style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink, paddingVertical: space.sm }}
                />
              </View>
              {nameProblem ? (
                <Text style={{ ...CAPTION, color: color.criticalText }}>Your name, please. The demo’s name goes with the demo.</Text>
              ) : null}
            </Card>
          ) : null}

          {!demo || ownWorkouts > 0 ? (
            <View style={{ gap: space.sm }}>
              <ModeOption
                label="Replace"
                danger
                selected={mode === 'replace'}
                onPress={() => setMode('replace')}
                body={
                  ownWorkouts > 0
                    ? `Delete all ${ownWorkouts} of your workout${ownWorkouts === 1 ? '' : 's'} in ForgeAI, then import. You can undo right after.`
                    : 'Import into an empty history.'
                }
              />
              <ModeOption
                label="Merge"
                selected={mode === 'merge'}
                onPress={() => setMode('merge')}
                body="Keep your current workouts and add these. A workout already here is skipped, also one you logged in ForgeAI too (same day, started within 30 minutes), so it’s safe to re-run."
              />
            </View>
          ) : null}

          <View style={{ gap: space.md }}>
            {allHereText(preview) && mode === 'merge' ? (
              routineCount > 0 ? (
                <PrimaryButton label="Bring my routines in" icon="chevron-right" onPress={() => setPhase('routines')} />
              ) : (
                <PrimaryButton label="Done" icon="check" onPress={close} />
              )
            ) : (
              <PrimaryButton
                label={needsUnits ? 'Choose kg or lb first' : needsDate ? 'Answer the date question first' : importButtonLabel(mode, preview)}
                icon="check"
                disabled={needsUnits || needsDate}
                onPress={() => void onImport()}
              />
            )}
            <GhostButton label="Choose a different file" icon="close" onPress={() => void onPick()} />
          </View>
        </View>
      ) : null}

      {/* ---------- importing: progress ---------- */}
      {phase === 'importing' ? (
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl, paddingBottom: space.xxxl }}>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Text style={{ fontFamily: type.mono, fontSize: type.size.hero, color: color.ink }}>{pct}%</Text>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>
              Importing {progress.done} / {progress.total} workouts
            </Text>
          </View>
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: radius.pill,
                backgroundColor: color.accent,
              }}
            />
          </View>
          <Text style={{ ...CAPTION, textAlign: 'center' as const }}>
            Building your history and detecting PRs. If you leave, it finishes on its own.
          </Text>
        </View>
      ) : null}

      {/* ---------- done: summary ---------- */}
      {phase === 'done' && result ? (
        <View style={{ gap: space.lg }}>
          {undoBar ? (
            <UndoBar message={undoBar} actionLabel="Undo" onAction={() => void onUndo()} onDismiss={() => setUndoBar(null)} />
          ) : null}
          <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
            <Icon name="trophy" size={30} color={color.accent} />
            <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>
              {doneTitle(result.imported)}
            </Text>
            <Text style={{ ...CAPTION, textAlign: 'center' as const }}>
              {result.imported > 0 ? `Your ${appName} history is now in ForgeAI.` : `Every workout in this file was already in ForgeAI.`}
            </Text>
          </Card>

          {canUndo ? (
            <GhostButton label={undoing ? 'Undoing…' : 'Undo import'} icon="close" onPress={() => void onUndo()} />
          ) : null}

          <Card>
            <StatRow label="Workouts added" value={String(result.imported)} tint={color.goodText} />
            <StatRow label="Sets logged" value={String(result.setsInserted)} />
            <StatRow label="New exercises created" value={String(result.createdExercises)} />
            {result.skippedSameWorkout > 0 ? (
              <StatRow label="Logged in ForgeAI too (skipped)" value={String(result.skippedSameWorkout)} tint={color.inkMuted} />
            ) : null}
            {result.skippedExisting > 0 ? (
              <StatRow
                label="Already imported (skipped)"
                value={String(result.skippedExisting)}
                tint={color.inkMuted}
              />
            ) : null}
            {result.backfilledSets > 0 ? (
              <StatRow
                label="Timed and distance sets added to earlier imports"
                value={String(result.backfilledSets)}
                tint={color.goodText}
              />
            ) : null}
          </Card>

          {routineCount > 0 ? (
            <View style={{ gap: space.md }}>
              <Text style={{ ...CAPTION, color: color.inkSecondary }}>
                Next: your {appName} routines. We found {routineCount} in this file.
              </Text>
              <PrimaryButton label="Bring my routines in" icon="chevron-right" onPress={() => setPhase('routines')} />
              <GhostButton label="Not now" icon="close" onPress={close} />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <PrimaryButton label="See your workouts" icon="calendar" onPress={() => router.replace('/history')} />
              <GhostButton label="Done" icon="check" onPress={close} />
            </View>
          )}
        </View>
      ) : null}

      {/* ---------- IM-05: the import was undone ---------- */}
      {phase === 'undone' ? (
        <View style={{ gap: space.lg }}>
          <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
            <Icon name="check" size={30} color={color.accent} />
            <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>Import undone</Text>
            <Text style={{ ...CAPTION, textAlign: 'center' as const }}>Everything is back as it was before the import.</Text>
          </Card>
          <GhostButton label="Done" icon="check" onPress={close} />
        </View>
      ) : null}

      {/* ---------- v0.28.0: the member's routines, step by step ---------- */}
      {phase === 'routines' && parsed ? (
        <RoutineImportSteps app={strong ? 'strong' : 'hevy'} workouts={parsed.workouts} onClose={close} backRef={stepsBack} />
      ) : null}
    </Screen>
  );
}

/** IM-17: what a file that is neither app's export gets. */
const NOT_AN_EXPORT = 'This file isn’t a Hevy or Strong export. In Hevy: Settings → Export & Backup Data. In Strong: Settings → Export Strong Data.';

/** A read problem in plain words (IM-17: "This file isn't…" stands on its own). */
function readProblemText(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m.startsWith('This file isn’t')) return m;
  return `Couldn’t read that file. ${m || 'Please try again.'}`;
}
