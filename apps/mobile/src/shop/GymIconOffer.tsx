/**
 * R-77 (owner, 22 Oct 2026): right after the member joins a gym — once the gym's welcome opening has
 * gone — a pop-up offers the gym's logo for the home screen (Android asks before adding it), then
 * shows how to take the ForgeAI icon off the home screen (Android never lets an app remove its own
 * icon: gymIconWords.ts). Offered once per gym ("Not now" too); Settings → Your gym keeps "Add to
 * your home screen". Lives beside the opening in the root layout, outside the re-drawn screens, so
 * the join's re-draw never loses it.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { useGymTheme } from '@/theme/gymTheme';
import { color, space, type } from '@/theme/tokens';

import { addGymShortcut, canAddGymShortcut, gymShortcutWords, markShortcutOffered, shortcutOffered } from './gymShortcut';
import { GYM_ICON_WORDS as W } from './gymIconWords';
import { useGymShop } from './gymStore';
import type { GymLink } from './types';

/** After the opening goes, wait this long (the screens settle) before the pop-up comes up. */
const AFTER_OPENING_MS = 500;

type Step = 'add' | 'remove';

export function GymIconOfferHost() {
  const [pending, setPending] = useState<GymLink | null>(null);
  const [shown, setShown] = useState<GymLink | null>(null);
  const [step, setStep] = useState<Step>('add');
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(null);
  const opening = useGymTheme((s) => s.opening);
  const subscribed = useRef(false);

  // A NEW gym on this phone (the member's own join or switch; reading the saved link at start is not one).
  useEffect(() => {
    if (subscribed.current) return undefined;
    subscribed.current = true;
    let unsub: (() => void) | null = null;
    const watch = () => {
      unsub = useGymShop.subscribe((s, prev) => {
        if (s.link && s.link.joinCode !== prev.link?.joinCode) setPending(s.link);
        if (!s.link) {
          setPending(null);
          setShown(null);
        }
      });
    };
    if (useGymShop.persist.hasHydrated()) watch();
    else {
      const done = useGymShop.persist.onFinishHydration(() => {
        done();
        watch();
      });
    }
    return () => unsub?.();
  }, []);

  // Once the welcome opening has gone: offer it, if this phone can pin it and it was never offered.
  useEffect(() => {
    if (!pending || opening) return undefined;
    let live = true;
    const t = setTimeout(() => {
      // The opening came up meanwhile: wait for it to go (this runs again then).
      if (useGymTheme.getState().opening) return;
      if (!canAddGymShortcut(pending)) {
        setPending(null);
        return;
      }
      void shortcutOffered(pending.joinCode).then((done) => {
        if (!live) return;
        if (!done && useGymShop.getState().link?.joinCode === pending.joinCode) {
          setStep('add');
          setWords(null);
          setShown(pending);
        }
        setPending(null);
      });
    }, AFTER_OPENING_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pending, opening]);

  if (!shown) return null;
  const close = (): void => {
    void markShortcutOffered(shown.joinCode);
    setShown(null);
  };
  const add = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const r = await addGymShortcut(shown);
    setBusy(false);
    if (r === 'asked' || r === 'updated') {
      void markShortcutOffered(shown.joinCode);
      setWords(null);
      setStep('remove');
      return;
    }
    setWords(gymShortcutWords(r, shown.gymName));
  };

  const body = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 } as const;
  return (
    <Sheet
      visible
      title={step === 'add' ? W.addTitle(shown.gymName) : W.removeTitle}
      onClose={close}
      closeLabel={step === 'add' ? W.notNow : W.done}
      footer={
        step === 'add' ? (
          <View style={{ gap: space.sm }}>
            <PrimaryButton label={W.add} loading={busy} onPress={() => void add()} />
            <GhostButton label={W.notNow} onPress={close} />
          </View>
        ) : (
          <PrimaryButton label={W.done} onPress={close} />
        )
      }
    >
      {step === 'add' ? (
        <View style={{ gap: space.md }}>
          <Text style={body}>{W.addBody(shown.gymName)}</Text>
          <InlineError message={words} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {W.removeSteps.map((line, i) => (
            <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
              <Text style={{ ...body, fontFamily: type.bodySemi, color: color.accent, minWidth: 18 }}>{`${i + 1}.`}</Text>
              <Text style={{ ...body, flex: 1, color: color.ink }}>{line}</Text>
            </View>
          ))}
          <Text style={{ ...body, marginTop: space.xs }}>{W.removeNote}</Text>
        </View>
      )}
    </Sheet>
  );
}
