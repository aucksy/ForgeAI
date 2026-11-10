/**
 * R-438 (owner, 10 Nov 2026, design 2 "Watch in hand"): "Your watch app has an update". A drawn round
 * watch (strap, case, crown) shows the new version; the words, "New on your watch" and the buttons sit
 * in a sheet at the bottom, styled like the phone's own "A new MettleUp is here" (UpdatePrompt.tsx).
 * When: tracker/services/watchUpdateCard.ts (only 'update-ready'; app open or back after 6 h; the 3
 * main tabs; never in a workout; the phone's own update first; "Later" = 24 h). The watch stays black
 * in both looks, like a real watch screen; everything else follows the light or dark look.
 *
 * "Update on watch" opens the watch's Play Store on MettleUp (watchUpdate.ts updateOnWatch). Then the
 * drawn watch shows that page's Update button and the sheet says "Check your watch". Anything else
 * (no watch now, the watch refused, a timeout) gets the plain fallback: search MettleUp on the watch.
 * It scrolls: on a short phone at large text the buttons are below the fold, never cut off.
 */
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Rect, Stop, LinearGradient as SvgGradient } from 'react-native-svg';

import { PrimaryButton } from '@/components/ui';
import { hasUpdateStandIn } from '@/lib/updatePrompt';
import { tokenScheme } from '@/theme/brandTokens';
import { useAppUpdate } from '@/lib/updateStore';
import { color, darkColor, gradients, radius, space, type } from '@/theme/tokens';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { readWatchUpdate, updateOnWatch, watchUpdateState, watchesNeedingUpdate, type UpdateResult, type WatchNode, type WatchUpdateState } from '@/tracker/services/watchUpdate';
import {
  WATCH_UPDATE_WORDS as W,
  cardShows,
  oldestWatchVersion,
  qaForgetWatchSnooze,
  qaReadWatchStandIn,
  qaReadWatchTap,
  qaWatchLink,
  qaWatchRead,
  qaWriteWatchStandIn,
  qaWriteWatchTap,
  readWatchSnooze,
  shortVersion,
  snoozeWatchCard,
  stepAfter,
  stepWords,
  targetNode,
  watchNews,
  type CardStep,
  type Snooze,
} from '@/tracker/services/watchUpdateCard';

const RECHECK_MS = 6 * 60 * 60 * 1000;
/** Let the phone's own update check speak first (it goes first, watchUpdateCard.ts). */
const FIRST_CHECK_DELAY_MS = 4000;

/** The page colour at `alpha`: the veil over the app behind (both looks). */
function bgTint(alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.bg);
  if (!m) return color.bg;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface Found {
  state: WatchUpdateState;
  stale: WatchNode[];
  at: number;
}

export function WatchUpdatePrompt() {
  const phoneVersion = Constants.expoConfig?.version ?? null;
  const qa = hasUpdateStandIn(Constants.expoConfig?.extra);
  const workout = useActiveWorkout((s) => s.active);
  const phoneKind = useAppUpdate((s) => s.kind);
  const phonePopup = useAppUpdate((s) => s.popup);
  const onTabs = useSegments()[0] === '(tabs)';
  const [found, setFound] = useState<Found | null>(null);
  const [snooze, setSnooze] = useState<Snooze | null | undefined>(undefined);
  const [step, setStep] = useState<CardStep>('offer');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    const s = await readWatchSnooze();
    const fake = qa ? qaWatchRead(await qaReadWatchStandIn(), phoneVersion) : null;
    const r = fake
      ? { state: watchUpdateState(phoneVersion, fake), stale: watchesNeedingUpdate(phoneVersion, fake) }
      : await readWatchUpdate(phoneVersion);
    setSnooze(s);
    setStep('offer');
    setClosed(false);
    setFound({ state: r.state, stale: r.stale, at: Date.now() });
  }, [qa, phoneVersion]);

  useEffect(() => {
    const run = () => void check().catch((e: unknown) => console.warn('[watch update] the check failed', e));
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    lastCheck.current = Date.now();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Date.now() - lastCheck.current > RECHECK_MS) run();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [check]);

  // QA builds only: the made-up watch (watchUpdateCard.ts qaWatchLink), so a cloud phone can show the pop-up.
  useEffect(() => {
    if (!qa) return;
    const onUrl = (url: string | null) => {
      const l = qaWatchLink(url);
      if (!l.watch && !l.tap) return;
      void (async () => {
        if (l.tap) await qaWriteWatchTap(l.tap);
        if (l.watch === 'forget') await qaForgetWatchSnooze();
        else if (l.watch) await qaWriteWatchStandIn(l.watch === 'off' ? '' : l.watch);
        if (l.watch) await check();
      })().catch((e: unknown) => console.warn('[watch update] QA stand-in failed', e));
    };
    Linking.getInitialURL()
      .then(onUrl)
      .catch((e: unknown) => console.warn('[watch update] could not read the opening link', e));
    const sub = Linking.addEventListener('url', (e) => onUrl(e.url));
    return () => sub.remove();
  }, [qa, check]);

  // A workout opened while it was up (a shortcut, the watch): it gives way until the next open.
  useEffect(() => {
    if (workout && found) setClosed(true);
  }, [workout, found]);

  const due =
    found != null &&
    cardShows({
      state: found.state,
      snooze,
      phoneVersion,
      now: found.at,
      workoutOpen: workout,
      phoneUpdateWaits: phoneKind != null || phonePopup,
    });
  // After the tap the member reads the answer even if the phone's own update turned up meanwhile.
  const visible = !closed && onTabs && !workout && found != null && (step !== 'offer' || due);
  if (!found || !phoneVersion) return null;

  const later = () => {
    setClosed(true);
    const now = Date.now();
    setSnooze({ version: phoneVersion, at: now });
    void snoozeWatchCard(phoneVersion, now);
  };
  const update = () => {
    if (busy) return;
    setBusy(true);
    void (async (): Promise<UpdateResult> => {
      const fakeTap = qa ? await qaReadWatchTap() : null;
      if (fakeTap) {
        console.warn('[watch update] QA stand-in answer for "Update on watch":', fakeTap);
        return fakeTap as UpdateResult;
      }
      return updateOnWatch(targetNode(found.stale));
    })()
      .catch((e: unknown): UpdateResult => {
        console.warn('[watch update] "Update on watch" failed', e);
        return 'failed';
      })
      .then((r) => setStep(stepAfter(r)))
      .finally(() => setBusy(false));
  };
  const news = watchNews(phoneVersion, oldestWatchVersion(found.stale));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        {/* UAT 10 Nov: the Modal's own window kept light status-bar icons on the light look's page. */}
        <StatusBar style={tokenScheme() === 'light' ? 'dark' : 'light'} />
        <WatchUpdateScreen version={phoneVersion} news={news} step={step} busy={busy} onUpdate={update} onLater={later} />
      </SafeAreaProvider>
    </Modal>
  );
}

export interface WatchUpdateScreenProps {
  /** The phone's version: the watch's new one. */
  version: string;
  news: string[];
  step: CardStep;
  busy: boolean;
  onUpdate: () => void;
  /** "Later", "Got it" and Android's back. */
  onLater: () => void;
}

/** The pop-up itself (design 2). */
export function WatchUpdateScreen({ version, news, step, busy, onUpdate, onLater }: WatchUpdateScreenProps) {
  const insets = useSafeAreaInsets();
  const v = shortVersion(version);
  const after = step === 'offer' ? null : stepWords(step);
  return (
    <View role="dialog" aria-modal accessibilityViewIsModal style={{ flex: 1, backgroundColor: bgTint(0.9) }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.lg }}
      >
        <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.lg }}>
          <DrawnWatch version={v} store={step === 'opened'} />
          {step === 'opened' ? <Callout /> : null}
        </View>
        <View
          style={{
            backgroundColor: color.surfaceRaised,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: color.borderStrong,
            paddingTop: space.sm + 2,
            paddingHorizontal: space.xl + 2,
            paddingBottom: Math.max(insets.bottom, space.lg) + space.lg,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: color.borderStrong, alignSelf: 'center', marginBottom: space.lg }} />
          {after ? (
            <>
              <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: type.size.h2, lineHeight: 28, color: color.ink }}>
                {after.title}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={{ marginTop: space.md, fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}
              >
                {after.body}
              </Text>
              <View style={{ marginTop: space.lg + 2, gap: space.xs }}>
                <PrimaryButton label={W.gotIt} onPress={onLater} />
                <TextButton label={after.again} onPress={onUpdate} busy={busy} />
              </View>
            </>
          ) : (
            <>
              <Text
                style={{
                  fontFamily: type.bodyBold,
                  fontSize: type.size.caption,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  color: color.accentBright,
                }}
              >
                {W.kicker(v)}
              </Text>
              <Text accessibilityRole="header" style={{ marginTop: space.xs + 2, fontFamily: type.display, fontSize: type.size.h2, lineHeight: 28, color: color.ink }}>
                {W.title}
              </Text>
              {news.length > 0 ? (
                <View style={{ marginTop: space.md + 2, gap: space.sm }}>
                  <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>{W.newHeading}</Text>
                  {news.map((line, i) => (
                    <View
                      key={i}
                      accessible
                      accessibilityLabel={`${i + 1}. ${line}`}
                      style={{
                        flexDirection: 'row',
                        gap: space.md,
                        alignItems: 'center',
                        backgroundColor: color.glass,
                        borderWidth: 1,
                        borderColor: color.border,
                        borderRadius: radius.md,
                        paddingVertical: space.sm + 3,
                        paddingHorizontal: space.md,
                      }}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: type.bodyBold, fontSize: 14, color: color.accentBright }}>{i + 1}</Text>
                      </View>
                      <Text style={{ flex: 1, fontFamily: type.body, fontSize: 14, lineHeight: 19, color: color.ink }}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ marginTop: space.md, fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>
                  {W.noNews}
                </Text>
              )}
              <View style={{ marginTop: space.lg + 2, gap: space.xs }}>
                <PrimaryButton label={W.updateOnWatch} loading={busy} onPress={onUpdate} />
                <TextButton label={W.later} onPress={onLater} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TextButton({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** The orange pill under the watch after the Play Store opened, pointing up at its Update button. */
function Callout() {
  return (
    <View style={{ alignItems: 'center', marginTop: space.sm }} accessible accessibilityLabel={W.tapThis}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: gradients.ember[0] }} />
      <LinearGradient colors={gradients.ember} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 7 }}>
        <Text style={{ fontFamily: type.bodyBold, fontSize: 12, color: color.onEmber }}>{W.tapThis}</Text>
      </LinearGradient>
    </View>
  );
}

// The watch is a picture of a real watch: black screen and steel case in both looks. Its words use the
// DARK look's colours (darkColor, with a gym's own accent), read when drawn, like the real watch app.
const WATCH_W = 210;
const WATCH_H = 330;

/** The drawn watch, tilted like a wrist: the new version, or (after the tap) the Play Store's Update button. */
export function DrawnWatch({ version, store }: { version: string; store: boolean }) {
  const cx = WATCH_W / 2;
  const cy = WATCH_H / 2;
  const arcR = 80;
  const arcLen = 2 * Math.PI * arcR;
  const ink = darkColor.ink;
  const grey = darkColor.inkSecondary;
  const accent = darkColor.accentBright;
  return (
    <View
      accessible
      accessibilityLabel={store ? `${W.faceApp}, ${W.faceUpdate}` : `${W.faceApp} ${version}, ${W.faceReady}`}
      style={{ width: WATCH_W, height: WATCH_H, transform: [{ rotate: '-9deg' }] }}
    >
      <Svg width={WATCH_W} height={WATCH_H} viewBox={`0 0 ${WATCH_W} ${WATCH_H}`}>
        <Defs>
          <SvgGradient id="strap" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#1c1e23" />
            <Stop offset="0.5" stopColor="#34373f" />
            <Stop offset="1" stopColor="#1c1e23" />
          </SvgGradient>
          <SvgGradient id="case" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#e1e4ea" />
            <Stop offset="0.3" stopColor="#6b7079" />
            <Stop offset="0.55" stopColor="#c9cdd4" />
            <Stop offset="0.8" stopColor="#5d626b" />
            <Stop offset="1" stopColor="#b9bdc4" />
          </SvgGradient>
          <SvgGradient id="crown" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7c818a" />
            <Stop offset="0.5" stopColor="#d5d8de" />
            <Stop offset="1" stopColor="#7c818a" />
          </SvgGradient>
          <SvgGradient id="arc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradients.ember[0]} />
            <Stop offset="1" stopColor={gradients.ember[1]} />
          </SvgGradient>
          <SvgGradient id="glint" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.14} />
            <Stop offset="0.4" stopColor="#ffffff" stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Rect x={cx - 59} y={0} width={118} height={120} rx={30} fill="url(#strap)" />
        <Rect x={cx - 59} y={WATCH_H - 120} width={118} height={120} rx={30} fill="url(#strap)" />
        {[0, 22, 44].map((d) => (
          <Circle key={d} cx={cx} cy={WATCH_H - 80 + d} r={5} fill="#0c0d10" />
        ))}
        <Rect x={cx + 92} y={cy - 16} width={13} height={32} rx={4} fill="url(#crown)" />
        <Circle cx={cx} cy={cy} r={98} fill="url(#case)" />
        <Circle cx={cx} cy={cy} r={89} fill="#000000" stroke="#111111" strokeWidth={3} />
        {store ? null : (
          <>
            <Circle cx={cx} cy={cy} r={arcR} fill="none" stroke="#1d1f26" strokeWidth={6} />
            <Circle
              cx={cx}
              cy={cy}
              r={arcR}
              fill="none"
              stroke="url(#arc)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${arcLen * 0.727} ${arcLen}`}
              rotation={-90}
              origin={`${cx}, ${cy}`}
            />
          </>
        )}
        <Circle cx={cx} cy={cy} r={89} fill="url(#glint)" />
      </Svg>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: cx - 70, top: cy - 70, width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}
      >
        {store ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <LinearGradient colors={gradients.ember} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: type.display, fontSize: 17, color: color.onEmber }}>M</Text>
            </LinearGradient>
            <Text style={{ fontFamily: type.bodySemi, fontSize: 12, color: ink }}>{W.faceApp}</Text>
            <View style={{ marginTop: 6, padding: 3, borderRadius: 999, borderWidth: 2, borderColor: accent }}>
              <View style={{ backgroundColor: '#A8C7FA', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 7 }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: 13, color: '#062E6F' }}>{W.faceUpdate}</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: type.bodySemi, fontSize: 11, color: grey }}>{W.faceApp}</Text>
            <Text
              maxFontSizeMultiplier={1.1}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{ fontFamily: type.monoBold, fontSize: 36, lineHeight: 42, color: ink, marginVertical: 2 }}
            >
              {version}
            </Text>
            <Text
              maxFontSizeMultiplier={1.2}
              style={{ fontFamily: type.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: accent }}
            >
              {W.faceReady}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
