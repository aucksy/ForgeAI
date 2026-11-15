/**
 * R-587: the 2-3 welcome screens before the welcome flow (words and rules: ../introSlides.ts), drawn as the
 * approved canvas (design-welcome Main / Watch / Gym) with the app's own tokens, so the light look and a gym's
 * colours repaint them like every other screen. IntroGate shows them once, then the welcome flow. A failed read of
 * the "seen" mark skips them: nothing ever stands between a member and setting up the app.
 *
 * Screen 1 is drawn at once: nothing waits on Wear OS. The watch answer (readWatchStateQuick, at most
 * INTRO_WATCH_WAIT_MS) may add the watch screen only while screen 1 is still up; after that the list is fixed, so a
 * button never changes under a thumb. No watch, an iPhone, a slow or failed lookup: 2 screens.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { recommendMessage } from '@/shop/recommendGym';
import { color, darkColor, space, type } from '@/theme/tokens';
import { accentTint, inkTint } from '@/theme/tint';
import {
  BEAT_CARD,
  GYM_ART,
  INTRO_DONE,
  INTRO_KEY,
  INTRO_WATCH_WAIT_MS,
  INTRO_WORDS,
  WATCH_ART,
  introShows,
  introSlides,
  introStepLabel,
  watchButton,
  type IntroSlide,
} from '@/onboarding/introSlides';
import { useQaIntroWatch } from '@/onboarding/qaIntro';
import { installNote, installOnWatch, readWatchStateQuick, WATCH_WORDS, type InstallResult, type WatchState } from '@/tracker/services/watchInstall';

/** The pictures are pictures: their text grows at most this much with the phone's font size. */
const ART_CAP = 1.2;

/** The intro screens once, then [children] (the welcome flow). */
export function IntroGate({ children }: { children: ReactElement }) {
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getMeta(INTRO_KEY)
      .then((v) => {
        if (live) setStored(v);
      })
      .catch((e: unknown) => {
        console.warn('[intro] could not read the seen mark', e);
        if (live) setStored(INTRO_DONE);
      });
    return () => {
      live = false;
    };
  }, []);
  if (stored === undefined) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  if (!introShows(stored)) return children;
  const done = () => {
    setStored(INTRO_DONE);
    enqueueWrite(() => setMeta(INTRO_KEY, INTRO_DONE)).catch((e: unknown) => console.warn('[intro] could not save the seen mark', e));
  };
  return <IntroSlides onDone={done} />;
}

export function IntroSlides({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // 'unknown' = 2 screens until Wear OS says a watch is connected (and only while screen 1 is up).
  const [realWatch, setWatch] = useState<WatchState>('unknown');
  // QA builds only: the cloud phone has no watch; a qa-intro link stands in for Wear OS (onboarding/qaIntro.ts).
  const qaWatch = useQaIntroWatch((s) => s.watch);
  const watch = qaWatch ?? realWatch;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void readWatchStateQuick(INTRO_WATCH_WAIT_MS).then((s) => {
      // Moved on already: the list stays as the member saw it.
      if (live && indexRef.current === 0) setWatch(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const slides = introSlides(watch);
  const at = Math.min(index, slides.length - 1);
  const slide = slides[at];

  // Android back walks back through the screens; on the first one it leaves as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (at === 0) return false;
      setIndex(at - 1);
      return true;
    });
    return () => sub.remove();
  }, [at]);

  const install = () => {
    if (busy) return;
    setBusy(true);
    void installOnWatch()
      .then((r) => {
        setResult(r);
        setNote(installNote(r));
      })
      .finally(() => setBusy(false));
  };

  const recommend = () => {
    Share.share({ message: recommendMessage() }).catch((e: unknown) => console.warn('[intro] recommend share did not open', e));
  };

  const next = () => setIndex(at + 1);
  // A small phone: the watch picture is drawn smaller so the words and buttons keep their room.
  const k = height < 720 || width < 340 ? 0.78 : 1;
  const bodyLine = slide.key === 'watch' && (busy || note) ? (busy ? WATCH_WORDS.opening : note) : slide.body;

  return (
    <View testID="intro-screens" style={{ flex: 1, backgroundColor: color.bg }}>
      <Glow width={width} top={slide.key === 'watch' ? -60 : slide.key === 'gym' ? -100 : -120} />
      <View style={{ flex: 1, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: space.xl, paddingRight: 6 }}>
          <Text style={{ fontFamily: type.displaySemi, fontSize: 14, color: color.inkMuted }}>{introStepLabel(at, slides.length)}</Text>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 48, minWidth: 48, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: type.bodyBold, fontSize: 15, color: color.inkSecondary }}>{INTRO_WORDS.skip}</Text>
          </Pressable>
        </View>

        {/* Scrolls on a big display size, so the buttons below are never cut off. */}
        <ScrollView key={slide.key} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg }}>
            {slide.key === 'beat' ? <BeatArt /> : slide.key === 'watch' ? <WatchArt k={k} /> : <GymArt />}
          </View>
          <View style={{ paddingHorizontal: 24, gap: space.md }}>
            <Text style={{ fontFamily: type.display, fontSize: 13, letterSpacing: 0.3, color: color.accent }}>{slide.eyebrow}</Text>
            <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: 32, lineHeight: 36, color: color.ink }}>
              {slide.title}
            </Text>
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: 16, lineHeight: 24, color: color.inkSecondary }}>
              {bodyLine}
            </Text>
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: 28, gap: space.md, alignItems: 'center' }}>
          <Dots slides={slides} at={at} />
          <Buttons slide={slide} watch={watch} result={result} busy={busy} onNext={next} onInstall={install} onStart={onDone} onRecommend={recommend} />
        </View>
      </View>
    </View>
  );
}

/** The buttons of each screen, as the design. */
function Buttons({
  slide,
  watch,
  result,
  busy,
  onNext,
  onInstall,
  onStart,
  onRecommend,
}: {
  slide: IntroSlide;
  watch: WatchState;
  result: InstallResult | null;
  busy: boolean;
  onNext: () => void;
  onInstall: () => void;
  onStart: () => void;
  onRecommend: () => void;
}) {
  if (slide.key === 'beat') return <BigButton label={INTRO_WORDS.next} onPress={onNext} />;
  if (slide.key === 'watch') {
    const onWatch = watchButton(watch, result) === 'on-watch';
    return (
      <>
        {onWatch ? (
          <BigButton label={INTRO_WORDS.onWatch} icon={<TickMark />} done />
        ) : (
          <BigButton label={INTRO_WORDS.install} icon={<DownloadMark />} busy={busy} onPress={onInstall} />
        )}
        <OutlineButton label={INTRO_WORDS.next} onPress={onNext} />
      </>
    );
  }
  return (
    <>
      <BigButton label={INTRO_WORDS.start} onPress={onStart} />
      <OutlineButton label={INTRO_WORDS.recommend} icon={<ShareMark />} onPress={onRecommend} />
    </>
  );
}

/** One dot per screen; the current one long and orange (the label at the top says the same in words). */
function Dots({ slides, at }: { slides: IntroSlide[]; at: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {slides.map((s, i) => (
        <View key={s.key} style={{ width: i === at ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === at ? color.accent : color.borderStrong }} />
      ))}
    </View>
  );
}

/** The orange button. `done`: "On your watch", read but not tapped (nothing to install). */
function BigButton({ label, icon, onPress, busy, done }: { label: string; icon?: ReactNode; onPress?: () => void; busy?: boolean; done?: boolean }) {
  return (
    <Pressable
      onPress={done || busy ? undefined : onPress}
      disabled={done || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(done || busy), busy: Boolean(busy) }}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: 56,
        borderRadius: 16,
        backgroundColor: done ? color.accentSoft : color.accent,
        borderWidth: done ? 1 : 0,
        borderColor: accentTint(0.45),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        opacity: busy ? 0.7 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text style={{ fontFamily: type.display, fontSize: 17, color: done ? color.accent : color.onAccent, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, icon, onPress }: { label: string; icon?: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: color.borderStrong,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ fontFamily: type.bodyBold, fontSize: 15, color: color.ink, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ screen 1: the example card

function BeatArt() {
  const cell = { fontFamily: type.bodySemi, fontSize: 15, color: color.inkSecondary } as const;
  const strong = { fontFamily: type.bodyBold, fontSize: 15, color: color.ink } as const;
  const head = { fontFamily: type.bodyBold, fontSize: 12, letterSpacing: 0.4, color: color.inkMuted } as const;
  const bars = [inkTint(0.06), inkTint(0.09), inkTint(0.13), accentTint(0.35), accentTint(0.65), color.accent];
  return (
    <View
      style={{ paddingHorizontal: space.xl }}
      accessible
      accessibilityLabel={`${BEAT_CARD.example}: ${BEAT_CARD.exercise}. ${BEAT_CARD.totalLabel} ${BEAT_CARD.totalBefore}, ${BEAT_CARD.targetHead.toLowerCase()} ${BEAT_CARD.totalTarget}.`}
      pointerEvents="none"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ borderRadius: 22, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, paddingTop: 18, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 17, color: color.ink }}>
            {BEAT_CARD.exercise}
          </Text>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodySemi, fontSize: 12, color: color.inkMuted }}>
            {BEAT_CARD.example}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Text maxFontSizeMultiplier={ART_CAP} style={[head, { width: 34 }]}>
            {BEAT_CARD.setHead}
          </Text>
          <Text maxFontSizeMultiplier={ART_CAP} style={[head, { flex: 1 }]}>
            {BEAT_CARD.previousHead}
          </Text>
          <Text maxFontSizeMultiplier={ART_CAP} style={[head, { flex: 1, color: color.accent }]}>
            {BEAT_CARD.targetHead}
          </Text>
        </View>
        {BEAT_CARD.rows.map((r) => (
          <View key={r.set} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 12, backgroundColor: color.surfaceRaised, paddingLeft: 10 }}>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ width: 34, fontFamily: type.bodyBold, fontSize: 15, color: color.inkSecondary }}>
              {r.set}
            </Text>
            <Text maxFontSizeMultiplier={ART_CAP} style={[cell, { flex: 1 }]}>
              {r.previous}
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text maxFontSizeMultiplier={ART_CAP} style={strong}>
                {r.target}
              </Text>
              {r.plus ? (
                <View style={{ borderRadius: 8, backgroundColor: color.accent, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 11, color: color.onAccent }}>
                    {r.plus}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.md, flexWrap: 'wrap', gap: space.xs }}>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodySemi, fontSize: 13, color: color.inkMuted }}>
            {BEAT_CARD.totalLabel}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 14, color: color.inkMuted }}>
              {BEAT_CARD.totalBefore}
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke={color.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 16, color: color.accent }}>
              {BEAT_CARD.totalTarget}
            </Text>
          </View>
        </View>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 82, paddingTop: 18, paddingHorizontal: space.sm }}>
        {[22, 28, 33, 40, 47, 56].map((h, i) => (
          <View key={h} style={{ flex: 1, height: h, borderRadius: 6, backgroundColor: bars[i] }} />
        ))}
      </View>
      <Text maxFontSizeMultiplier={ART_CAP} style={{ textAlign: 'center', fontFamily: type.bodySemi, fontSize: 12, color: color.inkMuted, paddingTop: space.sm }}>
        {BEAT_CARD.caption}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ screen 2: the watch

/** A watch is hardware: its body and black face stay dark in both looks; the ring is the app's accent. */
const WATCH_BAND = '#1A1E28';
const WATCH_CASE = '#2A303D';
const WATCH_CROWN = '#3A4152';
const WATCH_FACE = '#000000';
const WATCH_TRACK = '#1F232D';

function WatchArt({ k }: { k: number }) {
  const caseD = 236 * k;
  const faceD = 212 * k;
  const r = 96 * k;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ alignItems: 'center', gap: 18 * k }}>
      <View
        accessible
        accessibilityLabel={`${WATCH_ART.rest} ${WATCH_ART.time}. ${WATCH_ART.next}.`}
        style={{ width: 250 * k, height: 300 * k, alignItems: 'center', justifyContent: 'center' }}
        pointerEvents="none"
      >
        <View style={{ position: 'absolute', top: 0, left: 75 * k, width: 100 * k, height: 300 * k, borderRadius: 26 * k, backgroundColor: WATCH_BAND, borderWidth: 1, borderColor: inkTint(0.08) }} />
        <View style={{ width: caseD, height: caseD, borderRadius: caseD / 2, backgroundColor: WATCH_CASE, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', right: -9 * k, top: 100 * k, width: 12 * k, height: 36 * k, borderRadius: 6 * k, backgroundColor: WATCH_CROWN }} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: faceD, height: faceD, borderRadius: faceD / 2, backgroundColor: WATCH_FACE, alignItems: 'center', justifyContent: 'center' }}
          >
            <Svg width={faceD} height={faceD} viewBox={`0 0 ${faceD} ${faceD}`} style={{ position: 'absolute', top: 0, left: 0 }}>
              <Circle cx={faceD / 2} cy={faceD / 2} r={r} fill="none" stroke={WATCH_TRACK} strokeWidth={8 * k} />
              <Circle
                cx={faceD / 2}
                cy={faceD / 2}
                r={r}
                fill="none"
                stroke={color.accent}
                strokeWidth={8 * k}
                strokeLinecap="round"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={circ * 0.315}
                transform={`rotate(-90 ${faceD / 2} ${faceD / 2})`}
              />
            </Svg>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 12 * k, letterSpacing: 0.5, color: darkColor.inkMuted }}>
              {WATCH_ART.rest}
            </Text>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 48 * k, lineHeight: 52 * k, color: darkColor.ink }}>
              {WATCH_ART.time}
            </Text>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 13 * k, color: darkColor.inkSecondary, paddingTop: 6 * k }}>
              {WATCH_ART.next}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 * k }}>
              <Svg width={14 * k} height={14 * k} viewBox="0 0 24 24">
                <Path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill={darkColor.criticalText} />
              </Svg>
              <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 13 * k, color: darkColor.criticalText }}>
                {WATCH_ART.heart}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl }}>
        {WATCH_ART.chips.map((c) => (
          <View key={c} style={{ minHeight: 34, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 17, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.surface, justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 13, color: color.inkSecondary }}>
              {c}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ screen 3: the gym

function GymArt() {
  const tile = { flex: 1, borderRadius: 12, backgroundColor: accentTint(0.1), paddingVertical: 10, paddingHorizontal: space.sm, alignItems: 'center', gap: 6 } as const;
  const tileText = { fontFamily: type.bodyBold, fontSize: 12, color: color.ink, textAlign: 'center' } as const;
  return (
    <View
      style={{ paddingHorizontal: space.xl, gap: 14 }}
      accessible
      accessibilityLabel={`${GYM_ART.example}: ${GYM_ART.phoneLabel}, ${GYM_ART.checked}. ${GYM_ART.found}: ${GYM_ART.gym}.`}
      pointerEvents="none"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ borderRadius: 18, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, paddingVertical: 14, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Rect x={7} y={2} width={10} height={20} rx={2.5} stroke={color.inkSecondary} strokeWidth={2} />
            <Path d="M11 18h2" stroke={color.inkSecondary} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </View>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 12, color: color.inkMuted }}>
            {GYM_ART.phoneLabel}
          </Text>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 17, letterSpacing: 1, color: color.ink }}>
            {GYM_ART.phone}
          </Text>
        </View>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M5 12l5 5L20 7" stroke={color.goodText} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 12, color: color.goodText }}>
            {GYM_ART.checked}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={24} height={28} viewBox="0 0 24 28" fill="none">
          <Path d="M12 2v22M5 17l7 7 7-7" stroke={color.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ borderRadius: 22, borderWidth: 1, borderColor: accentTint(0.45), backgroundColor: accentTint(0.07), paddingVertical: 18, paddingHorizontal: space.lg, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 20, color: color.onAccent }}>
              {GYM_ART.initials}
            </Text>
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodyBold, fontSize: 12, color: color.accent }}>
              {GYM_ART.found}
            </Text>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.display, fontSize: 18, color: color.ink }}>
              {GYM_ART.gym}
            </Text>
            <Text maxFontSizeMultiplier={ART_CAP} style={{ fontFamily: type.bodySemi, fontSize: 13, color: color.inkSecondary }}>
              {GYM_ART.plan}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={tile}>
            <QrTileMark />
            <Text maxFontSizeMultiplier={ART_CAP} style={tileText}>
              {GYM_ART.tiles[0]}
            </Text>
          </View>
          <View style={tile}>
            <CalendarMark />
            <Text maxFontSizeMultiplier={ART_CAP} style={tileText}>
              {GYM_ART.tiles[1]}
            </Text>
          </View>
          <View style={tile}>
            <DumbbellMark />
            <Text maxFontSizeMultiplier={ART_CAP} style={tileText}>
              {GYM_ART.tiles[2]}
            </Text>
          </View>
        </View>
      </View>
      <Text maxFontSizeMultiplier={ART_CAP} style={{ textAlign: 'center', fontFamily: type.bodySemi, fontSize: 12, color: color.inkMuted }}>
        {GYM_ART.example}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ small drawings (the design's own marks)

/** The soft orange glow at the top of each screen. */
function Glow({ width, top }: { width: number; top: number }) {
  const d = 520;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left: width / 2 - d / 2, width: d, height: d }}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id="introGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color.accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={d} height={d} fill="url(#introGlow)" />
      </Svg>
    </View>
  );
}

function DownloadMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v12M7 10l5 5 5-5M5 21h14" stroke={color.onAccent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TickMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color.accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShareMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={18} cy={5} r={3} stroke={color.ink} strokeWidth={2} />
      <Circle cx={6} cy={12} r={3} stroke={color.ink} strokeWidth={2} />
      <Circle cx={18} cy={19} r={3} stroke={color.ink} strokeWidth={2} />
      <Path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke={color.ink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function QrTileMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={7} height={7} rx={1} stroke={color.accent} strokeWidth={2} />
      <Rect x={14} y={3} width={7} height={7} rx={1} stroke={color.accent} strokeWidth={2} />
      <Rect x={3} y={14} width={7} height={7} rx={1} stroke={color.accent} strokeWidth={2} />
      <Path d="M14 14h3v3M21 21h-4M21 14v3" stroke={color.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CalendarMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={16} rx={2} stroke={color.accent} strokeWidth={2} />
      <Path d="M3 10h18M8 3v4M16 3v4" stroke={color.accent} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function DumbbellMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12" stroke={color.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
