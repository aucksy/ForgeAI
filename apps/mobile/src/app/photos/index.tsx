/**
 * Progress photos (Phase 3) — free and private. Add from the camera or the gallery (the
 * picture is copied into the app, so it survives being deleted from the gallery); tap one to
 * see it big; "Compare two photos" puts any two side by side.
 *
 * Audit Phase 5:
 *  - PG-16: a gallery picture with no date of its own is not silently dated today — the
 *    member is asked the day; any photo's date can be changed from the viewer.
 *  - PG-17 / D11: "Save to phone gallery" on each photo (through the share list), and the
 *    opt-in backup copy is kept current when photos are added, re-dated or deleted.
 *  - PG-18: the viewer pinches and double-taps to zoom.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askConfirm, EmptyState, GhostButton, Icon, IconButton, LoadError, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { dateWithYear, tinyDate } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { color, radius, space, type } from '@/theme/tokens';
import { DatePickerSheet } from '@/tracker/components/DatePickerSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { ZoomImage } from '@/tracker/components/ZoomImage';
import { setPhotoDate } from '@/tracker/db/bodyEntries';
import { isPhotoBackupOn, refreshPhotoBackup, relinkPhotosFromBackup } from '@/tracker/services/photoBackup';
import { savePhotoToGallery } from '@/tracker/services/photoSave';
import {
  addPhotoFromCamera,
  addPhotoFromGallery,
  deleteProgressPhoto,
  getProgressPhotos,
  keepPendingPhoto,
  type ProgressPhoto,
} from '@/tracker/services/progressPhotos';

const COLS = 3;
const GAP = 8;

/** One action line in the dark viewer. */
function ViewerAction({ label, icon, onPress, danger }: { label: string; icon: ReactNode; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: space.sm,
        borderRadius: radius.md,
        backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
      })}
    >
      {icon}
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: danger ? color.criticalText : color.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function ProgressPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  // PG-23: a failed read shows "Couldn't load your photos", never "No photos yet".
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [backupOn, setBackupOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // PG-16: the photo whose day is being set, and why ('undated' = it came without one).
  const [dating, setDating] = useState<{ photo: ProgressPhoto; why: 'undated' | 'change' } | null>(null);

  const load = useCallback(() => {
    let alive = true;
    // PG-17: after a fresh install, photos come back from the backup folder first; then a
    // photo taken while Android closed the app behind the camera is saved.
    relinkPhotosFromBackup()
      .catch(() => 0)
      .then(() => keepPendingPhoto().catch(() => null))
      .then(() => getProgressPhotos())
      .then((p) => {
        if (!alive) return;
        setPhotos(p);
        setFailed(false);
      })
      .catch(() => {
        // Photos already on screen stay; with none, the screen shows LoadError.
        if (alive) setFailed(true);
      });
    isPhotoBackupOn()
      .then((on) => alive && setBackupOn(on))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(load);
  const retry = (): void => {
    setFailed(false);
    load();
  };

  const changed = (): void => {
    load();
    void refreshPhotoBackup();
  };

  const add = async (from: 'camera' | 'gallery'): Promise<void> => {
    setAdding(false);
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const photo = from === 'camera' ? await addPhotoFromCamera() : await addPhotoFromGallery();
      if (photo) {
        changed();
        // A picture with no date of its own (a WhatsApp copy, a screenshot): ask the day.
        if (from === 'gallery' && photo.undated) setDating({ photo, why: 'undated' });
      }
    } catch (e) {
      const denied = e instanceof Error && e.message === 'camera-denied';
      setNote(
        denied
          ? 'Camera not allowed. Allow the camera for ForgeAI in your phone settings, or choose a photo from the gallery.'
          : 'Couldn’t add the photo. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (photo: ProgressPhoto): Promise<void> => {
    const ok = await askConfirm({
      title: 'Delete this photo?',
      body: `From ${dateWithYear(photo.dateISO)}. It is removed from the app for good.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setViewing(null);
    try {
      await deleteProgressPhoto(photo);
      changed();
    } catch {
      setNote('Couldn’t delete the photo. Please try again.');
    }
  };

  const onSave = async (photo: ProgressPhoto): Promise<void> => {
    try {
      const ok = await savePhotoToGallery(photo.uri);
      if (!ok) setNote('This phone has no share list, so the photo couldn’t be handed over.');
    } catch {
      setNote('Couldn’t hand the photo over. Please try again.');
    }
  };

  const onChooseDay = async (iso: string): Promise<void> => {
    const d = dating;
    setDating(null);
    if (!d) return;
    try {
      await setPhotoDate(d.photo.id, iso);
      if (d.why === 'change') setViewing({ ...d.photo, dateISO: iso });
      changed();
    } catch {
      setNote('Couldn’t change the date. Please try again.');
    }
  };

  const onTap = (photo: ProgressPhoto) => {
    if (!picking) {
      setViewing(photo);
      return;
    }
    const next = picked.includes(photo.id) ? picked.filter((id) => id !== photo.id) : [...picked, photo.id];
    if (next.length === 2) {
      setPicking(false);
      setPicked([]);
      router.push({ pathname: '/photos/compare', params: { a: next[0], b: next[1] } });
      return;
    }
    setPicked(next);
  };

  // Screen padding is 20 on each side.
  const tile = Math.floor((width - space.screenX * 2 - GAP * (COLS - 1)) / COLS);

  return (
    <Screen
      title="Progress photos"
      subtitle={backupOn ? 'Private. Your newest are in your phone’s backup too.' : 'Private. They stay on this phone.'}
      onBack={() => goBack(router, '/analytics')}
    >
      <View style={{ gap: space.lg }}>
        {picking ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {picked.length === 0 ? 'Tap the first photo' : 'Now tap the second photo'}
            </Text>
            <Pressable
              onPress={() => {
                setPicking(false);
                setPicked([]);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Add a photo" icon="camera" loading={busy} onPress={() => setAdding(true)} />
            {photos && photos.length >= 2 ? (
              <GhostButton label="Compare two photos" icon="camera" onPress={() => setPicking(true)} />
            ) : null}
          </View>
        )}

        {note ? (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, lineHeight: 17, color: color.criticalText }}>
            {note}
          </Text>
        ) : null}

        {photos === null && failed ? (
          <LoadError what="your photos" onRetry={retry} />
        ) : photos === null ? (
          <Skeleton width="100%" height={tile} radius={radius.md} />
        ) : photos.length === 0 ? (
          <EmptyState
            icon="camera"
            title="No photos yet"
            body="Take one in the same spot and light every few weeks. Then compare any two side by side."
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {photos.map((p) => {
              const order = picked.indexOf(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onTap(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Progress photo, ${dateWithYear(p.dateISO)}${picking ? (order >= 0 ? ', picked' : ', tap to pick') : ''}`}
                  style={{ width: tile, gap: 4 }}
                >
                  <View
                    style={{
                      width: tile,
                      height: Math.round(tile * 1.33),
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      backgroundColor: color.surfaceRaised,
                      borderWidth: order >= 0 ? 2 : 1,
                      borderColor: order >= 0 ? color.accent : color.border,
                    }}
                  >
                    <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" />
                    {order >= 0 ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: color.accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.caption, color: '#1F0D05' }}>{order + 1}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
                    {tinyDate(p.dateISO)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <TrackerSheet visible={adding} title="Add a progress photo" subtitle="Same spot, same light, every few weeks." onClose={() => setAdding(false)}>
        <View style={{ gap: 2 }}>
          <SheetRow label="Take a photo" leading={<Icon name="camera" size={20} color={color.accent} />} onPress={() => void add('camera')} />
          <SheetRow label="Choose from gallery" leading={<Glyph name="image" size={20} color={color.accent} />} onPress={() => void add('gallery')} />
        </View>
      </TrackerSheet>

      {/* The viewer steps aside while its date is being changed (one window at a time). */}
      <Modal visible={viewing != null && dating == null} animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md }}>
              <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                {viewing ? dateWithYear(viewing.dateISO) : ''}
              </Text>
              <IconButton icon="close" onPress={() => setViewing(null)} accessibilityLabel="Close photo" />
            </View>
            {viewing ? <ZoomImage key={viewing.id} uri={viewing.uri} style={{ marginVertical: space.md }} accessibilityLabel={`Progress photo, ${dateWithYear(viewing.dateISO)}`} /> : null}
            {viewing ? (
              <>
                <View style={{ flexDirection: 'row', paddingHorizontal: space.md, gap: space.sm }}>
                  <ViewerAction label="Save to phone gallery" icon={<Glyph name="image" size={20} color={color.ink} />} onPress={() => void onSave(viewing)} />
                  <ViewerAction label="Change date" icon={<Icon name="calendar" size={20} color={color.ink} />} onPress={() => setDating({ photo: viewing, why: 'change' })} />
                  <ViewerAction label="Delete photo" danger icon={<Glyph name="trash" size={20} color={color.criticalText} />} onPress={() => void onDelete(viewing)} />
                </View>
                <Text style={{ marginTop: space.xs, paddingHorizontal: space.lg, textAlign: 'center', fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                  Saving opens your phone’s share list: choose “Save image”, Photos or Files.
                </Text>
              </>
            ) : null}
          </View>
        </GestureHandlerRootView>
      </Modal>

      <DatePickerSheet
        visible={dating != null}
        title={dating?.why === 'undated' ? 'When was this photo taken?' : 'Photo date'}
        subtitle={dating?.why === 'undated' ? 'It came without a date of its own, so it shows today until you pick one.' : undefined}
        value={dating?.photo.dateISO ?? ''}
        onChoose={(iso) => void onChooseDay(iso)}
        onClose={() => setDating(null)}
      />
    </Screen>
  );
}
