/** A one-field sheet for naming something (a new folder, a renamed one) — Phase 4. */
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { TrackerSheet } from './TrackerSheet';

export function NameSheet({
  visible,
  title,
  initial,
  placeholder,
  action,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial: string;
  placeholder: string;
  /** The button's words: "Create folder", "Save name". */
  action: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  // A fast double tap must save once (the sheet takes a moment to close).
  const saved = useRef(false);
  useEffect(() => {
    if (visible) {
      setName(initial);
      saved.current = false;
    }
  }, [visible, initial]);
  const ok = name.trim().length > 0;
  const save = (): void => {
    if (!ok || saved.current) return;
    saved.current = true;
    onSave(name.trim());
  };
  return (
    <TrackerSheet visible={visible} title={title} onClose={onClose}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={placeholder}
        placeholderTextColor={color.inkMuted}
        autoFocus
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel={placeholder}
        style={{
          height: 52,
          paddingHorizontal: space.md,
          borderRadius: radius.md,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
          fontFamily: type.bodySemi,
          fontSize: type.size.body,
          color: color.ink,
        }}
      />
      <PrimaryButton label={action} icon="check" disabled={!ok} onPress={save} />
    </TrackerSheet>
  );
}
