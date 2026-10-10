/**
 * Ready programs — Phase 4. Three groups (a full gym, dumbbells only, home), each from
 * beginner to advanced. Tap one to see its routines, then follow it or keep it in your
 * routines.
 */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { goBack } from '@/lib/goBack';
import { Card, Icon, Screen, SectionHeader } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { programGroups, programMeta } from '@/tracker/plans/programs';

export default function ProgramsScreen() {
  const router = useRouter();
  return (
    <Screen
      title="Ready programs"
      subtitle="Follow one as your plan, or keep it in your routines."
      onBack={() => goBack(router, '/workout')}
    >
      <View style={{ gap: space.lg }}>
        {programGroups().map((g) => (
          <View key={g.equipment}>
            <SectionHeader title={g.label} />
            <Card style={{ paddingVertical: space.xs }}>
              {g.programs.map((p, i) => (
                <Pressable
                  key={p.key}
                  onPress={() => router.push({ pathname: '/programs/[key]', params: { key: p.key } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${programMeta(p)}`}
                  style={{
                    minHeight: 64,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.sm,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: color.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{p.name}</Text>
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>
                      {programMeta(p)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={color.inkMuted} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  );
}
