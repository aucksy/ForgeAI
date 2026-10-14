/**
 * "Share as a picture" (Phase 3): shows the picture, then hands a PNG to the phone's share
 * menu — WhatsApp, Instagram, Messages, Save to Files, anything installed. The picture is the
 * same scene the preview shows, saved at full size (1080 × 1350).
 *
 * 15 Oct 2026, copied from Hevy (its share screen's Background button: light, dark or transparent,
 * the transparent one placed on an Instagram story as an overlay — see `share/frame.ts` for the
 * sources): two choices above the button, remembered for next time — Size (Post 1080 × 1350 /
 * Story 1080 × 1920) and Background (Dark / See-through, a PNG with no background). A failure is
 * logged with "[ForgeErr] share picture" and told in plain words, never swallowed.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';

import { PrimaryButton } from '@/components/ui';
import { SHARE_FOLDER } from '@/lib/tempPictures';
import { color, radius, space, type } from '@/theme/tokens';
import { tell } from '@/lib/tell';

import { framedFileName, framedScene, SHARE_LOOK_OPTIONS, SHARE_SIZE_OPTIONS } from '../share/frame';
import { SceneSvg } from '../share/SceneSvg';
import { pictureFileName, type Scene } from '../share/scene';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { SegmentedControl } from './SegmentedControl';
import { TrackerSheet } from './TrackerSheet';

/** A see-through picture's preview sits on a photo-like grey so its white words show. */
const CLEAR_PREVIEW_BG = '#5B6170';

export function ShareSheet({
  visible,
  scene,
  fileName,
  title = 'Share as a picture',
  onClose,
}: {
  visible: boolean;
  scene: Scene;
  fileName: string;
  title?: string;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const ref = useRef<Svg>(null);
  const [busy, setBusy] = useState(false);
  const size = useTrackerPrefs((s) => s.shareSize);
  const look = useTrackerPrefs((s) => s.shareLook);
  const setSize = useTrackerPrefs((s) => s.setShareSize);
  const setLook = useTrackerPrefs((s) => s.setShareLook);
  // The card in the chosen size and background — what the preview shows and the PNG saves.
  const picture = useMemo(() => framedScene(scene, size, look), [scene, size, look]);
  // Fit the picture on screen with room for the choices and the button below it.
  const previewW = Math.min(width - space.xl * 2, ((height * 0.45) * picture.width) / picture.height);

  const fail = (e: unknown) => {
    console.warn('[ForgeErr] share picture', e);
    void tell('Could not make the picture', 'Something went wrong. Please try again.');
  };

  const onShare = () => {
    const svg = ref.current;
    if (!svg || busy) return;
    setBusy(true);
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      setBusy(false);
      fail(new Error('the picture took longer than 10 s to draw'));
    }, 10_000);
    try {
    svg.toDataURL(
      (base64: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        void (async () => {
          try {
            // A folder of their own, which "Erase all data" deletes (lib/tempPictures).
            const dir = `${FileSystem.cacheDirectory ?? ''}${SHARE_FOLDER}`;
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch((e: unknown) => {
              // Usually "already there"; the write below fails loudly if it really is missing.
              console.warn('[ForgeErr] share picture: folder', e);
            });
            const uri = `${dir}${pictureFileName(framedFileName(fileName, size, look))}`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
            } else {
              void tell('Sharing is not available', 'This phone has no app to share the picture with.');
            }
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        })();
      },
      { width: picture.width, height: picture.height },
    );
    } catch (e) {
      // toDataURL itself threw (the drawing was not ready): say so instead of spinning.
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      setBusy(false);
      fail(e);
    }
  };

  return (
    <TrackerSheet visible={visible} title={title} subtitle="Send it to WhatsApp, Instagram or any app." onClose={onClose}>
      <View style={{ alignItems: 'center' }}>
        {/* The grey is the preview's frame only — the Svg saves itself, not this View. */}
        <View
          style={{
            borderRadius: radius.md,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: color.border,
            backgroundColor: look === 'clear' ? CLEAR_PREVIEW_BG : undefined,
          }}
        >
          <SceneSvg ref={ref} scene={picture} width={previewW} />
        </View>
      </View>
      <View style={{ gap: space.xs }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Size</Text>
        <SegmentedControl label="Picture size" options={SHARE_SIZE_OPTIONS} value={size} onChange={setSize} large />
      </View>
      <View style={{ gap: space.xs }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Background</Text>
        <SegmentedControl label="Picture background" options={SHARE_LOOK_OPTIONS} value={look} onChange={setLook} large />
      </View>
      <PrimaryButton label="Share picture" icon="send" loading={busy} onPress={onShare} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
        {look === 'clear'
          ? 'See-through: no background, so you can place it on a photo or an Instagram story. No name or gym on it.'
          : 'The picture has no name or gym on it — just the training.'}
      </Text>
    </TrackerSheet>
  );
}
