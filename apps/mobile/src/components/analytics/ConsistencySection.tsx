import { Text, View } from 'react-native';

import { Heatmap } from '@/components/charts';
import { EmptyState, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { streakText } from '@/lib/streak';
import type { ConsistencyCell } from '@/types/models';

import { HeaderStat, Section } from './Section';

export interface ConsistencySectionProps {
  cells: ConsistencyCell[];
  rangeDays: number;
  /** THE streak (D9): weeks in a row with at least one workout. */
  streak: number;
  index: number;
}

/** GitHub-style training heatmap + the current week streak underneath (D9). */
export function ConsistencySection({ cells, rangeDays, streak, index }: ConsistencySectionProps) {
  const weeks = Math.min(26, Math.ceil(rangeDays / 7));
  const activeDays = cells.reduce((sum, c) => sum + (c.level > 0 ? 1 : 0), 0);
  const hasData = cells.length > 0;

  return (
    <Section
      title="Consistency"
      index={index}
      right={hasData ? <HeaderStat text={`${activeDays} active days`} /> : undefined}
    >
      {hasData ? (
        <>
          <Heatmap cells={cells} weeks={weeks} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              marginTop: space.lg,
            }}
          >
            <Icon name="flame" size={16} color={color.accent} />
            {streak > 0 ? (
              <Text
                style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
              >
                {streakText(streak)}{' '}
                <Text
                  style={{
                    fontFamily: type.body,
                    fontSize: type.size.sub,
                    color: color.inkMuted,
                  }}
                >
                  — keep the fire burning
                </Text>
              </Text>
            ) : (
              <Text
                style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}
              >
                No streak yet — one workout this week starts one
              </Text>
            )}
          </View>
        </>
      ) : (
        <EmptyState
          icon="flame"
          title="No data yet"
          body="Every training day fills a cell. Streaks build here."
        />
      )}
    </Section>
  );
}
