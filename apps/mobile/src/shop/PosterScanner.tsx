/**
 * R-228: MettleUp's own QR scanner for the gym poster, as a panel (camera + the camera ask). Live camera
 * only (R-152): no photo is taken or saved, and nothing is read from a saved picture.
 *
 * Used by the Gym tab's scanner screen (ScanPosterScreen: opens check-in or join) and by the welcome
 * screen's gym code (WelcomeGymCode: fills and checks the code, 1 Nov 2026). The welcome sits outside the
 * navigator, so this panel never routes: `onRead` decides what a QR does and says whether it was a gym's.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { SCAN_WORDS } from './scanPoster';

/** The words the panel says about the camera; the Gym tab's by default. */
export type ScannerWords = {
  /** Not asked yet, or asked by itself on the first visit. */
  asking: string;
  /** The member said no once (Android can still ask again). */
  refused: string;
  /** Android will not ask again: only the phone's Settings can turn it on. */
  camOff: string;
  /** The camera did not start. */
  noCamera: string;
};
const GYM_TAB_WORDS: ScannerWords = { asking: SCAN_WORDS.asking, refused: SCAN_WORDS.asking, camOff: SCAN_WORDS.camOff, noCamera: SCAN_WORDS.noCamera };

/**
 * `onRead`: told each QR seen until it answers true (a gym's: scanning stops). False = not a gym's QR:
 * the panel says "Wrong QR code" and goes on scanning.
 */
export function PosterScanner({ onRead, words = GYM_TAB_WORDS }: { onRead: (data: string) => boolean; words?: ScannerWords }) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [notOurs, setNotOurs] = useState(false);
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);
  const lastBad = useRef<string | null>(null);
  const asked = useRef(false);

  // Ask once by itself on the first visit; after a "no" the button or Settings is the way.
  useEffect(() => {
    if (!permission || permission.granted || asked.current || !permission.canAskAgain) return;
    asked.current = true;
    requestPermission().catch((e: unknown) => console.warn('[gym] camera permission ask failed', e));
  }, [permission, requestPermission]);

  // Back from phone Settings with the camera now allowed: read it again (the hook does not by itself).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') getPermission().catch((e: unknown) => console.warn('[gym] camera permission read failed', e));
    });
    return () => sub.remove();
  }, [getPermission]);

  // The "wrong QR code" line goes back to the normal line after a few seconds.
  useEffect(() => {
    if (!notOurs) return;
    const t = setTimeout(() => {
      setNotOurs(false);
      lastBad.current = null;
    }, 4000);
    return () => clearTimeout(t);
  }, [notOurs]);

  const onScan = useCallback(
    (r: BarcodeScanningResult) => {
      if (opened.current) return;
      if (onRead(r.data)) {
        opened.current = true;
        return;
      }
      if (lastBad.current !== r.data) {
        lastBad.current = r.data;
        setNotOurs(true);
      }
    },
    [onRead],
  );

  if (!permission) return null;
  if (!permission.granted) {
    const settings = !permission.canAskAgain;
    const line = settings ? words.camOff : permission.status === 'denied' ? words.refused : words.asking;
    return (
      <Card style={{ gap: space.md }}>
        <Text accessibilityLiveRegion="polite" style={said()}>
          {line}
        </Text>
        <PrimaryButton
          label={settings ? SCAN_WORDS.openSettings : SCAN_WORDS.allow}
          onPress={() => {
            if (settings) Linking.openSettings().catch((e: unknown) => console.warn('[gym] app settings did not open', e));
            else requestPermission().catch((e: unknown) => console.warn('[gym] camera permission ask failed', e));
          }}
        />
      </Card>
    );
  }
  if (failed) {
    return (
      <Card>
        <Text accessibilityLiveRegion="polite" style={said()}>
          {words.noCamera}
        </Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
          onMountError={(e) => {
            console.warn('[gym] the scanner camera did not start', e.message);
            setFailed(true);
          }}
        />
        <View pointerEvents="none" style={styles.frame} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[said(), notOurs ? { color: color.warning } : null]}>
        {notOurs ? SCAN_WORDS.notOurs : SCAN_WORDS.aim}
      </Text>
    </View>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const said = () => ({ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 22 });

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
  },
});
