/**
 * The Workout tab's one-time "New in this version" card (lib/whatsNew.ts).
 * R-56 (owner, 22 Oct 2026): "See earlier updates" opens the updates before this one, in the card.
 * R-98 (24 Oct 2026): the last 3 updates in all (this one + 2), each change with a button to try it where it has one.
 * R-401 (8 Nov 2026): never next to the update full screen; not again for lines that screen already showed.
 */
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useAppUpdate } from '@/lib/updateStore';
import { earlierUpdates, markWhatsNewSeen, readWhatsNew, type WhatsNewLine } from '@/lib/whatsNew';
import { color, space, type } from '@/theme/tokens';

import { useReportWant, type NoticeSlotProps } from './noticeSlot';
import { WhatsNewLines, WhatsNewList } from './WhatsNewList';

export function WhatsNewCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const version = Constants.expoConfig?.version ?? null;
  const [lines, setLines] = useState<readonly WhatsNewLine[] | null>(null);
  const [open, setOpen] = useState(false);
  // R-401 (owner, 8 Nov 2026): while a newer version waits, its full screen and the orange line say what
  // is new; this card about the installed version would be a second, older What's new.
  const updateWaiting = useAppUpdate((s) => s.key != null);
  useEffect(() => {
    let live = true;
    readWhatsNew(version)
      .then((l) => live && setLines(l))
      .catch((e: unknown) => console.warn('[whats new] failed', e));
    return () => {
      live = false;
    };
  }, [version]);
  useReportWant(lines != null && version != null && !updateWaiting, onWant);
  if (!lines || !version || hidden || updateWaiting) return null;

  const earlier = earlierUpdates(version);
  const done = () => {
    setLines(null);
    onDone?.();
    markWhatsNewSeen(version).catch((e: unknown) => console.warn('[whats new] could not save', e));
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: type.bodySemi,
          fontSize: type.size.body,
          color: color.ink,
        }}
      >
        {`New in this version (${version})`}
      </Text>
      <WhatsNewLines lines={lines} onGo={done} />
      {open && earlier.length > 0 ? (
        <View
          style={{
            paddingTop: space.sm,
            borderTopWidth: 1,
            borderTopColor: color.border,
          }}
        >
          <WhatsNewList entries={earlier} onGo={done} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg }}>
        <Pressable
          onPress={done}
          accessibilityRole="button"
          accessibilityLabel="Got it. Hide what's new"
          style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}
        >
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.sub,
              color: color.accent,
            }}
          >
            Got it
          </Text>
        </Pressable>
        {earlier.length > 0 ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Hide earlier updates' : `See the ${earlier.length} earlier updates`}
            style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}
          >
            <Text
              style={{
                fontFamily: type.bodySemi,
                fontSize: type.size.sub,
                color: color.accent,
              }}
            >
              {open ? 'Hide earlier updates' : 'See earlier updates'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
