/**
 * "Your questions" under Settings → Help and feedback (R-319 item 10, R-320): every question sent from
 * this phone, newest first, with the AI's answer (and the "Did this solve it?" tap), a waiting line while
 * the answer is on its way, and the MettleUp team's reply ("New" until this screen has shown it).
 * Answers that came late and replies are asked for when the screen opens, every few seconds while an
 * answer is still on its way, and when a "the team replied" pop-up was tapped (it opens this screen).
 * Rules: lib/helpHistory.ts. Kept on the phone: lib/helpHistoryStore.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { HelpReply } from '@/components/feedback/HelpReply';
import { senderId } from '@/lib/feedback';
import { anyWaiting, HELP_HISTORY_WORDS as W, questionShows, type HelpQuestion } from '@/lib/helpHistory';
import { useHelpHistory } from '@/lib/helpHistoryStore';
import { color, radius, space, type } from '@/theme/tokens';

const POLL_MS = 5_000;

function day(at: number): string {
  try {
    return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch (e) {
    console.warn('[help] date not shown', e);
    return '';
  }
}

function Question({ q, isNew, now }: { q: HelpQuestion; isNew: boolean; now: number }) {
  const shows = questionShows(q, now);
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border }}>
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{day(q.at)}</Text>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{q.text}</Text>
      {shows === 'waiting' ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
          {W.waiting}
        </Text>
      ) : null}
      {shows === 'answer' ? <HelpReply key={`${q.key}:${q.rated ?? ''}`} reply={{ id: q.id, text: q.answer, ai: q.ai }} rated={q.rated} /> : null}
      {shows === 'team-will-reply' ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{W.teamWillReply}</Text>
      ) : null}
      {q.reply ? (
        <View
          accessibilityLabel={`${W.replyTitle}${isNew ? `, ${W.newBadge}` : ''}: ${q.reply}`}
          style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: isNew ? color.accent : color.border, backgroundColor: color.surfaceSunken }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={{ flexShrink: 1, fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>{W.replyTitle}</Text>
            {isNew ? (
              <Text
                style={{ fontFamily: type.bodyBold, fontSize: type.size.caption, color: color.onAccent, backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: space.sm, overflow: 'hidden' }}
              >
                {W.newBadge}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{q.reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function HelpQuestions() {
  const items = useHelpHistory((s) => s.items);
  const loaded = useHelpHistory((s) => s.loaded);
  const [now, setNow] = useState(() => Date.now());
  // The replies not seen when the screen opened stay "New" while it is open; they count as seen at once.
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set());
  const seenOnce = useRef(new Set<string>());

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

  // A reply arrives or is found: marked New here once, and seen in the store.
  useEffect(() => {
    const fresh = items.filter((q) => q.reply && !q.replySeen && !seenOnce.current.has(`${q.key}:${q.replyAt}`));
    if (fresh.length === 0) return;
    for (const q of fresh) seenOnce.current.add(`${q.key}:${q.replyAt}`);
    setNewKeys((prev) => new Set([...prev, ...fresh.map((q) => q.key)]));
    void useHelpHistory.getState().markSeen();
  }, [items]);

  // An answer on its way: ask again every few seconds, and redraw so "waiting" turns over in time.
  const waiting = anyWaiting(items, now);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void (async () => {
        await useHelpHistory.getState().refresh(await senderId());
      })();
    }, POLL_MS);
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
        items.map((q) => <Question key={q.key} q={q} isNew={newKeys.has(q.key)} now={now} />)
      )}
    </View>
  );
}
