/**
 * Profile → "Your details": name, mobile number, gym, goal, experience, age and height (and the
 * daily targets while nutrition is switched on). SH-09: every welcome answer can be changed here.
 *
 * Audit Phase 7 (SH-16, SH-10): no "Save profile" button any more. A tap on a choice saves at
 * once; a typed answer saves a moment after the member stops typing, when the box loses focus,
 * and when the app goes to the background. A wrong answer is written under its own box (and
 * spoken), never in a pop-up, and is simply not saved. A quiet "Saved" line confirms each save.
 * The mobile number is optional: add it, change it, or remove it ("Remove" offers Undo).
 * "Try again" after a failed save re-runs every failed box AND the last failed chip tap.
 *
 * Writes go through the existing save path: `updateProfile` (queued) for the profile columns,
 * `setMemberPhone` (queued) for the number. Pure rules: `profileAutosave.ts`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, Text, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { ageToText, EXPERIENCE_OPTIONS, heightForUnits, heightToText } from '@/components/settings/profileFields';
import { Card, Icon, UndoBar } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { updateProfile } from '@/db/queuedWrites';
import { getMemberPhone, setMemberPhone } from '@/onboarding/db/dataActions';
import { NAME_MAX } from '@/onboarding/form';
import { useOnboarding } from '@/onboarding/store/onboardingStore';
import { FEATURES } from '@/lib/features';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import type { UserProfile } from '@/types/models';

import {
  AUTOSAVE_DELAY_MS,
  checkProfileField,
  chipPatch,
  createDebouncer,
  NO_RETRY,
  SAVED_SHOWN_MS,
  saveFailed,
  saveWorked,
  TARGET_RULES,
  type ChipChange,
  type ProfileTextField,
  type ProfileWrite,
  type RetryList,
  type TargetKey,
} from './profileAutosave';

const GOAL_OPTIONS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'general', label: 'General fitness' },
] as const satisfies readonly ChipOption<UserProfile['goal']>[];

const TARGET_KEYS: readonly TargetKey[] = ['calorieTarget', 'proteinTargetG', 'carbsTargetG', 'fatTargetG'];

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 12,
  minHeight: 48,
  color: color.ink,
  fontFamily: type.body,
  fontSize: type.size.body,
} as const;

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

type Texts = Record<ProfileTextField, string>;

const EMPTY_TEXTS: Texts = {
  name: '',
  phone: '',
  gymName: '',
  age: '',
  height: '',
  calorieTarget: '',
  proteinTargetG: '',
  carbsTargetG: '',
  fatTargetG: '',
};

function textsFrom(p: UserProfile, phone: string | null, units: 'metric' | 'imperial'): Texts {
  return {
    name: p.name,
    phone: phone ?? '',
    gymName: p.gymName,
    age: ageToText(p.age),
    height: heightToText(p.heightCm, units),
    calorieTarget: String(p.calorieTarget),
    proteinTargetG: String(p.proteinTargetG),
    carbsTargetG: String(p.carbsTargetG),
    fatTargetG: String(p.fatTargetG),
  };
}

/**
 * The line under a box. Spoken ONCE, by `commitNow`'s announcement when the line appears or
 * changes — no live region as well, or TalkBack would say it twice.
 */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text
      style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, marginTop: space.xs, lineHeight: 19 }}
    >
      {message}
    </Text>
  );
}

export function ProfileCard({ onSaved }: { onSaved?: () => void }) {
  const units = useUnits();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [texts, setTexts] = useState<Texts>(EMPTY_TEXTS);
  const [errors, setErrors] = useState<Partial<Record<ProfileTextField, string>>>({});
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  // The number just removed, while its Undo bar shows ("Number removed · Undo").
  const [undoPhone, setUndoPhone] = useState<string | null>(null);

  // The latest of everything, for saves that run after a pause (never a stale closure).
  const live = useRef({ profile, texts, savedPhone, units });
  live.current = { profile, texts, savedPhone, units };
  /** What each box said when it was last loaded or saved — an untouched box is never re-saved (#12). */
  const seeded = useRef<Texts>(EMPTY_TEXTS);
  const shownUnits = useRef(units);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What "Try again" re-runs: failed boxes and the last failed chip tap (`RetryList`). */
  const retryList = useRef<RetryList>(NO_RETRY);
  const shownErrors = useRef(errors);
  shownErrors.current = errors;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    let alive = true;
    Promise.all([getProfile(), getMemberPhone().catch(() => null)])
      .then(([p, phone]) => {
        if (!alive) return;
        const t = textsFrom(p, phone, shownUnits.current);
        seeded.current = t;
        setProfile(p);
        setSavedPhone(phone);
        setTexts(t);
      })
      .catch(() => {
        /* no profile yet — the card simply stays empty; nothing to edit yet */
      });
    return () => {
      alive = false;
    };
  }, []);

  const showSaved = useCallback(() => {
    setStatus('saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), SAVED_SHOWN_MS);
  }, []);

  /** Write one change through the queued save path, then show "Saved". */
  const write = useCallback(
    async (w: ProfileWrite, field: ProfileTextField | null, text: string | null, chip: ChipChange | null = null): Promise<boolean> => {
      // After "Erase all data" (or while the demo loads) the card is about to go: write nothing.
      const boot = useOnboarding.getState();
      if (boot.status !== 'ready' || boot.busy) return false;
      try {
        if (w.phone !== undefined) {
          await setMemberPhone(w.phone);
          setSavedPhone(w.phone);
        }
        if (w.profile && Object.keys(w.profile).length > 0) {
          const updated = await updateProfile(w.profile);
          setProfile(updated);
        }
        if (field && text != null) {
          seeded.current = { ...seeded.current, [field]: text };
          retryList.current = saveWorked(retryList.current, { field });
        }
        if (chip) retryList.current = saveWorked(retryList.current, { chip });
        showSaved();
        onSavedRef.current?.();
        return true;
      } catch {
        if (field) retryList.current = saveFailed(retryList.current, { field });
        if (chip) retryList.current = saveFailed(retryList.current, { chip });
        setStatus('failed');
        AccessibilityInfo.announceForAccessibility("Couldn't save your change.");
        return false;
      }
    },
    [showSaved],
  );

  /**
   * Check one box and save it if it changed. `reveal`: the member has left the box (or pressed
   * done), so a wrong answer is now written under it and spoken; while they are still typing a
   * half-typed answer stays quiet.
   */
  const commitNow = useCallback(
    async (field: ProfileTextField, reveal: boolean): Promise<void> => {
      const { profile: p, texts: t, savedPhone: phone, units: u } = live.current;
      if (!p) return;
      const text = t[field];
      if (text === seeded.current[field] && !retryList.current.fields.includes(field)) {
        setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
        return;
      }
      const r = checkProfileField(field, text, { profile: p, savedPhone: phone, units: u });
      if (r.kind === 'invalid') {
        if (reveal) {
          if (shownErrors.current[field] !== r.message) AccessibilityInfo.announceForAccessibility(r.message);
          setErrors((e) => ({ ...e, [field]: r.message }));
        }
        return;
      }
      setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
      if (r.kind === 'same') {
        seeded.current = { ...seeded.current, [field]: text };
        return;
      }
      await write(r.write, field, text);
    },
    [write],
  );

  // One check-and-save at a time per box: a blur right after a pause (or "done" then blur)
  // waits for the save already running, then finds nothing left to write.
  const inflight = useRef(new Map<ProfileTextField, Promise<void>>());
  const commit = useCallback(
    (field: ProfileTextField, reveal: boolean): Promise<void> => {
      const run = (inflight.current.get(field) ?? Promise.resolve()).then(() => commitNow(field, reveal));
      inflight.current.set(
        field,
        run.catch(() => undefined),
      );
      return run;
    },
    [commitNow],
  );

  const debouncer = useRef(createDebouncer<ProfileTextField>((f) => commit(f, false), AUTOSAVE_DELAY_MS));
  // `commit` is stable, but keep the debouncer pointed at the current one regardless.
  useEffect(() => {
    debouncer.current.cancel();
    debouncer.current = createDebouncer<ProfileTextField>((f) => commit(f, false), AUTOSAVE_DELAY_MS);
  }, [commit]);

  // Leaving the app (home button, switching apps): save what is waiting rather than lose it.
  // The card going away (an erase, the app closing) does the same; `write` refuses after an erase.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void debouncer.current.flush();
    });
    return () => {
      sub.remove();
      void debouncer.current.flush();
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // #12: Units switched while this card is open — re-write the height box in the new unit, and
  // what counts as "unchanged" with it (an untouched height is never refused in the wrong unit).
  useEffect(() => {
    const from = shownUnits.current;
    shownUnits.current = units;
    if (from === units) return;
    const next = heightForUnits({
      text: live.current.texts.height,
      seeded: seeded.current.height,
      storedCm: live.current.profile?.heightCm ?? 0,
      from,
      to: units,
    });
    seeded.current = { ...seeded.current, height: next.seeded };
    setTexts((t) => ({ ...t, height: next.text }));
    setErrors((e) => (e.height ? { ...e, height: undefined } : e));
  }, [units]);

  const edit = (field: ProfileTextField, text: string): void => {
    setTexts((t) => ({ ...t, [field]: text }));
    live.current = { ...live.current, texts: { ...live.current.texts, [field]: text } };
    if (status === 'failed') setStatus('idle');
    debouncer.current.schedule(field);
  };

  const leave = (field: ProfileTextField) => (): void => {
    debouncer.current.drop(field);
    void commit(field, true);
  };

  /**
   * A chip: saved at once. It moves straight away and moves back if the save failed — and the
   * tap is remembered, so "Try again" makes it again.
   */
  const pick = async (change: ChipChange): Promise<void> => {
    const before = live.current.profile;
    if (!before) return;
    if (before[change.key] === change.value) {
      retryList.current = saveWorked(retryList.current, { chip: change });
      return;
    }
    const was = chipPatch({ key: change.key, value: before[change.key] } as ChipChange);
    setProfile((p) => (p ? { ...p, ...chipPatch(change) } : p));
    const ok = await write({ profile: chipPatch(change) }, null, null, change);
    if (!ok) setProfile((p) => (p ? { ...p, ...was } : p));
  };

  /** Remove: saved at once (no "Are you sure?"), with Undo putting the old number back. */
  const removePhone = (): void => {
    const previous = live.current.savedPhone;
    if (!previous) return;
    setUndoPhone(null);
    edit('phone', '');
    debouncer.current.drop('phone');
    void commit('phone', true).then(() => {
      // Saved only when the box's "last saved" text is now blank; a failed save shows the
      // "Couldn't save" line instead, and the number is still on record.
      if (seeded.current.phone === '') setUndoPhone(previous);
    });
  };

  const undoRemovePhone = (): void => {
    const previous = undoPhone;
    setUndoPhone(null);
    if (!previous) return;
    edit('phone', previous);
    debouncer.current.drop('phone');
    void commit('phone', true);
  };

  const retry = (): void => {
    setStatus('idle');
    const { fields, chips } = retryList.current;
    for (const f of fields) void commit(f, true);
    for (const c of chips) void pick(c);
  };

  const box = (field: ProfileTextField, { label, ...extra }: Partial<React.ComponentProps<typeof TextInput>> & { label: string }) => (
    <TextInput
      value={texts[field]}
      onChangeText={(t) => edit(field, t)}
      onBlur={leave(field)}
      onSubmitEditing={leave(field)}
      editable={profile != null}
      placeholderTextColor={color.inkFaint}
      accessibilityLabel={label}
      returnKeyType="done"
      style={[inputStyle, errors[field] ? { borderColor: color.criticalText } : null]}
      {...extra}
    />
  );

  return (
    <Card>
      {/* The quiet confirmation: "Saved" beside a fixed line, gone after a moment. Only the
          changing part is a live region, so a screen reader says "Saved" and nothing else. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.sm, minHeight: 20, marginBottom: space.sm }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>Changes save as you go.</Text>
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {status === 'saved' ? (
            <>
              <Icon name="check" size={14} color={color.inkSecondary} />
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Saved</Text>
            </>
          ) : null}
        </View>
      </View>
      {status === 'failed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.sm, marginBottom: space.sm }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, flexShrink: 1 }}>
            Couldn&apos;t save your change.
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Try saving again"
            style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={overline}>Name</Text>
      {box('name', { label: 'Your name', placeholder: 'Your name', maxLength: NAME_MAX + 20, autoCapitalize: 'words', autoComplete: 'name' })}
      <FieldError message={errors.name} />

      <View style={{ marginTop: space.lg }}>
        <Text style={overline}>Mobile number · optional</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            {box('phone', {
              label: 'Mobile number, optional',
              // Typing a new number ends the Undo offer (Undo would overwrite it).
              onChangeText: (t: string) => {
                setUndoPhone(null);
                edit('phone', t);
              },
              placeholder: 'e.g. +91 98765 43210',
              keyboardType: 'phone-pad',
              autoComplete: 'tel',
              maxLength: 24,
            })}
          </View>
          {savedPhone ? (
            <Pressable
              onPress={removePhone}
              accessibilityRole="button"
              accessibilityLabel="Remove mobile number"
              style={({ pressed }) => ({ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.criticalText }}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
        <FieldError message={errors.phone} />
        {undoPhone ? (
          <View style={{ marginTop: space.sm }}>
            <UndoBar
              key={undoPhone}
              message="Number removed"
              onAction={undoRemovePhone}
              onDismiss={() => setUndoPhone(null)}
            />
          </View>
        ) : null}
        {!errors.phone && !undoPhone ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }}>
            Any country. Stays on this phone; only your gym will use it, once you link one.
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: space.lg }}>
        <Text style={overline}>Your gym · optional</Text>
        {box('gymName', { label: 'Your gym, optional', placeholder: 'e.g. Iron Temple Fitness', maxLength: 80, autoCapitalize: 'words' })}
        <FieldError message={errors.gymName} />
      </View>

      <View style={{ marginTop: space.lg }}>
        <ChipGroup label="Goal" options={GOAL_OPTIONS} selectedId={profile?.goal ?? 'muscle'} onSelect={(g) => void pick({ key: 'goal', value: g })} />
      </View>

      <View style={{ marginTop: space.lg }}>
        <ChipGroup
          label="Experience"
          options={EXPERIENCE_OPTIONS}
          selectedId={profile?.experience ?? 'beginner'}
          onSelect={(x) => void pick({ key: 'experience', value: x })}
        />
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }}>
          Your Targets use it: new lifters may jump two steps when a weight looks easy.
        </Text>
      </View>

      {/* Two boxes side by side; each takes at least half the card and wraps under the other
          when the phone's text is large. */}
      <View style={{ marginTop: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <Text style={overline}>Age · optional</Text>
          {box('age', { label: 'Age in years, optional', placeholder: 'e.g. 28', keyboardType: 'number-pad', maxLength: 3 })}
          <FieldError message={errors.age} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <Text style={overline}>{units === 'imperial' ? 'Height (in) · optional' : 'Height (cm) · optional'}</Text>
          {box('height', {
            label: units === 'imperial' ? 'Height in inches, optional' : 'Height in centimetres, optional',
            placeholder: units === 'imperial' ? 'e.g. 69' : 'e.g. 175',
            keyboardType: 'decimal-pad',
            maxLength: 5,
          })}
          <FieldError message={errors.height} />
        </View>
      </View>

      {/* Calorie and macro targets only drive nutrition, which is hidden (owner decision D4). */}
      {FEATURES.nutrition ? (
        <View style={{ marginTop: space.lg }}>
          <Text style={overline}>Daily targets</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TARGET_KEYS.map((k) => {
              const rule = TARGET_RULES[k];
              return (
                <View key={k} style={{ flexBasis: 140, flexGrow: 1 }}>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary, marginBottom: 4 }}>
                    {rule.label} ({rule.unit})
                  </Text>
                  {box(k, { label: `${rule.label} target in ${rule.unit}`, placeholder: '0', keyboardType: 'number-pad', maxLength: 5 })}
                  <FieldError message={errors[k]} />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </Card>
  );
}
