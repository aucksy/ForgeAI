import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

export interface ChipGroupProps<T extends string> {
  /** Small overline label above the chips (e.g. "PROVIDER"). */
  label?: string;
  options: readonly ChipOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}

/** Labelled single-select chip row (provider, model, units, language…). */
export function ChipGroup<T extends string>({
  label,
  options,
  selectedId,
  onSelect,
}: ChipGroupProps<T>) {
  return (
    <View>
      {label ? (
        <Text
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.caption,
            color: color.inkMuted,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            marginBottom: space.sm,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            icon={o.icon}
            selected={o.id === selectedId}
            onPress={() => {
              if (o.id !== selectedId) onSelect(o.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}
