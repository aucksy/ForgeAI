/**
 * "Share as a picture" (Phase 3): shows the picture, then hands a PNG to the phone's share
 * menu — WhatsApp, Instagram, Messages, Save to Files, anything installed. The picture is the
 * same scene the preview shows, saved at full size (1080 × 1350).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Alert, Text, useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';

import { PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { SceneSvg } from '../share/SceneSvg';
import { pictureFileName, type Scene } from '../share/scene';
import { TrackerSheet } from './TrackerSheet';

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
  // Fit the picture on screen with room for the button below it.
  const previewW = Math.min(width - space.xl * 2, ((height * 0.55) * scene.width) / scene.height);

  const fail = () => Alert.alert('Could not make the picture', 'Something went wrong. Please try again.');

  const onShare = () => {
    const svg = ref.current;
    if (!svg || busy) return;
    setBusy(true);
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      setBusy(false);
      fail();
    }, 10_000);
    svg.toDataURL(
      (base64: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        void (async () => {
          try {
            const uri = `${FileSystem.cacheDirectory ?? ''}${pictureFileName(fileName)}`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
            } else {
              Alert.alert('Sharing is not available', 'This phone has no app to share the picture with.');
            }
          } catch {
            fail();
          } finally {
            setBusy(false);
          }
        })();
      },
      { width: scene.width, height: scene.height },
    );
  };

  return (
    <TrackerSheet visible={visible} title={title} subtitle="Send it to WhatsApp, Instagram or any app." onClose={onClose}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: color.border }}>
          <SceneSvg ref={ref} scene={scene} width={previewW} />
        </View>
      </View>
      <PrimaryButton label="Share picture" icon="send" loading={busy} onPress={onShare} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
        The picture has no name or gym on it — just the training.
      </Text>
    </TrackerSheet>
  );
}
