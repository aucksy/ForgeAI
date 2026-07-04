import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/lib/haptics';
import { color, type } from '@/theme/tokens';

/**
 * Structural subset of @react-navigation/bottom-tabs' BottomTabBarProps —
 * that package isn't hoisted to the project root, so we type what we use.
 */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

/**
 * Custom bottom tab bar — placeholder look, upgraded by the UI-kit module
 * (icons, glass, active pill, micro-interactions). Keep the same props/API.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: color.border,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingTop: 10,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              tap();
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}
          >
            <Text
              style={{
                color: focused ? color.accent : color.inkMuted,
                fontFamily: focused ? type.bodyBold : type.bodyMedium,
                fontSize: type.size.sub,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
