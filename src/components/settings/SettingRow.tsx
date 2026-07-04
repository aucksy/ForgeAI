import type { ReactNode } from 'react';
import { Switch, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

export interface SettingRowProps {
  icon?: IconName;
  title: string;
  caption?: string;
  /** Node docked on the right (switch, chip, text…). */
  right?: ReactNode;
  /** Draw a hairline above the row (use for every row but the first). */
  divider?: boolean;
}

/** One settings line: tinted icon dot, title + caption, right-docked control. */
export function SettingRow({ icon, title, caption, right, divider }: SettingRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: color.border,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: color.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={16} color={color.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {title}
        </Text>
        {caption ? (
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.caption,
              color: color.inkMuted,
              marginTop: 2,
              lineHeight: 15,
            }}
          >
            {caption}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export interface ToggleRowProps {
  icon?: IconName;
  title: string;
  caption?: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  /** Render the switch immovable (dark mode stays on — forever). */
  locked?: boolean;
  divider?: boolean;
}

/** SettingRow with an ember-tracked RN Switch. */
export function ToggleRow({ icon, title, caption, value, onChange, locked, divider }: ToggleRowProps) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      caption={caption}
      divider={divider}
      right={
        <Switch
          value={value}
          disabled={locked}
          onValueChange={(v) => {
            if (locked) return;
            tap();
            onChange?.(v);
          }}
          trackColor={{ false: color.inkFaint, true: color.accentDeep }}
          thumbColor={value ? color.accentBright : color.inkSecondary}
          ios_backgroundColor={color.inkFaint}
        />
      }
    />
  );
}
