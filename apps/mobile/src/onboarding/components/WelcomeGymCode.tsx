/**
 * "Have a gym code? Join your gym" under Next on the welcome screen (OWNER-INBOX #11, decided
 * 18 Oct 2026). Folded to one line until tapped. The code is kept like a gym's invite link
 * (shop/pendingInvite.ts) and the gym's "Join <gym>" screen opens once setup is done (app/_layout.tsx),
 * where the member sees the gym and says yes. Nothing is joined here, and no internet is needed.
 *
 * 1 Nov 2026: "Scan the poster", as on the Gym tab (the same PosterScanner panel; no new native module).
 * A scanned poster fills the box and is checked exactly like a typed code (welcomeGymChecked). If the
 * camera is refused, the panel says so in one sentence and the code box stays right under it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton, GlassCard } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { JOIN_CODE_LENGTH } from '@/shop/gym';
import { apiPreview } from '@/shop/gymApi';
import { PosterScanner } from '@/shop/PosterScanner';
import { peekPendingInvite, restorePendingLinks, setPendingInvite } from '@/shop/pendingInvite';
import { shopInputStyle } from '@/shop/ShopParts';
import { color, space, type } from '@/theme/tokens';

import {
  WELCOME_GYM_ASK,
  WELCOME_GYM_CHECK_MS,
  WELCOME_GYM_WHY,
  WELCOME_SCAN_WORDS,
  welcomeGymChecked,
  welcomeGymCode,
  welcomeGymKept,
  welcomeGymScanned,
} from '../welcomeGym';
import { START_WORDS } from '../welcomeStart';

/**
 * `onKept`: told whenever a code starts or stops waiting (the welcome screen's Google button needs it, R-106).
 * `inSection` (R-131): drawn inside the welcome's "Do you train at a gym?" section, which says what the code
 * is for: no box of its own, and a button instead of the underlined line.
 */
export function WelcomeGymCode({ onKept, inSection = false }: { onKept?: (code: string | null) => void; inSection?: boolean } = {}) {
  // A gym link opened before setup already waits: show it as saved.
  const [kept, setKept] = useState<string | null>(() => peekPendingInvite());

  useEffect(() => {
    onKept?.(kept);
  }, [kept, onKept]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  // UAT 1 Nov 2026: the line once the gym answered ("<Gym> found. ..."); null = the plain saved line.
  const [keptLine, setKeptLine] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The poster scanner is open (over the code box, which stays usable under it).
  const [scanning, setScanning] = useState(false);
  const checkRun = useRef(0);
  // One check at a time: Done and the box losing focus can both ask in the same frame.
  const inFlight = useRef(false);

  // What waits can change under this screen: a code kept before the app was closed during setup
  // (restored from the phone), or a gym link tapped now (app/_layout.tsx keeps it). Show what will open.
  useEffect(() => {
    let live = true;
    const reread = (): void => {
      // After the layout's own link listener has kept the code.
      setTimeout(() => {
        if (live) setKept(peekPendingInvite());
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

  const keep = (code: string, line: string | null): void => {
    setPendingInvite(code);
    setKeptLine(line);
    setKept(code);
    setOpen(false);
    setScanning(false);
  };

  // A wrong code is told now when the phone is online; offline or slow, the code is kept and the
  // gym's join screen checks it after setup (no internet is needed to finish setting up).
  // `text`: a scanned poster's code; else what is in the box.
  const save = async (text: string = typed): Promise<void> => {
    if (inFlight.current) return;
    const r = welcomeGymCode(text);
    if (!r.ok) {
      setError(r.error);
      return;
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
    inFlight.current = false;
    if (run !== checkRun.current) return;
    setChecking(false);
    const checked = welcomeGymChecked(r.code, answer);
    if (!checked.keep) {
      setError(checked.error);
      return;
    }
    keep(r.code, checked.line);
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
  const startScan = (): void => {
    setOpen(true);
    setScanning(true);
  };

  const change = (): void => {
    checkRun.current += 1;
    setChecking(false);
    setKeptLine(null);
    setPendingInvite(null);
    setKept(null);
    setTyped('');
    setOpen(true);
  };

  const Box = inSection ? View : GlassCard;

  if (kept) {
    return (
      <Box style={{ gap: space.sm }}>
        <Text accessibilityLiveRegion="polite" style={inSection ? { ...body(), color: color.ink } : body()}>
          {keptLine ?? welcomeGymKept(kept)}
        </Text>
        <GhostButton label="Change the code" onPress={change} />
      </Box>
    );
  }

  if (!open) {
    if (inSection) {
      return (
        <View style={{ gap: space.sm }}>
          <GhostButton label={WELCOME_SCAN_WORDS.scan} icon="camera" onPress={startScan} />
          <GhostButton label={START_WORDS.gymButton} icon="key" onPress={() => setOpen(true)} />
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, textDecorationLine: 'underline' }}>{WELCOME_GYM_ASK}</Text>
      </Pressable>
    );
  }

  return (
    <Box style={{ gap: space.md }}>
      {inSection ? null : (
        <View style={{ gap: space.xs }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            Join your gym
          </Text>
          <Text style={body()}>{WELCOME_GYM_WHY}</Text>
        </View>
      )}
      {scanning ? (
        <View style={{ gap: space.sm }}>
          <PosterScanner onRead={onRead} words={WELCOME_SCAN_WORDS} />
          <GhostButton label={WELCOME_SCAN_WORDS.close} onPress={() => setScanning(false)} />
        </View>
      ) : null}
      <TextInput
        value={typed}
        onChangeText={(t) => {
          setTyped(t.slice(0, 120));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        // Not over the camera: the keyboard would cover the scanner.
        autoFocus={!scanning}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        // Typed in full, then another button tapped without "Save the code": keep it anyway.
        onBlur={() => {
          if (welcomeGymCode(typed).ok) void save();
        }}
        placeholder={`${JOIN_CODE_LENGTH} letters or numbers`}
        placeholderTextColor={color.inkFaint}
        accessibilityLabel="Gym code"
        accessibilityHint={`The ${JOIN_CODE_LENGTH} letters and numbers your gym gave you`}
        // R-267: the wide code look only for the code itself; the hint in body type fits a large display size.
        style={[shopInputStyle(), typed ? { fontFamily: type.monoBold, letterSpacing: 2 } : null]}
      />
      <InlineError message={error} />
      <GhostButton label={checking ? 'Checking the code…' : 'Save the code'} onPress={() => void save()} />
      {scanning || checking ? null : <GhostButton label={WELCOME_SCAN_WORDS.scan} icon="camera" onPress={startScan} />}
    </Box>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const body = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }) as const;
