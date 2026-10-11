/**
 * Edit profile (redesign R2) — Hevy's: the photo (take one, choose one, remove it), the name, a
 * short bio and one link. Saves as you type, like Your details in Settings (no Save button): a
 * moment after the member stops typing, when a box loses focus, and when the app goes to the
 * background. A wrong answer is written under its own box and simply not saved; a quiet "Saved"
 * line confirms each save.
 *
 * The photo is copied into the app's own folder (`profilePhoto.ts`), so deleting it from the
 * gallery does not lose it. It stays on this phone.
 */
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, TextInput, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { AUTOSAVE_DELAY_MS, SAVED_SHOWN_MS } from '@/components/settings/profileAutosave';
import { updateProfile } from '@/db/queuedWrites';
import { getProfile } from '@/db/repos/userRepo';
import { goBack } from '@/lib/goBack';
import { tell } from '@/lib/tell';
import { checkName, NAME_MAX } from '@/onboarding/form';
import { useDashboard } from '@/store/dashboardStore';
import { color, radius, space, type } from '@/theme/tokens';

import { Avatar } from '@/tracker/components/profile/Avatar';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { BIO_MAX, cleanBio, cleanLink, getProfileExtras, LINK_MAX, setProfileExtras } from '@/tracker/db/profileExtras';
import {
  keepPendingProfilePhoto,
  pickProfilePhoto,
  removeProfilePhoto,
  takeProfilePhoto,
} from '@/tracker/services/profilePhoto';

type Field = 'name' | 'bio' | 'link';

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: space.sm,
  minHeight: 48,
  color: color.ink,
  fontFamily: type.bodyMedium,
  fontSize: type.size.body,
} as const;

const labelStyle = { fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.xs } as const;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // What is stored now — a box saves only when it differs.
  const stored = useRef<{ name: string; bio: string | null; link: string | null }>({ name: '', bio: null, link: null });
  const values = useRef({ name: '', bio: '', link: '' });
  values.current = { name, bio, link };
  const timers = useRef(new Map<Field, ReturnType<typeof setTimeout>>());
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getProfile(), getProfileExtras()])
      .then(([p, x]) => {
        if (!alive) return;
        stored.current = { name: p.name, bio: x.bio, link: x.link };
        setName(p.name);
        setBio(x.bio ?? '');
        setLink(x.link ?? '');
        setPhoto(x.photoUri);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) void tell('Couldn’t open your profile', 'Please try again.');
      });
    return () => {
      alive = false;
    };
  }, []);

  // A photo Android's restart left behind (it closed ForgeAI behind the camera) is kept.
  useFocusEffect(
    useCallback(() => {
      keepPendingProfilePhoto()
        .then((uri) => {
          if (uri) setPhoto(uri);
        })
        .catch(() => undefined);
    }, []),
  );

  const showSaved = (): void => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), SAVED_SHOWN_MS);
  };

  const save = useCallback(async (field: Field): Promise<void> => {
    const v = values.current;
    try {
      if (field === 'name') {
        const r = checkName(v.name);
        if (!r.ok) {
          setErrors((e) => ({ ...e, name: r.message }));
          return;
        }
        setErrors((e) => ({ ...e, name: undefined }));
        if (r.name === stored.current.name) return;
        await updateProfile({ name: r.name });
        stored.current.name = r.name;
        void useDashboard.getState().refresh().catch(() => undefined);
      } else if (field === 'bio') {
        const b = cleanBio(v.bio);
        setErrors((e) => ({ ...e, bio: undefined }));
        if (b === stored.current.bio) return;
        await setProfileExtras({ bio: b });
        stored.current.bio = b;
      } else {
        const l = cleanLink(v.link);
        if (l.error) {
          setErrors((e) => ({ ...e, link: l.error ?? undefined }));
          return;
        }
        setErrors((e) => ({ ...e, link: undefined }));
        if (l.link === stored.current.link) return;
        await setProfileExtras({ link: l.link });
        stored.current.link = l.link;
      }
      showSaved();
    } catch {
      setErrors((e) => ({ ...e, [field]: 'Couldn’t save this. Please try again.' }));
    }
  }, []);

  const schedule = (field: Field): void => {
    const t = timers.current.get(field);
    if (t) clearTimeout(t);
    timers.current.set(
      field,
      setTimeout(() => {
        timers.current.delete(field);
        void save(field);
      }, AUTOSAVE_DELAY_MS),
    );
  };

  const flush = useCallback(
    (field?: Field): void => {
      const keys = field ? [field] : ([...timers.current.keys()] as Field[]);
      for (const k of keys) {
        const t = timers.current.get(k);
        if (!t) continue;
        clearTimeout(t);
        timers.current.delete(k);
        void save(k);
      }
    },
    [save],
  );

  // Review fix: leaving starts the save BEFORE the back animation, so the Profile (which reads
  // its header when it comes back on screen) already finds the new name, bio and link.
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('beforeRemove', () => flush()), [navigation, flush]);

  // Leaving the page, or the app going to the background, saves what is waiting.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') flush();
    });
    return () => {
      sub.remove();
      flush();
    };
  }, [flush]);

  const onPhoto = async (how: 'camera' | 'gallery' | 'remove'): Promise<void> => {
    setPhotoMenu(false);
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      // Let the menu slide away before the camera or gallery opens.
      await new Promise((r) => setTimeout(r, 260));
      if (how === 'remove') {
        await removeProfilePhoto();
        setPhoto(null);
      } else {
        const uri = how === 'camera' ? await takeProfilePhoto() : await pickProfilePhoto();
        if (uri) setPhoto(uri);
        else return;
      }
      showSaved();
    } catch (e) {
      if (e instanceof Error && e.message === 'camera-denied') {
        void tell('Camera not allowed', 'Allow the camera for ForgeAI in your phone’s settings, or choose a photo instead.');
      } else void tell('Couldn’t change the photo', 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const error = (f: Field) =>
    errors[f] ? (
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.criticalText, marginTop: space.xs }}>
        {errors[f]}
      </Text>
    ) : null;

  return (
    <Screen title="Edit profile" onBack={() => goBack(router, '/profile')}>
      {loaded ? (
        <View style={{ gap: space.xl }}>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Avatar uri={photo} name={name} size={104} />
            <Pressable
              onPress={() => setPhotoMenu(true)}
              accessibilityRole="button"
              accessibilityLabel={photo ? 'Change your photo' : 'Add a photo'}
              style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, opacity: pressed || photoBusy ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>
                {photoBusy ? 'Saving the photo…' : photo ? 'Change photo' : 'Add photo'}
              </Text>
            </Pressable>
          </View>

          <Card style={{ gap: space.lg }}>
            <View>
              <Text style={labelStyle}>Name</Text>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  schedule('name');
                }}
                onBlur={() => flush('name')}
                maxLength={NAME_MAX + 10}
                autoCapitalize="words"
                autoComplete="name"
                accessibilityLabel="Name"
                style={inputStyle}
                placeholderTextColor={color.inkFaint}
              />
              {error('name')}
            </View>

            <View>
              <Text style={labelStyle}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={(t) => {
                  setBio(t.slice(0, BIO_MAX));
                  schedule('bio');
                }}
                onBlur={() => flush('bio')}
                multiline
                maxLength={BIO_MAX}
                placeholder="A line about you"
                placeholderTextColor={color.inkFaint}
                accessibilityLabel={`Bio, up to ${BIO_MAX} characters`}
                style={[inputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
              />
              <Text style={{ fontFamily: type.mono, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, textAlign: 'right' }}>
                {`${bio.length} / ${BIO_MAX}`}
              </Text>
              {error('bio')}
            </View>

            <View>
              <Text style={labelStyle}>Link</Text>
              <TextInput
                value={link}
                onChangeText={(t) => {
                  setLink(t);
                  schedule('link');
                }}
                onBlur={() => flush('link')}
                maxLength={LINK_MAX}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="instagram.com/yourname"
                placeholderTextColor={color.inkFaint}
                accessibilityLabel="Link"
                style={inputStyle}
              />
              {error('link')}
            </View>
          </Card>

          <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, minHeight: 18 }}>
            {saved ? 'Saved' : 'Changes save as you type.'}
          </Text>
        </View>
      ) : null}

      <TrackerSheet visible={photoMenu} title="Profile photo" onClose={() => setPhotoMenu(false)}>
        <View style={{ gap: 2 }}>
          <SheetRow label="Take a photo" leading={<Glyph name="image" size={20} color={color.accent} />} onPress={() => void onPhoto('camera')} />
          <SheetRow label="Choose from gallery" leading={<Glyph name="image" size={20} color={color.accent} />} onPress={() => void onPhoto('gallery')} />
          {photo ? (
            <SheetRow label="Remove photo" danger leading={<Glyph name="trash" size={20} color={color.criticalText} />} onPress={() => void onPhoto('remove')} />
          ) : null}
        </View>
      </TrackerSheet>
    </Screen>
  );
}
