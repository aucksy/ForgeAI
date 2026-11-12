/**
 * One question as a conversation (R-452, owner 12 Nov 2026: "the AI did actually answer in the beginning,
 * but then I had to probably correct it or send a top-up on it manually. So they should be able to identify
 * all this"): the member's question, then "Quick answer" with a small "automatic" tag (the AI's answer, with
 * "Did this solve it?"), then each "Reply from the MettleUp team" in time order, "New" until seen.
 * Used by the round button's sheet (FeedbackButton.tsx) and by Settings → Help and feedback (HelpQuestions.tsx).
 * The order: lib/helpHistory.ts conversationOf (PURE, tested).
 */
import { Text, View } from 'react-native';

import { HelpReply } from '@/components/feedback/HelpReply';
import { conversationOf, HELP_HISTORY_WORDS as W, type HelpQuestion } from '@/lib/helpHistory';
import { color, radius, space, type } from '@/theme/tokens';

function day(at: number): string {
  try {
    return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch (e) {
    console.warn('[help] date not shown', e);
    return '';
  }
}

function dayAndTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    console.warn('[help] reply time not shown', e);
    return '';
  }
}

function Tag({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <Text
      style={{
        fontFamily: type.bodyBold,
        fontSize: type.size.caption,
        color: strong ? color.onAccent : color.inkSecondary,
        backgroundColor: strong ? color.accent : color.surfaceRaised,
        borderRadius: radius.pill,
        borderWidth: strong ? 0 : 1,
        borderColor: color.border,
        paddingHorizontal: space.sm,
        overflow: 'hidden',
      }}
    >
      {label}
    </Text>
  );
}

/**
 * `newSince`: replies after this time show "New" (the screen passes the time seen when it opened, so a
 * reply stays "New" while it is on screen even though it already counts as read).
 */
export function HelpConversation({ q, now, newSince, first = false }: { q: HelpQuestion; now: number; newSince?: string; first?: boolean }) {
  const lines = conversationOf(q, now, newSince);
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: color.border }}>
      {lines.map((l, i) => {
        if (l.kind === 'question') {
          return (
            <View key="q" style={{ gap: space.xs }}>
              <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{day(l.at)}</Text>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{l.text}</Text>
            </View>
          );
        }
        if (l.kind === 'waiting') {
          return (
            <Text key="w" accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
              {W.waiting}
            </Text>
          );
        }
        if (l.kind === 'team-will-reply') {
          return (
            <Text key="t" style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
              {W.teamWillReply}
            </Text>
          );
        }
        if (l.kind === 'quick') {
          return (
            <View key="a" style={{ gap: space.xs }}>
              <View accessible accessibilityLabel={`${W.aiTitle}, ${W.aiTag}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>{W.aiTitle}</Text>
                <Tag label={W.aiTag} />
              </View>
              <HelpReply key={`${q.key}:${q.rated ?? ''}`} reply={{ id: l.id, text: l.text, ai: l.ai }} rated={l.rated} />
            </View>
          );
        }
        const when = dayAndTime(l.at);
        return (
          <View
            key={`r${i}`}
            accessible
            accessibilityLabel={`${W.replyTitle}${l.isNew ? `, ${W.newBadge}` : ''}${when ? `, ${when}` : ''}: ${l.text}`}
            style={{
              gap: space.xs,
              padding: space.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: l.isNew ? color.accent : color.border,
              backgroundColor: color.surfaceSunken,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
              <Text style={{ flexShrink: 1, fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>{W.replyTitle}</Text>
              {l.isNew ? <Tag label={W.newBadge} strong /> : null}
            </View>
            {when ? <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{when}</Text> : null}
            <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{l.text}</Text>
          </View>
        );
      })}
    </View>
  );
}
