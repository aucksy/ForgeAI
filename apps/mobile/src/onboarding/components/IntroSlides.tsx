/**
 * R-248: the 2-3 short screens before the welcome flow (words and rules: ../introSlides.ts).
 * IntroGate shows them once, then the welcome flow. A failed read of the "seen" mark skips them:
 * nothing ever stands between a member and setting up the app.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import { INTRO_DONE, INTRO_KEY, INTRO_WATCH_WAIT_MS, INTRO_WORDS, introShows, introSlides, introStepLabel } from '@/onboarding/introSlides';
import { WATCH_WORDS, installNote, installOnWatch, readWatchStateQuick, type WatchState } from '@/tracker/services/watchInstall';

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
  // undefined = still asking (at most INTRO_WATCH_WAIT_MS); then fixed, so a button never changes under a thumb.
  const [watch, setWatch] = useState<WatchState | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void readWatchStateQuick(INTRO_WATCH_WAIT_MS).then((s) => {
      if (live) setWatch(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const slides = introSlides(watch ?? 'unknown');
  const at = Math.min(index, slides.length - 1);
  const slide = slides[at];
  const last = at === slides.length - 1;

  // Android back walks back through the screens; on the first one it leaves as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (at === 0) return false;
      setIndex(at - 1);
      return true;
    });
    return () => sub.remove();
  }, [at]);

  if (watch === undefined) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  const install = () => {
    if (busy) return;
    setBusy(true);
    void installOnWatch()
      .then((r) => setNote(installNote(r)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>
          {introStepLabel(at, slides.length)}
        </Text>
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{INTRO_WORDS.skip}</Text>
        </Pressable>
      </View>

      {/* Scrolls on a big display size, so the buttons below are never cut off. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.md }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.pill,
            backgroundColor: color.surfaceRaised,
            borderWidth: 1,
            borderColor: color.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={slide.icon} size={32} color={color.accent} />
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: type.display, fontSize: type.size.h1, lineHeight: 34, color: color.ink }}>
          {slide.title}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}
        >
          {slide.key === 'watch' && (busy || note) ? (busy ? WATCH_WORDS.opening : note) : slide.body}
        </Text>
        {slide.key === 'watch' && note == null ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <GhostButton label={WATCH_WORDS.install} icon="heart" onPress={install} />
          </View>
        ) : null}
      </ScrollView>

      {/* One bar per screen: done and current lit (the label at the top says the same in words). */}
      <View style={{ flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg, marginBottom: space.md }}>
        {slides.map((s, i) => (
          <View key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? color.accent : color.border }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg }}>
        {at > 0 ? (
          <View style={{ flex: 1 }}>
            <GhostButton label={INTRO_WORDS.previous} onPress={() => setIndex(at - 1)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <PrimaryButton label={last ? INTRO_WORDS.start : INTRO_WORDS.next} onPress={() => (last ? onDone() : setIndex(at + 1))} />
        </View>
      </View>
    </View>
  );
}
