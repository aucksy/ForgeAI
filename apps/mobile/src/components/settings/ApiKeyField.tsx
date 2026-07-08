import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton } from '@/components/ui';
import { tap, thud } from '@/lib/haptics';
import { maskKey } from '@/lib/keys';
import { color, radius, space, type } from '@/theme/tokens';

export interface ApiKeyFieldProps {
  label: string;
  placeholder: string;
  /** SecureStore getter from @/lib/keys. */
  load: () => Promise<string | null>;
  /** SecureStore setter from @/lib/keys (empty string deletes). */
  save: (value: string) => Promise<void>;
  divider?: boolean;
}

/**
 * Masked API-key row with inline secure editing. The raw key only ever lives
 * in SecureStore and (briefly) in the input draft — never logged, never
 * toasted, never rendered after save.
 */
export function ApiKeyField({ label, placeholder, load, save, divider }: ApiKeyFieldProps) {
  const [masked, setMasked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    load()
      .then((k) => {
        if (alive) setMasked(maskKey(k));
      })
      .catch(() => {
        if (alive) setMasked('Not set');
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save(draft);
      const trimmed = draft.trim();
      setMasked(maskKey(trimmed.length > 0 ? trimmed : null));
      setDraft('');
      setEditing(false);
      thud();
    } catch {
      Alert.alert('Could not save key', 'Secure storage was unavailable — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setDraft('');
    setEditing(false);
  };

  return (
    <View
      style={{
        paddingVertical: space.md,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: color.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: space.md }}>
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.sub,
              color: color.inkSecondary,
            }}
          >
            {label}
          </Text>
          {!editing ? (
            <Text
              style={{
                fontFamily: type.mono,
                fontSize: type.size.body,
                color: masked === 'Not set' ? color.inkMuted : color.ink,
                marginTop: 3,
              }}
            >
              {masked ?? '••••'}
            </Text>
          ) : null}
        </View>
        {!editing ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              tap();
              setDraft('');
              setEditing(true);
            }}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: color.accentSoft,
            }}
          >
            <Text
              style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}
            >
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View style={{ marginTop: space.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={color.inkFaint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={{
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.borderStrong,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: 10,
              color: color.ink,
              fontFamily: type.mono,
              fontSize: type.size.sub,
            }}
          />
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <GhostButton label={saving ? 'Saving…' : 'Save'} icon="check" onPress={() => void onSave()} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label="Cancel" icon="close" onPress={onCancel} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
