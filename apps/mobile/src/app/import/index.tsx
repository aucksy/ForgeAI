/**
 * Migrate from Hevy — pick a Hevy export (.csv/.xlsx), preview what will be
 * imported, choose Replace vs Merge, then write it into local history. Fully
 * offline: the file is read from disk and parsed on-device (SheetJS); no upload.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, GhostButton, Icon, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
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

type Phase = 'idle' | 'preview' | 'importing' | 'done';

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

  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedHevy | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const onPick = async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'], // Hevy exports vary (.csv text or a mislabelled .xlsx); parser validates
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const p = parseHevyBase64(base64); // throws a user-safe Error on a bad file
      if (p.workouts.length === 0) throw new Error('No workouts were found in that file.');
      const pv = await previewImport(p);
      setParsed(p);
      setPreview(pv);
      setFileName(asset.name || 'Hevy export');
      setMode('replace');
      setPhase('preview');
    } catch (e) {
      warn();
      Alert.alert('Couldn’t read that file', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onImport = async (): Promise<void> => {
    if (busyRef.current || !parsed) return;
    busyRef.current = true;
    setBusy(true);
    setProgress({ done: 0, total: parsed.workouts.length });
    setPhase('importing');
    try {
      const r = await runImport(parsed, {
        mode,
        onProgress: (done, total) => {
          if (done % 5 === 0 || done === total) setProgress({ done, total });
        },
      });
      setResult(r);
      setPhase('done');
      success();
    } catch {
      warn();
      setPhase('preview'); // the transaction rolled back — nothing changed
      Alert.alert('Import failed', 'Nothing was changed. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Screen
      scroll={phase !== 'importing'}
      title="Migrate from Hevy"
      right={
        phase === 'importing' ? undefined : (
          <IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />
        )
      }
    >
      {/* ---------- idle: choose a file ---------- */}
      {phase === 'idle' ? (
        <View style={{ gap: space.lg }}>
          <Card>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="calendar" size={20} color={color.accent} />
                <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                  Bring your Hevy history in
                </Text>
              </View>
              <Text style={CAPTION}>
                In Hevy, go to <Text style={{ color: color.inkSecondary }}>Settings → Export &amp; Backup Data</Text> and
                export your workouts. Then pick that <Text style={{ color: color.inkSecondary }}>.csv</Text> (or{' '}
                <Text style={{ color: color.inkSecondary }}>.xlsx</Text>) file here. Weights are read as kilograms.
              </Text>
              <Text style={CAPTION}>Everything is processed on your phone — nothing is uploaded.</Text>
            </View>
          </Card>
          <PrimaryButton
            label={busy ? 'Reading…' : 'Choose Hevy file'}
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
            {preview.skippedRows > 0 ? (
              <StatRow
                label="Skipped (cardio / timed)"
                value={String(preview.skippedRows)}
                tint={color.inkMuted}
              />
            ) : null}
            {preview.dateRange ? (
              <StatRow
                label="Date range"
                value={`${shortDate(preview.dateRange.fromISO)} → ${shortDate(preview.dateRange.toISO)}`}
              />
            ) : null}
          </Card>

          <View style={{ gap: space.sm }}>
            <ModeOption
              label="Replace"
              danger
              selected={mode === 'replace'}
              onPress={() => setMode('replace')}
              body={
                preview.existingWorkouts > 0
                  ? `Delete your current ${preview.existingWorkouts} workout${preview.existingWorkouts === 1 ? '' : 's'} (incl. demo data), then import. Recommended for a fresh migration.`
                  : 'Import into an empty history. Recommended for a fresh migration.'
              }
            />
            <ModeOption
              label="Merge"
              selected={mode === 'merge'}
              onPress={() => setMode('merge')}
              body="Keep your current workouts and add these. Any workout already imported is skipped, so it’s safe to re-run."
            />
          </View>

          <View style={{ gap: space.md }}>
            <PrimaryButton
              label={
                mode === 'replace'
                  ? `Replace with ${preview.workouts} workouts`
                  : `Merge ${preview.workouts} workouts`
              }
              icon="check"
              onPress={() => void onImport()}
            />
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
            Building your history and detecting PRs. Keep the app open.
          </Text>
        </View>
      ) : null}

      {/* ---------- done: summary ---------- */}
      {phase === 'done' && result ? (
        <View style={{ gap: space.lg }}>
          <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
            <Icon name="trophy" size={30} color={color.accent} />
            <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.ink }}>
              {result.imported} workouts imported
            </Text>
            <Text style={{ ...CAPTION, textAlign: 'center' as const }}>Your Hevy history is now in ForgeAI.</Text>
          </Card>

          <Card>
            <StatRow label="Workouts added" value={String(result.imported)} tint={color.goodText} />
            <StatRow label="Sets logged" value={String(result.setsInserted)} />
            <StatRow label="New exercises created" value={String(result.createdExercises)} />
            {result.skippedExisting > 0 ? (
              <StatRow
                label="Already imported (skipped)"
                value={String(result.skippedExisting)}
                tint={color.inkMuted}
              />
            ) : null}
          </Card>

          <View style={{ gap: space.md }}>
            <PrimaryButton label="See your workouts" icon="calendar" onPress={() => router.replace('/history')} />
            <GhostButton label="Done" icon="check" onPress={() => router.back()} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
