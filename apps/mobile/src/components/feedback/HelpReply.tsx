/**
 * The help box's answer under "Help and feedback" (T22 step 1, R-277, 2 Nov 2026), used by the
 * floating button's sheet and by Settings → Help and feedback.
 *
 * An AI answer shows in a card with "Did this solve it? Yes / No". One tap, sent to the box beside the
 * message (lib/feedback.ts rateHelp); "No" tells them a person replies. Without an AI answer (no key,
 * the month's cap, an older server) only the plain thanks shows, as before.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FEEDBACK_WORDS, rateHelp, type HelpReply as Reply } from '@/lib/feedback';
import { color, radius, space, type } from '@/theme/tokens';

export function HelpReply({ reply }: { reply: Reply }) {
  const [rated, setRated] = useState<'yes' | 'no' | null>(null);

  if (!reply.ai) {
    return (
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.goodText }}>
        {reply.text}
      </Text>
    );
  }

  const tap = (helped: 'yes' | 'no') => {
    if (rated) return;
    setRated(helped);
    if (reply.id != null) void rateHelp(reply.id, helped);
  };

  return (
    <View
      style={{
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>
        {reply.text}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 16, color: color.inkMuted }}>{FEEDBACK_WORDS.aiNote}</Text>
      {rated ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.goodText }}>
          {rated === 'yes' ? FEEDBACK_WORDS.thanksYes : FEEDBACK_WORDS.thanksNo}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
          <Text style={{ flexGrow: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{FEEDBACK_WORDS.solved}</Text>
          {(['yes', 'no'] as const).map((h) => (
            <Pressable
              key={h}
              onPress={() => tap(h)}
              accessibilityRole="button"
              accessibilityLabel={`${FEEDBACK_WORDS.solved} ${h === 'yes' ? FEEDBACK_WORDS.yes : FEEDBACK_WORDS.no}`}
              style={{
                minHeight: 48,
                minWidth: 72,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: color.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.ink }}>{h === 'yes' ? FEEDBACK_WORDS.yes : FEEDBACK_WORDS.no}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
