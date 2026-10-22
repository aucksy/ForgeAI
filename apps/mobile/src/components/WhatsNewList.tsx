/** R-56: updates as a list (the "What's new" card's earlier updates, and Settings → What's new). */
import { Text, View } from 'react-native';

import type { WhatsNewEntry } from '@/lib/whatsNew';
import { color, space, type } from '@/theme/tokens';

export function WhatsNewLines({ lines }: { lines: readonly string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 7 }} />
          <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Each update: "Version 0.50.0 · 22 Oct", then its lines. */
export function WhatsNewList({ entries }: { entries: readonly WhatsNewEntry[] }) {
  return (
    <View style={{ gap: space.md }}>
      {entries.map((e) => (
        <View key={e.version} style={{ gap: space.xs }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
            {`Version ${e.version} · ${e.date}`}
          </Text>
          <WhatsNewLines lines={e.lines} />
        </View>
      ))}
    </View>
  );
}
