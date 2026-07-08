import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { relativeDay, toISO } from '@/lib/date';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { ChatMessage } from '@/types/models';

import { MealCard } from './cards/MealCard';
import { NutritionSummaryCard } from './cards/NutritionSummaryCard';
import { PrListCard } from './cards/PrListCard';
import { StatsCard } from './cards/StatsCard';
import { WorkoutLoggedCard } from './cards/WorkoutLoggedCard';
import { WorkoutPlanCard } from './cards/WorkoutPlanCard';
import {
  parseMeal,
  parseNutritionSummary,
  parsePrList,
  parseStats,
  parseWorkoutLogged,
  parseWorkoutPlan,
} from './payload';
import { TypingDots } from './TypingDots';

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Render a tiny centred timestamp above this message (new time group). */
  showTimestamp: boolean;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function Timestamp({ ms }: { ms: number }) {
  return (
    <Text style={styles.timestamp}>{`${relativeDay(toISO(new Date(ms)))} · ${fmtClock(ms)}`}</Text>
  );
}

/**
 * Every rich card guards its payload shape; a failed parse returns null and
 * the plain-text bubble (always present on the message) carries the reply.
 */
function renderCard(message: ChatMessage): ReactElement | null {
  switch (message.kind) {
    case 'workout_plan': {
      const plan = parseWorkoutPlan(message.payload);
      return plan ? <WorkoutPlanCard plan={plan} /> : null;
    }
    case 'workout_logged': {
      const data = parseWorkoutLogged(message.payload);
      return data ? <WorkoutLoggedCard data={data} /> : null;
    }
    case 'meal_logged': {
      const meal = parseMeal(message.payload);
      return meal ? <MealCard meal={meal} /> : null;
    }
    case 'nutrition_summary': {
      const data = parseNutritionSummary(message.payload);
      return data ? <NutritionSummaryCard data={data} /> : null;
    }
    case 'pr_list': {
      const prs = parsePrList(message.payload);
      return prs ? <PrListCard prs={prs} /> : null;
    }
    case 'stats': {
      const rows = parseStats(message.payload);
      return rows ? <StatsCard rows={rows} /> : null;
    }
    default:
      return null;
  }
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={styles.userBubble}>
        {message.imageUri ? (
          <Image
            source={{ uri: message.imageUri }}
            style={{
              width: 190,
              height: 140,
              borderRadius: radius.sm,
              marginBottom: message.text ? space.sm : 0,
            }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
        {message.text ? <Text style={styles.userText}>{message.text}</Text> : null}
      </View>
    </View>
  );
}

function CoachContent({ message }: { message: ChatMessage }) {
  if (message.pending) {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <View style={styles.coachBubble}>
          <TypingDots />
        </View>
      </View>
    );
  }

  if (message.kind === 'error') {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <View style={styles.errorBubble}>
          <Icon name="zap" size={15} color={color.warning} />
          <Text style={styles.errorText}>{message.text || 'Something went wrong.'}</Text>
        </View>
      </View>
    );
  }

  const card = message.kind !== 'text' ? renderCard(message) : null;
  const hasText = message.text.trim().length > 0;

  return (
    <View style={{ alignItems: 'flex-start', gap: space.sm }}>
      {hasText ? (
        <View style={styles.coachBubble}>
          <Text style={styles.coachText}>{message.text}</Text>
        </View>
      ) : null}
      {card ? <View style={styles.cardWrap}>{card}</View> : null}
      {!hasText && !card ? (
        <View style={styles.coachBubble}>
          <Text style={styles.coachText}>…</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MessageBubble({ message, showTimestamp }: MessageBubbleProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.base)}
      style={{ marginBottom: space.md }}
    >
      {showTimestamp ? <Timestamp ms={message.createdAt} /> : null}
      {message.role === 'user' ? (
        <UserBubble message={message} />
      ) : (
        <CoachContent message={message} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  timestamp: {
    alignSelf: 'center',
    fontFamily: type.bodyMedium,
    fontSize: type.size.caption,
    color: color.inkMuted,
    marginTop: space.xs,
    marginBottom: space.md,
  },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 59, 0.22)',
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.md - 2,
  },
  userText: {
    fontFamily: type.body,
    fontSize: type.size.body,
    color: color.ink,
    lineHeight: 21,
  },
  coachBubble: {
    maxWidth: '86%',
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.md,
  },
  coachText: {
    fontFamily: type.body,
    fontSize: type.size.body,
    color: color.ink,
    lineHeight: 22,
  },
  errorBubble: {
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: 'rgba(250, 178, 25, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(250, 178, 25, 0.32)',
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.md,
  },
  errorText: {
    flexShrink: 1,
    fontFamily: type.body,
    fontSize: type.size.sub + 1,
    color: color.inkSecondary,
    lineHeight: 20,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 480,
  },
});
