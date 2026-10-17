/**
 * A workout's photos (15 Oct 2026) — Hevy's "Add a photo / video" on Finish and in Edit Workout,
 * photos only, up to 4, private on this phone (see `services/workoutPhotos.ts` for the research).
 *
 * Used on the "Workout complete" summary (the workout is already saved there), on the workout's
 * own page and while editing a saved workout. Shows the photos as squares (tap → full screen,
 * pinch to zoom), each with a remove button that asks first; "Add photo" opens Take a photo /
 * Choose from gallery until there are 4. A photo is saved the moment it is picked.
 *
 * Every failure says so in plain words and is logged ('[ForgeErr] workout photo'); a cancelled
 * picker is not a failure. A refused camera (the permission ask, or the picker's "User rejected
 * permissions") is the member's answer: an info log line, plus the progress photos' words and
 * "Open settings".
 */
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askConfirm, GhostButton, Icon, IconButton } from '@/components/ui';
import { hitSlopFor } from '@/components/ui/a11y';
import { color, radius, space, type } from '@/theme/tokens';

import { getWorkoutPhotos } from '../db/workoutPhotoRepo';
import {
  addPhotoErrorText,
  addWorkoutPhotoFromCamera,
  addWorkoutPhotoFromGallery,
  deleteWorkoutPhoto,
  keepPendingWorkoutPhoto,
  photoSlotsLeft,
  reportWorkoutPhotoProblem,
  workoutPhotoCountText,
  type WorkoutPhoto,
} from '../services/workoutPhotos';

import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';
import { ZoomImage } from './ZoomImage';

const SQUARE = 76;

const warn = (e: unknown): void => console.warn('[ForgeErr] workout photo', e);

export const WorkoutPhotos = memo(function WorkoutPhotos({ sessionId, onChanged }: { sessionId: string; onChanged?: () => void }) {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<WorkoutPhoto[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [viewing, setViewing] = useState<WorkoutPhoto | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      // A photo taken while Android closed ForgeAI behind the camera is saved first.
      await keepPendingWorkoutPhoto(sessionId).catch((e: unknown) => warn(e));
      const list = await getWorkoutPhotos(sessionId);
      if (!alive.current) return;
      setPhotos(list);
      setLoadFailed(false);
    } catch (e) {
      warn(e);
      if (alive.current) setLoadFailed(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = (): void => {
    void load();
    onChanged?.();
  };

  const add = async (from: 'camera' | 'gallery'): Promise<void> => {
    setAdding(false);
    if (busy) return;
    setBusy(true);
    setNote(null);
    setDenied(false);
    try {
      const photo = from === 'camera' ? await addWorkoutPhotoFromCamera(sessionId) : await addWorkoutPhotoFromGallery(sessionId);
      // null = the member cancelled the picker: nothing to say, nothing to log.
      if (photo) changed();
    } catch (e) {
      // A refused camera is logged as info, not [ForgeErr]; it still gets the words + "Open settings".
      const problem = reportWorkoutPhotoProblem(e);
      if (!alive.current) return;
      setNote(addPhotoErrorText(problem));
      setDenied(problem === 'camera-denied');
      if (problem === 'limit') void load();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const remove = async (photo: WorkoutPhoto): Promise<void> => {
    const ok = await askConfirm({
      title: 'Remove this photo?',
      body: 'It is deleted from this workout and from the app for good.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setViewing(null);
    setNote(null);
    setDenied(false);
    try {
      await deleteWorkoutPhoto(photo);
      changed();
    } catch (e) {
      warn(e);
      if (alive.current) setNote('Couldn’t remove the photo. Please try again.');
    }
  };

  const openSettings = (): void => {
    Linking.openSettings().catch((e: unknown) => {
      warn(e);
      setNote('Couldn’t open settings. Open your phone’s Settings, then Apps, then ForgeAI, and allow the camera.');
    });
  };

  const list = photos ?? [];
  const left = photoSlotsLeft(list.length);

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="camera" size={16} color={color.accent} />
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Photos
        </Text>
        {photos ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{workoutPhotoCountText(list.length)}</Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>Private. They stay on this phone.</Text>

      {list.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {list.map((p, i) => (
            <View key={p.id} style={{ width: SQUARE, height: SQUARE }}>
              <Pressable
                onPress={() => setViewing(p)}
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 1}. Open`}
                style={{ width: SQUARE, height: SQUARE, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.border }}
              >
                <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" />
              </Pressable>
              <Pressable
                onPress={() => void remove(p)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                // UAT WP13: 26 dp drawn + 11 each side = 48 dp to the finger (10 made 46).
                hitSlop={hitSlopFor(26)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                }}
              >
                <Icon name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {loadFailed && photos === null ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.criticalText }}>Couldn’t load this workout’s photos.</Text>
          <GhostButton label="Try again" onPress={() => void load()} />
        </View>
      ) : photos && left > 0 ? (
        <GhostButton
          label={busy ? 'Adding…' : 'Add photo'}
          icon="camera"
          accessibilityLabel={`Add photo, ${left} of 4 left`}
          onPress={() => {
            if (!busy) setAdding(true);
          }}
        />
      ) : photos ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary }}>
          4 of 4 photos. Remove one to add another.
        </Text>
      ) : null}

      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, lineHeight: 17, color: color.criticalText }}>
          {note}
        </Text>
      ) : null}
      {denied ? <GhostButton label="Open settings" icon="settings" onPress={openSettings} /> : null}

      <TrackerSheet visible={adding} title="Add a photo to this workout" subtitle="Up to 4. Private: they stay on this phone." onClose={() => setAdding(false)}>
        <View style={{ gap: 2 }}>
          <SheetRow label="Take a photo" leading={<Icon name="camera" size={20} color={color.accent} />} onPress={() => void add('camera')} />
          <SheetRow label="Choose from gallery" leading={<Glyph name="image" size={20} color={color.accent} />} onPress={() => void add('gallery')} />
        </View>
      </TrackerSheet>

      <Modal visible={viewing != null} animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md }}>
              <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Workout photo</Text>
              <IconButton icon="close" onPress={() => setViewing(null)} accessibilityLabel="Close photo" />
            </View>
            {viewing ? <ZoomImage key={viewing.id} uri={viewing.uri} style={{ marginVertical: space.md }} accessibilityLabel="Workout photo" /> : null}
            {viewing ? (
              <Pressable
                onPress={() => void remove(viewing)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  alignSelf: 'center',
                  minHeight: 48,
                  paddingHorizontal: space.lg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  borderRadius: radius.md,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
                })}
              >
                <Glyph name="trash" size={20} color={color.criticalText} />
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.criticalText }}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
});
