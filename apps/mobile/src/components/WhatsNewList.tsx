/**
 * R-56: updates as a list (the "What's new" card's earlier updates, and Settings → What's new).
 * R-98 (owner, 24 Oct 2026): a change with a place to try it carries a button that opens that screen
 * or setting at once ("provide an option to check that functionality immediately"). A tab is switched
 * to (navigate), never stacked on top of Settings; a settings page opens on top (push).
 */
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { goFor, type WhatsNewEntry, type WhatsNewLine, type WhatsNewTab } from '@/lib/whatsNew';
import { useGymShop } from '@/shop/gymStore';
import { requestGymSection } from '@/shop/gymSectionRequest';
import { color, space, type } from '@/theme/tokens';

interface LinesProps {
  lines: readonly WhatsNewLine[];
  /** Called just before a button opens its screen (the card hides itself). */
  onGo?: () => void;
  /** The page this list is on: a button to it is left out. */
  here?: string;
}

export function WhatsNewLines({ lines, onGo, here }: LinesProps) {
  const inGym = useGymShop((s) => s.link != null);
  return (
    <View style={{ gap: space.sm }}>
      {lines.map((l, i) => {
        const go = goFor(l, inGym, here);
        return (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 7 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{l.text}</Text>
              {go ? (
                <Pressable
                  onPress={() => {
                    onGo?.();
                    if (l.go?.section && inGym) requestGymSection(l.go.section);
                    if (go.tab) router.navigate(go.href as WhatsNewTab);
                    else router.push(go.href as `/settings/${string}`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={go.label}
                  hitSlop={4}
                  style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{`${go.label} ›`}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Each update: "Version 0.50.0 · 22 Oct", then its lines. */
export function WhatsNewList({ entries, onGo, here }: { entries: readonly WhatsNewEntry[]; onGo?: () => void; here?: string }) {
  return (
    <View style={{ gap: space.md }}>
      {entries.map((e) => (
        <View key={e.version} style={{ gap: space.xs }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
            {`Version ${e.version} · ${e.date}`}
          </Text>
          <WhatsNewLines lines={e.lines} onGo={onGo} here={here} />
        </View>
      ))}
    </View>
  );
}
