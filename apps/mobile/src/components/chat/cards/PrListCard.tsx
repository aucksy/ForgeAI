import { Text, View } from 'react-native';

import { Badge, Icon } from '@/components/ui';
import { tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { color, space, type } from '@/theme/tokens';

import type { PrView } from '../payload';
import { CardShell } from './CardShell';

const MAX_ROWS = 8;

/** Trophy list of personal records. */
export function PrListCard({ prs }: { prs: PrView[] }) {
  const shown = prs.slice(0, MAX_ROWS);
  return (
    <CardShell
      icon="trophy"
      iconColor={color.accentBright}
      title="Personal records"
      subtitle={`${prs.length} lifetime ${prs.length === 1 ? 'best' : 'bests'} on file`}
    >
      <View style={{ marginTop: space.sm }}>
        {shown.map((pr, i) => (
          <View
            key={`${pr.exerciseName}-${pr.kind}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingVertical: space.sm + 1,
              borderBottomWidth: i === shown.length - 1 ? 0 : 1,
              borderBottomColor: color.border,
            }}
          >
            <Icon
              name="trophy"
              size={15}
              color={pr.kind === 'e1rm' ? color.accentBright : color.inkFaint}
            />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
              >
                {pr.exerciseName}
              </Text>
              <Text
                style={{
                  fontFamily: type.mono,
                  fontSize: type.size.caption,
                  color: color.inkSecondary,
                  marginTop: 1,
                }}
              >
                {pr.kind === 'e1rm'
                  ? `e1RM ${trimNum(pr.value)} kg`
                  : `${trimNum(pr.weightKg)} kg × ${pr.reps}`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Badge
                label={pr.kind === 'e1rm' ? 'e1RM' : 'Weight'}
                tone={pr.kind === 'e1rm' ? 'accent' : 'neutral'}
              />
              {pr.dateISO ? (
                <Text
                  style={{
                    fontFamily: type.bodyMedium,
                    fontSize: type.size.caption,
                    color: color.inkMuted,
                  }}
                >
                  {tinyDate(pr.dateISO)}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {prs.length > MAX_ROWS ? (
          <Text
            style={{
              marginTop: space.sm,
              fontFamily: type.bodyMedium,
              fontSize: type.size.caption,
              color: color.inkMuted,
            }}
          >
            {`+ ${prs.length - MAX_ROWS} more in Progress`}
          </Text>
        ) : null}
      </View>
    </CardShell>
  );
}
