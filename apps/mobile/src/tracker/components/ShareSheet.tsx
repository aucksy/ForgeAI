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
 *
 * F146 (4 Nov 2026): a member in a gym gets the gym's logo and name at the top (share/gymBrand.ts)
 * and a third choice, "Your gym": Show (default) / Hide, remembered. The logo comes from the gym
 * look the app already shows (theme/gymTheme.ts `look`, the header mark's); its size is read first
 * so its box keeps its shape, and a logo that cannot load leaves the name alone. `header` lets the
 * before/after sheet put its photo choice above the picture. Before saving, every picture in it
 * (logo, photos) is checked to be in the phone's image memory (share/pictureReady.ts), so the saved
 * PNG never has an empty hole where the logo or a photo should be.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image as RNImage, Text, useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';

import { PrimaryButton, Skeleton } from '@/components/ui';
import { pictureUrl } from '@/cloud/picture';
import { useGymShop } from '@/shop/gymStore';
import { useGymTheme } from '@/theme/gymTheme';
import { SHARE_FOLDER } from '@/lib/tempPictures';
import { color, radius, space, type } from '@/theme/tokens';
import { tell } from '@/lib/tell';

import { framedFileName, framedScene, SHARE_LOOK_OPTIONS, SHARE_SIZE_OPTIONS } from '../share/frame';
import { cleanGymName, SHARE_GYM_OPTIONS, shareSheetNote, withGym, type ShareGym } from '../share/gymBrand';
import { waitForPictures } from '../share/pictureReady';
import { SceneSvg } from '../share/SceneSvg';
import { pictureFileName, sceneImages, type Scene } from '../share/scene';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { SegmentedControl } from './SegmentedControl';
import { TrackerSheet } from './TrackerSheet';

/** A see-through picture's preview sits on a photo-like grey so its white words show. */
const CLEAR_PREVIEW_BG = '#5B6170';

/** React Native's own image memory (Fresco on Android: the one react-native-svg draws from). */
const pictureMemory = {
  query: async (hrefs: string[]): Promise<Record<string, string>> => {
    const q = (RNImage as unknown as { queryCache?: (u: string[]) => Promise<Record<string, string>> }).queryCache;
    return q ? q(hrefs) : {};
  },
  load: (href: string) => RNImage.getSize(href),
  wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

/**
 * The member's gym for the picture: its name, and its logo once the logo's size is known (null
 * while loading or when it fails, so the name shows alone). Null when not in a gym.
 */
function useShareGym(active: boolean): ShareGym | null {
  const look = useGymTheme((s) => s.look);
  const linkName = useGymShop((s) => s.link?.gymName ?? null);
  const name = cleanGymName(look?.gymName ?? linkName);
  const logoUrl = look?.brand?.logoUrl ?? null;
  const href = logoUrl ? pictureUrl(logoUrl) : null;
  const [size, setSize] = useState<{ href: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!active || !href || size?.href === href) return;
    let alive = true;
    // Also puts the logo in the image memory the saved picture draws from.
    RNImage.getSize(
      href,
      (width, height) => {
        if (alive) setSize({ href, width, height });
      },
      (e) => console.warn('[ForgeErr] share picture: gym logo', e),
    );
    return () => {
      alive = false;
    };
  }, [active, href, size?.href]);
  return useMemo(() => (name ? { name, logo: href && size?.href === href ? size : null } : null), [name, href, size]);
}

export function ShareSheet({
  visible,
  scene,
  fileName,
  title = 'Share as a picture',
  subtitle = 'Send it to WhatsApp, Instagram or any app.',
  header,
  photos = false,
  preparing = false,
  onClose,
}: {
  visible: boolean;
  scene: Scene;
  fileName: string;
  title?: string;
  subtitle?: string;
  /** F146: shown above the picture (the before/after sheet's photo choice). */
  header?: ReactNode;
  /** F146: the picture holds the member's own photos (the note says they stay on the phone). */
  photos?: boolean;
  /** F146: the picture's photos are still being made ready: a placeholder, and no Share yet. */
  preparing?: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const ref = useRef<Svg>(null);
  const [busy, setBusy] = useState(false);
  const size = useTrackerPrefs((s) => s.shareSize);
  const look = useTrackerPrefs((s) => s.shareLook);
  const setSize = useTrackerPrefs((s) => s.setShareSize);
  const setLook = useTrackerPrefs((s) => s.setShareLook);
  const showGym = useTrackerPrefs((s) => s.shareGym);
  const setShowGym = useTrackerPrefs((s) => s.setShareGym);
  const gym = useShareGym(visible);
  // A logo that would not load into memory: the name stands alone from then on.
  const [logoGone, setLogoGone] = useState<string | null>(null);
  const shownGym = useMemo<ShareGym | null>(() => {
    if (!gym || !showGym) return null;
    return gym.logo && gym.logo.href === logoGone ? { ...gym, logo: null } : gym;
  }, [gym, showGym, logoGone]);
  // The card with the gym, in the chosen size and background — what the preview shows and the PNG saves.
  const picture = useMemo(() => framedScene(withGym(scene, shownGym), size, look), [scene, shownGym, size, look]);
  // Fit the picture on screen with room for the choices and the button below it.
  const previewW = Math.min(width - space.xl * 2, ((height * 0.45) * picture.width) / picture.height);

  const fail = (e: unknown) => {
    console.warn('[ForgeErr] share picture', e);
    void tell('Could not make the picture', 'Something went wrong. Please try again.');
  };

  const onShare = async (): Promise<void> => {
    if (!ref.current || busy || preparing) return;
    setBusy(true);
    // F146: the logo and photos must be in the image memory, or the saved picture leaves them out.
    const missing = await waitForPictures(sceneImages(picture), pictureMemory);
    if (missing.length > 0) {
      setBusy(false);
      const logo = shownGym?.logo?.href;
      if (logo && missing.every((h) => h === logo)) {
        console.warn('[ForgeErr] share picture: gym logo not loaded', logo);
        setLogoGone(logo);
        void tell('Your gym’s logo did not load', 'The picture now shows your gym’s name only. Tap Share picture again.');
      } else {
        fail(new Error(`pictures not loaded: ${missing.length}`));
      }
      return;
    }
    const svg = ref.current;
    if (!svg) {
      setBusy(false);
      return;
    }
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
    <TrackerSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      {header}
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
          {preparing ? (
            <Skeleton width={previewW} height={(previewW * picture.height) / picture.width} radius={0} />
          ) : (
            <SceneSvg ref={ref} scene={picture} width={previewW} />
          )}
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
      {gym ? (
        <View style={{ gap: space.xs }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Your gym</Text>
          <SegmentedControl
            label="Your gym on the picture"
            options={SHARE_GYM_OPTIONS}
            value={showGym ? 'show' : 'hide'}
            onChange={(v) => setShowGym(v === 'show')}
            large
          />
        </View>
      ) : null}
      <PrimaryButton label="Share picture" icon="send" loading={busy} disabled={preparing} onPress={() => void onShare()} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
        {shareSheetNote({ clear: look === 'clear', gymShown: shownGym != null, photos })}
      </Text>
    </TrackerSheet>
  );
}
