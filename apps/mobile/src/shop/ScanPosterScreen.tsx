/**
 * R-228: MettleUp's own QR scanner for the gym poster (and an invite QR). Live camera only (R-152):
 * no photo is taken or saved, and nothing is read from a saved picture. The first gym QR it sees opens the
 * check-in (or join) screen in its place; any other QR says so and scanning goes on.
 * The words and the routing are in scanPoster.ts (tested); this file only lays them out.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, Screen } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { posterRoute, SCAN_WORDS } from './scanPoster';
import { leave } from './ShopParts';

export function ScanPosterScreen() {
  const router = useRouter();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [notOurs, setNotOurs] = useState(false);
  const [failed, setFailed] = useState(false);
  const opened = useRef(false);
  const lastBad = useRef<string | null>(null);
  const asked = useRef(false);

  const close = useCallback(() => leave(router, '/shop'), [router]);

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
      const to = posterRoute(r.data);
      if (to) {
        opened.current = true;
        router.replace(to);
        return;
      }
      if (lastBad.current !== r.data) {
        lastBad.current = r.data;
        setNotOurs(true);
      }
    },
    [router],
  );

  let body;
  if (!permission) {
    body = null;
  } else if (!permission.granted) {
    const settings = !permission.canAskAgain;
    body = (
      <Card style={{ gap: space.md }}>
        <Text style={words()}>{settings ? SCAN_WORDS.camOff : SCAN_WORDS.asking}</Text>
        <PrimaryButton
          label={settings ? SCAN_WORDS.openSettings : SCAN_WORDS.allow}
          onPress={() => {
            if (settings) Linking.openSettings().catch((e: unknown) => console.warn('[gym] app settings did not open', e));
            else requestPermission().catch((e: unknown) => console.warn('[gym] camera permission ask failed', e));
          }}
        />
      </Card>
    );
  } else if (failed) {
    body = (
      <Card>
        <Text style={words()}>{SCAN_WORDS.noCamera}</Text>
      </Card>
    );
  } else {
    body = (
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
        <Text accessibilityLiveRegion="polite" style={[words(), notOurs ? { color: color.warning } : null]}>
          {notOurs ? SCAN_WORDS.notOurs : SCAN_WORDS.aim}
        </Text>
      </View>
    );
  }

  return (
    <Screen title={SCAN_WORDS.title} onBack={close}>
      {body}
    </Screen>
  );
}

const words = () => ({ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 22 });

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
