import type { ReactNode } from 'react';
import { Switch, Text, View } from 'react-native';

import { NewDot } from '@/components/NewDot';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tap } from '@/lib/haptics';
import type { DotSpot } from '@/lib/newDots';
import { color, space, type } from '@/theme/tokens';

export interface SettingRowProps {
  icon?: IconName;
  title: string;
  caption?: string;
  /** Node docked on the right (switch, chip, text…). */
  right?: ReactNode;
  /** Draw a hairline above the row (use for every row but the first). */
  divider?: boolean;
  /** F198: this row is a new feature the member was led to: a small dot after the title (this visit only). */
  dot?: DotSpot | null;
}

/** One settings line: tinted icon dot, title + caption, right-docked control. */
export function SettingRow({ icon, title, caption, right, divider, dot }: SettingRowProps) {
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
        {dot ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, flexShrink: 1 }}>
              {title}
            </Text>
            <NewDot spot={dot} />
          </View>
        ) : (
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {title}
          </Text>
        )}
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
  dot?: DotSpot | null;
}

/** SettingRow with an ember-tracked RN Switch. */
export function ToggleRow({ icon, title, caption, value, onChange, locked, divider, dot }: ToggleRowProps) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      caption={caption}
      divider={divider}
      dot={dot}
      right={
        <Switch
          value={value}
          disabled={locked}
          // Screen readers name the switch, not just "switch, on" (every toggle row).
          accessibilityLabel={title}
          onValueChange={(v) => {
            if (locked) return;
            tap();
            onChange?.(v);
          }}
          trackColor={{ false: color.inkDisabled, true: color.accentDeep }}
          thumbColor={value ? color.accentBright : color.inkSecondary}
          ios_backgroundColor={color.inkDisabled}
        />
      }
    />
  );
}
