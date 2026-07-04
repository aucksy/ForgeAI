import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { color, radius, shadow, space, type } from '@/theme/tokens';

export interface CardShellProps {
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared chrome for the rich chat cards: surface plate + icon chip + header.
 * Deliberately unanimated — the message wrapper already animates entrance.
 */
export function CardShell({
  icon,
  iconColor = color.accent,
  iconBg = color.accentSoft,
  title,
  subtitle,
  right,
  children,
}: CardShellProps) {
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.lg,
        ...shadow.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: type.bodyMedium,
                fontSize: type.size.caption,
                color: color.inkMuted,
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Hairline divider used inside cards. */
export function Divider({ mt = space.md, mb = space.md }: { mt?: number; mb?: number }) {
  return <View style={{ height: 1, backgroundColor: color.border, marginTop: mt, marginBottom: mb }} />;
}
