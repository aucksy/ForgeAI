/**
 * "Your questions" under Settings → Help and feedback (R-319 item 10, R-320): every question sent from
 * this phone, newest first, each as a conversation (HelpConversation, R-452): the question, the quick
 * automatic answer (with "Did this solve it?"), then every reply from the MettleUp team in time order,
 * "New" until this screen has shown it.
 * Answers that came late and replies are asked for when the screen opens, every few seconds while an
 * answer is still on its way, every minute while the screen stays open (R-452: before, a reply typed in HQ
 * while the member had this page open never showed until they left and came back), and when a "the team
 * replied" pop-up was tapped (it opens this screen). The red dot on the round button counts what is unread.
 * Rules: lib/helpHistory.ts. Kept on the phone: lib/helpHistoryStore.ts.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { HelpConversation } from '@/components/feedback/HelpConversation';
import { senderId } from '@/lib/feedback';
import { anyWaiting, HELP_HISTORY_WORDS as W } from '@/lib/helpHistory';
import { useHelpHistory } from '@/lib/helpHistoryStore';
import { color, space, type } from '@/theme/tokens';

const POLL_MS = 5_000;
/** While the page stays open with nothing on its way, the team's replies are asked for this often. */
const SLOW_POLL_MS = 60_000;

/**
 * The replies seen before this screen opened, per question: what came after stays "New" while it is open,
 * though it counts as read at once (the red dot goes). A reply that arrives while it is open is New too.
 */
function useSeenWhenOpened(): Map<string, string> {
  const items = useHelpHistory((s) => s.items);
  const loaded = useHelpHistory((s) => s.loaded);
  const [seen, setSeen] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!loaded || seen) return;
    setSeen(new Map(items.map((q) => [q.key, q.seenAt])));
  }, [loaded, items, seen]);
  return seen ?? new Map();
}

export function HelpQuestions() {
  const items = useHelpHistory((s) => s.items);
  const loaded = useHelpHistory((s) => s.loaded);
  const [now, setNow] = useState(() => Date.now());
  const seenWhenOpened = useSeenWhenOpened();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const store = useHelpHistory.getState();
      await store.load();
      await store.refresh(await senderId());
      if (!alive) return;
      setNow(Date.now());
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Shown on screen = read: the red dot on the round button goes.
  useEffect(() => {
    if (loaded && items.some((q) => q.replies.length && q.replies[q.replies.length - 1].at > q.seenAt)) void useHelpHistory.getState().markSeen();
  }, [items, loaded]);

  // An answer on its way: ask again every few seconds, and redraw so "waiting" turns over in time.
  // Nothing on its way: ask once a minute for the team's replies while the page stays open.
  const waiting = anyWaiting(items, now);
  useEffect(() => {
    const t = setInterval(
      () => {
        setNow(Date.now());
        void (async () => {
          await useHelpHistory.getState().refresh(await senderId());
        })();
      },
      waiting ? POLL_MS : SLOW_POLL_MS,
    );
    return () => clearInterval(t);
  }, [waiting]);

  if (!loaded) return null;
  return (
    <View accessibilityLabel={W.title} style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodyBold, fontSize: type.size.h3, color: color.ink }}>
        {W.title}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{W.empty}</Text>
      ) : (
        items.map((q) => <HelpConversation key={q.key} q={q} now={now} newSince={seenWhenOpened.get(q.key) ?? ''} />)
      )}
    </View>
  );
}
