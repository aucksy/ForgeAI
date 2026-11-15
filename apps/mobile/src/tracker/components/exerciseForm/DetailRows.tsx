/**
 * R-572 (owner, 15 Nov 2026, option A): the "Details" card of the New exercise / Edit exercise form and
 * the sheets its rows open. Each row: label left, the current value right, a chevron; a tap opens a sheet
 * that changes that one thing. A one-choice sheet closes on the pick; "Also works" (several muscles)
 * stays open until "Done".
 *
 * The floating feedback button docks as a 24 dp tab on a screen edge, over the outer 4 dp of a 20 dp
 * page margin. The card keeps a 4 dp inner margin, so no row's touch area reaches under that tab.
 */
import { Pressable, Text, View } from 'react-native';

import { Card, Chip, Icon, PrimaryButton, Sheet } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';

import type { MuscleGroupChoice } from './formChoices';

export interface DetailRowSpec {
  /** The row's id end: testID `exercise-row-<kind>` (phone tests tap it). */
  kind: string;
  label: string;
  value: string;
  /** The value is still missing: shown in the accent colour. */
  missing?: boolean;
  /** Can't be changed (no chevron, no tap). */
  locked?: boolean;
  onPress: () => void;
}

/** The card of rows; hairlines between them. */
export function DetailRows({ rows }: { rows: readonly DetailRowSpec[] }) {
  return (
    <Card style={{ padding: space.xs }}>
      {rows.map((r, i) => (
        <View key={r.kind}>
          {i > 0 ? <View style={{ height: 1, marginHorizontal: space.md, backgroundColor: color.border }} /> : null}
          <DetailRow row={r} />
        </View>
      ))}
    </Card>
  );
}

function DetailRow({ row }: { row: DetailRowSpec }) {
  return (
    <Pressable
      testID={`exercise-row-${row.kind}`}
      onPress={row.locked ? undefined : row.onPress}
      disabled={row.locked}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(row.locked) }}
      accessibilityLabel={`${row.label}, ${row.value}`}
      accessibilityHint={row.locked ? undefined : 'Opens a list to change it'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 56,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surfaceSunken : 'transparent',
      })}
    >
      <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkMuted, flexShrink: 0, maxWidth: '55%' }}>{row.label}</Text>
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          textAlign: 'right',
          fontFamily: type.bodySemi,
          fontSize: type.size.body,
          color: row.missing ? color.accent : color.ink,
        }}
      >
        {row.value}
      </Text>
      {row.locked ? null : <Icon name="chevron-right" size={16} color={color.inkFaint} />}
    </Pressable>
  );
}

/** The plain line under a sheet's title (in the body, so a long one never gets cut). */
function SheetLine({ text }: { text: string }) {
  return <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{text}</Text>;
}

export interface Choice<K extends string> {
  key: K;
  label: string;
  /** One more plain line under the label (optional). */
  detail?: string;
}

/** One-of-many sheet: full-width rows, the picked one ticked. A tap picks and the caller closes it. */
export function ChoiceSheet<K extends string>({
  kind,
  visible,
  title,
  line,
  choices,
  value,
  onPick,
  onClose,
}: {
  kind: string;
  visible: boolean;
  title: string;
  line: string;
  choices: readonly Choice<K>[];
  value: K | null;
  onPick: (key: K) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <SheetLine text={line} />
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {choices.map((c) => {
          const selected = c.key === value;
          return (
            <Pressable
              key={c.key}
              testID={`exercise-pick-${kind}-${c.key}`}
              onPress={() => onPick(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={c.detail ? `${c.label}. ${c.detail}` : c.label}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 52,
                paddingVertical: space.sm,
                paddingHorizontal: space.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? color.accent : color.border,
                backgroundColor: selected ? color.accentSoft : pressed ? color.surfaceSunken : color.surface,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: selected ? color.accent : color.ink }}>{c.label}</Text>
                {c.detail ? (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, marginTop: 2 }}>{c.detail}</Text>
                ) : null}
              </View>
              {selected ? <Icon name="check" size={18} color={color.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/**
 * The muscle sheet: chips under small headings (Chest and shoulders, Back, Arms and core, Legs, Other).
 * One muscle ("Main muscle"): a tap picks, and the caller closes it. Several ("Also works"): a tap adds or
 * takes off; "Done" closes.
 */
export function MuscleSheet({
  kind,
  visible,
  title,
  line,
  groups,
  picked,
  multi,
  onPick,
  onClose,
}: {
  kind: string;
  visible: boolean;
  title: string;
  line: string;
  groups: readonly MuscleGroupChoice[];
  picked: readonly Muscle[];
  multi?: boolean;
  onPick: (m: Muscle) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={multi ? <PrimaryButton label="Done" icon="check" onPress={onClose} /> : undefined}
    >
      <SheetLine text={line} />
      {groups.map((g) => (
        <View key={g.title} style={{ gap: space.sm }}>
          <Text
            accessibilityRole="header"
            style={{ fontFamily: type.bodyBold, fontSize: type.size.caption, letterSpacing: 0.7, textTransform: 'uppercase', color: color.inkFaint }}
          >
            {g.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {g.muscles.map((m) => (
              <View key={m} testID={`exercise-pick-${kind}-${m}`}>
                <Chip label={MUSCLE_LABEL[m]} role={multi ? 'checkbox' : 'radio'} selected={picked.includes(m)} onPress={() => onPick(m)} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Sheet>
  );
}
