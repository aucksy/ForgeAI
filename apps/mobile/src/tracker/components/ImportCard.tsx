/**
 * Settings → "Bring in from Hevy or Strong": the start of the ONE flow that brings a member's
 * workouts (and then their routines) in from another app (R-319 item 4, owner 4 Nov 2026). It asks
 * one question, which app; each answer opens the import screen with that app's export steps. A Hevy
 * share link is inside the Hevy branch ("Have a Hevy routine link?"), not a button of its own here.
 */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';
import { IMPORT_FLOW_WORDS as W, type SourceApp } from '@/tracker/services/importFlowWords';

function AppChoice({ app, title, sub, divider }: { app: SourceApp; title: string; sub: string; divider?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      testID={`import-from-${app}`}
      onPress={() => {
        tap();
        router.push({ pathname: '/import', params: { from: app } });
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: color.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{title}</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 15 }}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

export function ImportCard() {
  return (
    <Card>
      <View style={{ gap: space.xs, marginBottom: space.sm }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {W.heading}
        </Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{W.question}</Text>
      </View>
      <AppChoice app="hevy" title={W.hevy} sub={W.hevySub} />
      <AppChoice app="strong" title={W.strong} sub={W.strongSub} divider />
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.sm, lineHeight: 15 }}>
        {W.privacy}
      </Text>
    </Card>
  );
}
