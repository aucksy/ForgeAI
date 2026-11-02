/**
 * The welcome's "Join my gym" screen body (R-277 design, 2 Nov 2026; first built as the start view's
 * gym card, OWNER-INBOX #11, decided 18 Oct 2026): a big "Scan the poster at your gym" box, "or type
 * the gym code", the code box, and "Join <gym>" at the bottom.
 *
 * Nothing is joined here and no new server call is made. The code is kept like a gym's invite link
 * (shop/pendingInvite.ts); a typed or scanned code is checked at once with the gym's preview
 * (apiPreview, WELCOME_GYM_CHECK_MS) so a wrong code is told here; offline or slow, it is simply kept.
 * "Join <gym>" keeps the code and goes on to the 3 setup questions; the gym's own "Join <gym>" screen
 * then opens after setup (app/_layout.tsx) and asks before joining.
 *
 * "Scan the poster" uses the same PosterScanner panel as the Gym tab (no new native module). A scanned
 * poster fills the box and is checked exactly like a typed code (welcomeGymChecked). If the camera is
 * refused, the panel says so in one sentence and the code box stays right under it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton, Icon } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { JOIN_CODE_LENGTH } from '@/shop/gym';
import { apiPreview } from '@/shop/gymApi';
import { PosterScanner } from '@/shop/PosterScanner';
import { peekPendingInvite, restorePendingLinks, setPendingInvite } from '@/shop/pendingInvite';
import { color, radius, space, type } from '@/theme/tokens';

import {
  WELCOME_GYM_CHECK_MS,
  WELCOME_SCAN_WORDS,
  welcomeGymChecked,
  welcomeGymAutoCheck,
  welcomeGymCode,
  welcomeGymKept,
  welcomeGymScanned,
  welcomeJoinLabel,
} from '../welcomeGym';
import { START_WORDS } from '../welcomeStart';
import { OrangePill, QrMark } from './WelcomeParts';

/** The gym code waiting to be joined after setup, and what the gym said about it. */
export interface WaitingGym {
  /** The kept code, or null. */
  code: string | null;
  /** "<Gym> found. ..." once the gym answered; null = the plain saved line. */
  line: string | null;
  /** The gym's name once it answered. */
  gymName: string | null;
  keep: (code: string, line: string | null, gymName: string | null) => void;
  clear: () => void;
}

/**
 * Held by the whole welcome (not only the "Join my gym" screen): Continue with Google needs to know a
 * code waits (R-106), and a gym link opened before setup must show as saved.
 */
export function useWaitingGym(): WaitingGym {
  // A gym link opened before setup already waits: show it as saved.
  const [code, setCode] = useState<string | null>(() => peekPendingInvite());
  const [line, setLine] = useState<string | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);

  // What waits can change under this screen: a code kept before the app was closed during setup
  // (restored from the phone), or a gym link tapped now (app/_layout.tsx keeps it). Show what will open.
  useEffect(() => {
    let live = true;
    const reread = (): void => {
      // After the layout's own link listener has kept the code.
      setTimeout(() => {
        if (!live) return;
        const now = peekPendingInvite();
        setCode((cur) => {
          if (cur !== now) {
            setLine(null);
            setGymName(null);
          }
          return now;
        });
      }, 0);
    };
    void restorePendingLinks().then(reread);
    const link = Linking.addEventListener('url', reread);
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') reread();
    });
    return () => {
      live = false;
      link.remove();
      app.remove();
    };
  }, []);

  const keep = useCallback((c: string, l: string | null, name: string | null) => {
    setPendingInvite(c);
    setLine(l);
    setGymName(name);
    setCode(c);
  }, []);
  const clear = useCallback(() => {
    setPendingInvite(null);
    setLine(null);
    setGymName(null);
    setCode(null);
  }, []);
  return { code, line, gymName, keep, clear };
}

export function WelcomeGymCode({ gym, onJoin }: { gym: WaitingGym; onJoin: () => void }) {
  const kept = gym.code;
  const [typed, setTyped] = useState(() => kept ?? '');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The poster scanner is open (in place of the poster box; the code box stays usable under it).
  const [scanning, setScanning] = useState(false);
  const checkRun = useRef(0);
  // One check at a time: Done, Join and the box losing focus can all ask in the same frame.
  const inFlight = useRef(false);
  const inputRef = useRef<TextInput>(null);

  // A code kept from elsewhere (a gym link tapped now) shows in the box.
  useEffect(() => {
    if (kept) setTyped(kept);
  }, [kept]);

  // Android's Back closes the keyboard but leaves the box focused, so the next tap does not select the
  // code and a new one is typed into the old (phone run 41389032578: "FORGE1E1ZZ9"). Let go with it.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => inputRef.current?.blur());
    return () => sub.remove();
  }, []);

  // A wrong code is told now when the phone is online; offline or slow, the code is kept and the
  // gym's join screen checks it after setup (no internet is needed to finish setting up).
  // `text`: a scanned poster's code; else what is in the box. True when a code is kept.
  const save = async (text: string = typed): Promise<boolean> => {
    if (inFlight.current) return false;
    const r = welcomeGymCode(text);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    const run = ++checkRun.current;
    inFlight.current = true;
    setChecking(true);
    let answer: { gymName: string } | null | 'unknown' = 'unknown';
    try {
      const res = await Promise.race([
        apiPreview(r.code),
        new Promise<null>((done) => setTimeout(() => done(null), WELCOME_GYM_CHECK_MS)),
      ]);
      if (res && res.ok) answer = res.data;
    } catch (e: unknown) {
      console.warn('[welcome] gym code check failed; kept for after setup', e);
    }
    // A check that "Change the code" cancelled leaves the lock to the newer one (release review).
    if (run !== checkRun.current) return false;
    inFlight.current = false;
    setChecking(false);
    const checked = welcomeGymChecked(r.code, answer);
    if (!checked.keep) {
      setError(checked.error);
      return false;
    }
    setError(null);
    setScanning(false);
    setTyped(r.code);
    gym.keep(r.code, checked.line, answer && answer !== 'unknown' ? answer.gymName.trim() || null : null);
    return true;
  };
  // A gym's poster read: the code goes in the box and is checked as if typed. Any other QR: keep scanning.
  const onScanned = (data: string): boolean => {
    const code = welcomeGymScanned(data);
    if (!code) return false;
    setScanning(false);
    setTyped(code);
    setError(null);
    void save(code);
    return true;
  };
  const scanRef = useRef(onScanned);
  scanRef.current = onScanned;
  const onRead = useCallback((data: string) => scanRef.current(data), []);

  const change = (): void => {
    checkRun.current += 1;
    inFlight.current = false;
    setChecking(false);
    gym.clear();
    setTyped('');
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const join = async (): Promise<void> => {
    if (kept) {
      onJoin();
      return;
    }
    if (await save()) onJoin();
  };

  return (
    <View style={{ gap: space.xl }}>
      {/* ---------------------------------------------------------------- the poster */}
      {scanning ? (
        <View style={{ gap: space.sm }}>
          <PosterScanner onRead={onRead} words={WELCOME_SCAN_WORDS} />
          <GhostButton label={WELCOME_SCAN_WORDS.close} onPress={() => setScanning(false)} />
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setError(null);
            setScanning(true);
          }}
          disabled={checking}
          // No label of its own: the two lines inside are read out (and phone tests find each line).
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 200,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: color.borderStrong,
            borderRadius: 22,
            backgroundColor: color.surface,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.md,
            padding: space.lg,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <QrMark size={44} />
          <Text style={{ fontFamily: type.bodyBold, fontSize: 17, color: color.ink, textAlign: 'center' }}>{START_WORDS.scanTitle}</Text>
          <Text style={{ fontFamily: type.body, fontSize: 14, color: color.inkMuted, textAlign: 'center' }}>{START_WORDS.scanHint}</Text>
        </Pressable>
      )}

      {/* ---------------------------------------------------------------- or type it */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
        <Text style={{ fontFamily: type.body, fontSize: 14, color: color.inkFaint, flexShrink: 1, textAlign: 'center' }}>{START_WORDS.orType}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
      </View>

      <View style={{ gap: 10 }}>
        {/* Tapping the label opens the box (phone tests tap "Gym code"). */}
        <Text
          onPress={() => {
            if (kept) return;
            // Phone runs 41384338194/41384341259: the box is centred, so a tap put the cursor mid-code and
            // a new code was typed into the old one ("FORGE1E1ZZ9"). Focus afresh so the whole code is selected.
            inputRef.current?.blur();
            inputRef.current?.focus();
          }}
          importantForAccessibility="no"
          style={{ fontFamily: type.body, fontSize: 14, color: color.inkMuted }}
        >
          {START_WORDS.codeLabel}
        </Text>
        <TextInput
          ref={inputRef}
          value={typed}
          editable={!kept}
          onChangeText={(t) => {
            const next = t.slice(0, 120);
            const whole = welcomeGymAutoCheck(typed, next);
            setTyped(next);
            setError(null);
            if (whole) void save(next);
          }}
          autoCapitalize="characters"
          // A tap selects the whole code, so typing a new one replaces it (never mixes into it).
          selectTextOnFocus
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          // Typed in full, then another button tapped: keep it anyway.
          onBlur={() => {
            if (!kept && welcomeGymCode(typed).ok) void save();
          }}
          placeholder={`${JOIN_CODE_LENGTH} letters or numbers`}
          placeholderTextColor={color.inkFaint}
          accessibilityLabel={START_WORDS.codeLabel}
          accessibilityHint={`The ${JOIN_CODE_LENGTH} letters and numbers your gym gave you`}
          style={{
            minHeight: 56,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: typed || kept ? color.accent : color.borderStrong,
            backgroundColor: color.surface,
            color: color.ink,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            textAlign: 'center',
            // The wide code look only for the code itself; the hint in body type fits a large display size.
            ...(typed
              ? { fontFamily: type.monoBold, fontSize: 22, letterSpacing: 5 }
              : { fontFamily: type.body, fontSize: type.size.body }),
          }}
        />
        <InlineError message={error} />
        {kept ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: 'rgba(25, 169, 122, 0.14)',
                borderRadius: radius.md,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Icon name="check" size={20} color={color.goodText} />
              {/* Spoken by the live region when the gym answers. */}
              <Text accessibilityLiveRegion="polite" style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: 15, color: color.ink, lineHeight: 21 }}>
                {gym.line ?? welcomeGymKept(kept)}
              </Text>
            </View>
            <GhostButton label="Change the code" onPress={change} />
          </>
        ) : null}
      </View>

      <OrangePill
        label={checking ? 'Checking the code…' : welcomeJoinLabel(gym.gymName)}
        loading={checking}
        onPress={() => void join()}
      />
    </View>
  );
}
