/**
 * Gym messages, Phase 1: the inbox — the gym's messages, newest first, from the bell on the Shop
 * tab. Opening it marks what it shows as seen (the gym's panel counts "seen by"), and the bell's
 * number goes. Pull to refresh. A phone in no gym has no inbox: it goes back to the Shop tab.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { kindWord, sentText, type InboxMessage } from './inbox';
import { inboxFor, useGymInbox } from './inboxStore';
import { markInboxSeen, refreshInbox } from './gymActions';
import { useGymShop } from './gymStore';
import { QuietLine, leave } from './ShopParts';

export function InboxScreen() {
  const router = useRouter();
  const link = useGymShop((s) => s.link);
  const memberId = link?.memberId ?? null;
  const messages = useGymInbox((s) => inboxFor(s, memberId));
  const [pulling, setPulling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!link) leave(router, '/shop');
  }, [link, router]);

  const refresh = useCallback(async (byPull: boolean) => {
    if (byPull) setPulling(true);
    setProblem(await refreshInbox());
    setPulling(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh(false);
    }, [refresh]),
  );

  // What is on screen is seen: the bell's number goes, and the gym hears.
  const unseen = messages.filter((m) => !m.seen).map((m) => m.id).join(',');
  useEffect(() => {
    if (unseen) void markInboxSeen(unseen.split(','));
  }, [unseen]);

  return (
    <Screen title="Messages" subtitle={link ? `From ${link.gymName}` : undefined} onBack={() => leave(router, '/shop')} scroll={false} noPad>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        <QuietLine text={problem} />
        {messages.length === 0 ? (
          <EmptyState icon="list" title="No messages yet" body="When your gym sends news — a holiday, new timings, an offer — it shows here." />
        ) : (
          messages.map((m) => <MessageCard key={m.id} m={m} />)
        )}
      </ScrollView>
    </Screen>
  );
}

function MessageCard({ m }: { m: InboxMessage }) {
  const highlight = m.kind === 'offer' || m.kind === 'event' || m.kind === 'closed';
  return (
    <View
      accessible
      accessibilityLabel={`${kindWord(m.kind)}. ${m.title}. ${m.body} Sent ${sentText(m.createdAt)}.`}
      style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.lg, gap: space.xs }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: highlight ? color.accent : color.inkMuted }}>
          {kindWord(m.kind)}
        </Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{sentText(m.createdAt)}</Text>
      </View>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>{m.title}</Text>
      {m.body ? <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{m.body}</Text> : null}
    </View>
  );
}
