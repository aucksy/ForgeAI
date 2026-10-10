/**
 * Credits (Phase 0, EX-05): the pictures and fonts made by others that ForgeAI uses, who made
 * them, their licence in words with a link, and what we changed. Opened from the credit line
 * under an exercise drawing and from Profile.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Card, IconButton, Screen } from '@/components/ui';
import { CREDITS, type Credit } from '@/lib/credits';
import { color, space, type } from '@/theme/tokens';

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

function LinkLine({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => open(url)} accessibilityRole="link" accessibilityLabel={label} hitSlop={6} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{label}</Text>
    </Pressable>
  );
}

function CreditCard({ c }: { c: Credit }) {
  const [full, setFull] = useState(false);
  const body = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 };
  return (
    <Card style={{ gap: space.xs, marginBottom: space.lg }}>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{c.what}</Text>
      <Text style={body}>By {c.author}</Text>
      <Text style={body}>From {c.source}</Text>
      <Text style={body}>Licence: {c.licenceName}</Text>
      {c.changes ? <Text style={body}>Changed by ForgeAI: {c.changes}</Text> : null}
      <LinkLine label="Read the licence" url={c.licenceUrl} />
      <LinkLine label="See the source" url={c.sourceUrl} />
      {c.fullText ? (
        <>
          <Pressable
            onPress={() => setFull((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: full }}
            hitSlop={6}
            style={{ minHeight: 32, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
              {full ? 'Hide the licence text' : 'Show the licence text'}
            </Text>
          </Pressable>
          {full ? <Text style={{ ...body, fontSize: type.size.caption + 1 }}>{c.fullText}</Text> : null}
        </>
      ) : null}
    </Card>
  );
}

export default function CreditsScreen() {
  const router = useRouter();
  return (
    <Screen
      title="Credits"
      subtitle="Pictures and fonts made by others"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ paddingBottom: space.xxl }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19, marginBottom: space.lg }}>
          Thank you to the people who share their work freely.
        </Text>
        {CREDITS.map((c) => (
          <CreditCard key={c.id} c={c} />
        ))}
      </View>
    </Screen>
  );
}
