/**
 * Create a custom exercise — or edit one (`?id=`) — Phase 2.
 *
 * The form asks only what changes how the exercise is logged and counted: its name, how
 * it is logged (weight and reps, reps only, time…), the muscles it works (finer: front /
 * side / rear shoulders…), equipment, and the member's own photo or video. Body weight in
 * volume is offered only for bodyweight types. Library exercises opened here can only get
 * the member's own photo or video; their name, muscles and type stay the library's.
 * Once an exercise has logged sets its log type is fixed (the history was logged that way).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Chip, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { getAllExercises } from '@/db/repos/exerciseRepo';
import { color, radius, space, type } from '@/theme/tokens';
import type { Exercise } from '@/types/models';

import { MUSCLE_LABEL, MUSCLES, type Muscle } from '@/tracker/catalog/muscles';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { createCustomExercise, setExerciseMedia, updateCustomExercise } from '@/tracker/db/customExercise';
import { exerciseHasSets, getTrackerExercise, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { LOG_TYPE_LABEL, LOG_TYPES, type LogType } from '@/tracker/engine/logTypes';
import {
  deleteKeptMedia,
  keepPendingMedia,
  MAX_VIDEO_SEC,
  pickFromGallery,
  takeWithCamera,
  type PickedMedia,
} from '@/tracker/services/exerciseMedia';

type Equipment = Exercise['equipment'];

const EQUIPMENTS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const INCREMENTS = [0.5, 1, 2.5, 5];

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));
const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

function defaultIncrement(eq: Equipment): number {
  switch (eq) {
    case 'machine':
      return 5;
    case 'bodyweight':
      return 1;
    default:
      return 2.5;
  }
}

const isBodyweightType = (t: LogType): boolean => t === 'reps' || t === 'weighted' || t === 'assisted';
const usesWeight = (t: LogType): boolean => t === 'weight_reps' || t === 'weighted' || t === 'assisted';

function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>{children}</Text>;
}

export default function NewExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const editId = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [existing, setExisting] = useState<TrackerExercise | null>(null);
  const [typeLocked, setTypeLocked] = useState(false);
  const [name, setName] = useState('');
  const [logType, setLogType] = useState<LogType>('weight_reps');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [secondary, setSecondary] = useState<Muscle[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [isCompound, setIsCompound] = useState(false);
  const [increment, setIncrement] = useState<number>(2.5);
  const [countsBodyweight, setCountsBodyweight] = useState(false);
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [saving, setSaving] = useState(false);
  // A picked file is being copied in: buttons and Save wait for it.
  const [mediaBusy, setMediaBusy] = useState(false);
  const savingRef = useRef(false);
  /** Files picked during this visit — deleted again if the member leaves without saving. */
  const pickedHere = useRef<string[]>([]);
  /** A photo or video brought back after Android closed the app wins over the saved one. */
  const recovered = useRef(false);

  const isLibrary = existing?.catalogKey != null;

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    void Promise.all([getTrackerExercise(editId), exerciseHasSets(editId).catch(() => true)]).then(([ex, used]) => {
      if (!alive || !ex) return;
      setExisting(ex);
      setTypeLocked(used);
      setName(ex.name);
      setLogType(ex.logType);
      setMuscle(ex.muscles.primary[0] ?? null);
      setSecondary(ex.muscles.secondary);
      setEquipment(ex.equipment);
      setIsCompound(ex.isCompound);
      setIncrement(ex.incrementKg);
      setCountsBodyweight(ex.bwShare > 0);
      if (!recovered.current) setMedia(ex.mediaUri && ex.mediaType ? { uri: ex.mediaUri, type: ex.mediaType } : null);
    });
    return () => {
      alive = false;
    };
  }, [editId]);

  // Leaving without saving: drop files copied in during this visit.
  useEffect(
    () => () => {
      if (!savingRef.current) for (const uri of pickedHere.current) void deleteKeptMedia(uri);
    },
    [],
  );

  // Phase 3 review: a photo or video taken while Android closed the app behind the camera
  // comes back into the form (before, it was lost; the rest of the form starts over).
  useEffect(() => {
    let alive = true;
    keepPendingMedia()
      .then((m) => {
        if (!m) return;
        if (!alive) return void deleteKeptMedia(m.uri);
        pickedHere.current.push(m.uri);
        recovered.current = true;
        setMedia(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const pickEquipment = (eq: Equipment): void => {
    setEquipment(eq);
    setIncrement(defaultIncrement(eq));
  };

  const pickType = (t: LogType): void => {
    if (typeLocked) return;
    setLogType(t);
    if (isBodyweightType(t) && !isBodyweightType(logType)) {
      setEquipment((cur) => cur ?? 'bodyweight');
      setCountsBodyweight(/pull|chin|dip|muscle/i.test(name));
    }
  };

  const toggleSecondary = (m: Muscle): void => {
    setSecondary((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  const addMedia = async (from: 'gallery' | 'photo' | 'video'): Promise<void> => {
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      const picked = from === 'gallery' ? await pickFromGallery() : await takeWithCamera(from === 'video' ? 'video' : 'image');
      if (!picked) return;
      pickedHere.current.push(picked.uri);
      setMedia(picked);
    } catch (e) {
      const why = e instanceof Error ? e.message : '';
      Alert.alert(
        'Could not add it',
        why === 'camera-denied'
          ? 'ForgeAI needs the camera for this. You can allow it in your phone settings, or choose from your gallery.'
          : why === 'video-too-long'
            ? `Pick a video of ${MAX_VIDEO_SEC} seconds or less — one or two reps is plenty.`
            : why === 'video-too-big'
              ? 'That video is too large. Pick a shorter one.'
              : 'Something went wrong. Please try again.',
      );
    } finally {
      setMediaBusy(false);
    }
  };

  // Never while a picked file is still being copied in (the save would miss it).
  const canSave = isLibrary
    ? !saving && !mediaBusy
    : name.trim().length > 0 && muscle !== null && equipment !== null && !saving && !mediaBusy;

  const onSave = async (): Promise<void> => {
    if (savingRef.current) return;
    const trimmed = name.trim();
    savingRef.current = true;
    setSaving(true);
    const before = existing?.mediaUri ?? null;
    // Picked-then-replaced files from this visit are not kept.
    const dropUnused = async (): Promise<void> => {
      for (const uri of pickedHere.current) if (uri !== media?.uri) await deleteKeptMedia(uri);
    };
    try {
      if (existing && isLibrary) {
        await setExerciseMedia(existing.id, { uri: media?.uri ?? null, type: media?.type ?? null });
      } else {
        if (!trimmed || muscle === null || equipment === null) throw new Error('incomplete');
        // Exact (case/space-insensitive) name-collision guard only — NOT the fuzzy
        // findExerciseByName matcher, which would block valid distinct names
        // (e.g. "Bulgarian Split Squat" when "Squat" exists).
        const all = await getAllExercises();
        const clash = all.find((e) => norm(e.name) === norm(trimmed) && e.id !== existing?.id) ?? null;
        if (clash) {
          savingRef.current = false;
          setSaving(false);
          Alert.alert('Already in your library', `"${clash.name}" already exists.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open it', onPress: () => router.replace({ pathname: '/exercise/[id]', params: { id: clash.id } }) },
          ]);
          return;
        }
        const input = {
          name: trimmed,
          logType,
          muscles: { primary: [muscle], secondary: secondary.filter((m) => m !== muscle) },
          equipment,
          isCompound,
          incrementKg: increment,
          countsBodyweight,
        };
        const m = { uri: media?.uri ?? null, type: media?.type ?? null };
        if (existing) {
          await updateCustomExercise(existing.id, input, m, typeLocked);
        } else {
          const id = await createCustomExercise(input, m);
          await dropUnused();
          router.replace({ pathname: '/exercise/[id]', params: { id } });
          return;
        }
      }
      // The old file is no longer used by anything.
      if (before && before !== media?.uri) await deleteKeptMedia(before);
      await dropUnused();
      router.back();
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Could not save', 'Something went wrong saving the exercise. Please try again.');
    }
  };

  const title = existing ? (isLibrary ? 'Your photo or video' : 'Edit exercise') : 'New exercise';

  return (
    <Screen title={title} right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}>
      <View style={{ gap: space.lg }}>
        {isLibrary ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
            {existing?.name} is from the exercise library. Add your own photo or video of it — for example your gym's machine. It shows instead of the library picture.
          </Text>
        ) : (
          <>
            {/* name */}
            <View style={{ gap: space.sm }}>
              <FieldLabel>Name</FieldLabel>
              <View
                style={{
                  height: 46,
                  paddingHorizontal: space.md,
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: color.surfaceSunken,
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Incline Bench Press"
                  placeholderTextColor={color.inkMuted}
                  autoCorrect={false}
                  accessibilityLabel="Exercise name"
                  style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink, paddingVertical: 0 }}
                />
              </View>
            </View>

            {/* how it is logged */}
            <View style={{ gap: space.sm }}>
              <FieldLabel>How you log it</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {LOG_TYPES.map((t) => (
                  <Chip key={t} label={LOG_TYPE_LABEL[t]} selected={logType === t} onPress={() => pickType(t)} />
                ))}
              </View>
              {typeLocked ? (
                <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                  This exercise already has logged sets, so how it is logged stays the same.
                </Text>
              ) : null}
            </View>

            {/* primary muscle (finer) */}
            <View style={{ gap: space.sm }}>
              <FieldLabel>Main muscle</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {MUSCLES.map((m) => (
                  <Chip key={m} label={MUSCLE_LABEL[m]} selected={muscle === m} onPress={() => setMuscle(m)} />
                ))}
              </View>
            </View>

            {/* equipment */}
            <View style={{ gap: space.sm }}>
              <FieldLabel>Equipment</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {EQUIPMENTS.map((eq) => (
                  <Chip key={eq} label={cap(eq)} selected={equipment === eq} onPress={() => pickEquipment(eq)} />
                ))}
              </View>
            </View>

            {/* secondary muscles (optional) */}
            <View style={{ gap: space.sm }}>
              <FieldLabel>Also works (optional)</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {MUSCLES.filter((m) => m !== muscle).map((m) => (
                  <Chip key={m} label={MUSCLE_LABEL[m]} selected={secondary.includes(m)} onPress={() => toggleSecondary(m)} />
                ))}
              </View>
            </View>

            {isBodyweightType(logType) ? (
              <View style={{ gap: space.sm }}>
                <FieldLabel>Body weight in volume</FieldLabel>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Chip label="Counts (pull-up, dip)" selected={countsBodyweight} onPress={() => setCountsBodyweight(true)} />
                  <Chip label="Doesn't count" selected={!countsBodyweight} onPress={() => setCountsBodyweight(false)} />
                </View>
              </View>
            ) : null}

            {usesWeight(logType) ? (
              <>
                <View style={{ gap: space.sm }}>
                  <FieldLabel>Movement type</FieldLabel>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Chip label="Compound" selected={isCompound} onPress={() => setIsCompound(true)} />
                    <Chip label="Isolation" selected={!isCompound} onPress={() => setIsCompound(false)} />
                  </View>
                </View>
                <View style={{ gap: space.sm }}>
                  <FieldLabel>Weight increment</FieldLabel>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {INCREMENTS.map((n) => (
                      <Chip key={n} label={`${n} kg`} selected={increment === n} onPress={() => setIncrement(n)} />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
          </>
        )}

        {/* the member's own photo or video */}
        <View style={{ gap: space.sm }}>
          <FieldLabel>Photo or video (optional)</FieldLabel>
          {media ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              {media.type === 'image' ? (
                <Image source={{ uri: media.uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} contentFit="cover" />
              ) : (
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: radius.md,
                    backgroundColor: color.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Glyph name="play" size={28} color={color.accent} />
                </View>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
                  {media.type === 'video' ? 'Your video' : 'Your photo'}
                </Text>
                <Pressable onPress={() => setMedia(null)} accessibilityRole="button" accessibilityLabel="Remove photo or video" hitSlop={8}>
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.criticalText }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm, opacity: mediaBusy ? 0.5 : 1 }}>
            <View style={{ flex: 1 }}>
              <GhostButton label="Choose" icon="plus" onPress={() => void addMedia('gallery')} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label="Photo" icon="camera" onPress={() => void addMedia('photo')} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label="Video" icon="camera" onPress={() => void addMedia('video')} />
            </View>
          </View>
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
            {mediaBusy
              ? 'Adding it…'
              : `Kept on this phone. Videos up to ${MAX_VIDEO_SEC} s play on a silent loop when you tap the exercise's picture.`}
          </Text>
        </View>

        <PrimaryButton
          label={existing ? 'Save changes' : 'Save exercise'}
          icon="check"
          loading={saving}
          disabled={!canSave}
          onPress={() => void onSave()}
        />
      </View>
    </Screen>
  );
}
