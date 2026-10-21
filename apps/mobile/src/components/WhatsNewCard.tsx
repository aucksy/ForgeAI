/** The Workout tab's one-time "New in this version" card (lib/whatsNew.ts). */
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { markWhatsNewSeen, readWhatsNew } from '@/lib/whatsNew';
import { color, space, type } from '@/theme/tokens';

export function WhatsNewCard() {
  const version = Constants.expoConfig?.version ?? null;
  const [lines, setLines] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let live = true;
    readWhatsNew(version)
      .then((l) => live && setLines(l))
      .catch((e: unknown) => console.warn('[whats new] failed', e));
    return () => {
      live = false;
    };
  }, [version]);
  if (!lines || !version) return null;

  const done = () => {
    setLines(null);
    markWhatsNewSeen(version).catch((e: unknown) => console.warn('[whats new] could not save', e));
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {`New in this version (${version})`}
      </Text>
      <View style={{ gap: space.xs }}>
        {lines.map((l) => (
          <View key={l} style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 7 }} />
            <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{l}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={done}
        accessibilityRole="button"
        accessibilityLabel="Got it. Hide what's new"
        style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Got it</Text>
      </Pressable>
    </Card>
  );
}
