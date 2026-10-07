/**
 * Progress photos (Phase 3) — free and private. Add from the camera or the gallery (the
 * picture is copied into the app, so it survives being deleted from the gallery); tap one to
 * see it big or delete it; "Compare two photos" puts any two side by side.
 */
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, GhostButton, Icon, IconButton, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { shortDate, tinyDate } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import {
  addPhotoFromCamera,
  addPhotoFromGallery,
  deleteProgressPhoto,
  getProgressPhotos,
  type ProgressPhoto,
} from '@/tracker/services/progressPhotos';

const COLS = 3;
const GAP = 8;

export default function ProgressPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(() => {
    let alive = true;
    getProgressPhotos()
      .then((p) => {
        if (alive) setPhotos(p);
      })
      .catch(() => {
        if (alive) setPhotos([]);
      });
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(load);

  const add = async (from: 'camera' | 'gallery'): Promise<void> => {
    setAdding(false);
    if (busy) return;
    setBusy(true);
    try {
      const photo = from === 'camera' ? await addPhotoFromCamera() : await addPhotoFromGallery();
      if (photo) load();
    } catch (e) {
      const denied = e instanceof Error && e.message === 'camera-denied';
      Alert.alert(
        denied ? 'Camera not allowed' : 'Could not add the photo',
        denied ? 'Allow the camera for ForgeAI in your phone settings, or choose a photo from the gallery.' : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (photo: ProgressPhoto) => {
    Alert.alert('Delete this photo?', `From ${shortDate(photo.dateISO)}. It is removed from the app for good.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setViewing(null);
          void deleteProgressPhoto(photo)
            .then(load)
            .catch(() => Alert.alert('Could not delete', 'Something went wrong. Please try again.'));
        },
      },
    ]);
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
      subtitle="Private. They stay on this phone."
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
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
              <GhostButton label="Compare two photos" icon="target" onPress={() => setPicking(true)} />
            ) : null}
          </View>
        )}

        {photos === null ? (
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
                  accessibilityLabel={`Progress photo, ${shortDate(p.dateISO)}${picking ? (order >= 0 ? ', picked' : ', tap to pick') : ''}`}
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
                    <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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

      <Modal visible={viewing != null} animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md }}>
            <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
              {viewing ? shortDate(viewing.dateISO) : ''}
            </Text>
            <IconButton icon="close" onPress={() => setViewing(null)} accessibilityLabel="Close photo" />
          </View>
          {viewing ? <Image source={{ uri: viewing.uri }} style={{ flex: 1, marginVertical: space.lg }} contentFit="contain" /> : null}
          {viewing ? (
            <Pressable
              onPress={() => onDelete(viewing)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md }}
            >
              <Glyph name="trash" size={18} color={color.criticalText} />
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.criticalText }}>Delete photo</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
