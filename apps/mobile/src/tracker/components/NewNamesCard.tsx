/**
 * Audit IM-15 — the names in a Hevy / Strong file or link that ForgeAI does not know, each with
 * ForgeAI's closest exercise: "Same as ForgeAI's Seated Cable Row?" Yes / Keep as new. Names
 * ForgeAI knows under another name are listed with both ("Chest Fly (Machine) → Pec Deck Fly").
 * Used by the history import's preview and the routine-link steps.
 */
import { Text, View } from 'react-native';

import { Card, Chip, FoldSection } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import type { NameSuggestion } from '../services/importMatch';

const CAPTION = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 } as const;

/** One name with a suggested match: the question and its two answers. */
export function MatchRow({ s, same, onAnswer }: { s: NameSuggestion; same: boolean; onAnswer: (same: boolean) => void }) {
  if (!s.match) return null;
  return (
    <View style={{ gap: space.xs, paddingVertical: space.sm }}>
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{s.title}</Text>
      <Text style={CAPTION}>Same as ForgeAI’s {s.match.name}?</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 2 }}>
        <Chip label="Yes" icon={same ? 'check' : undefined} selected={same} onPress={() => onAnswer(true)} />
        <Chip label="Keep as new" icon={!same ? 'check' : undefined} selected={!same} onPress={() => onAnswer(false)} />
      </View>
    </View>
  );
}

/** "Chest Fly (Machine) → Pec Deck Fly", folded under a count. */
export function RenamedList({ renamed }: { renamed: readonly { from: string; to: string }[] }) {
  if (renamed.length === 0) return null;
  return (
    <FoldSection title="Named differently in ForgeAI" count={renamed.length} noun="exercise">
      <Card style={{ gap: space.xs }}>
        {renamed.map((r) => (
          <Text key={r.from} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.ink }}>
            {r.from} → {r.to}
          </Text>
        ))}
      </Card>
    </FoldSection>
  );
}

/**
 * The history import's list: names with a suggestion ask "Same as …?"; the others are added as
 * the member's own exercises (listed, folded).
 */
export function NewNamesCard({
  suggestions,
  same,
  onAnswer,
}: {
  suggestions: readonly NameSuggestion[];
  same: ReadonlySet<string>;
  onAnswer: (title: string, same: boolean) => void;
}) {
  const asked = suggestions.filter((s) => s.match);
  const plain = suggestions.filter((s) => !s.match);
  if (suggestions.length === 0) return null;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {suggestions.length} name{suggestions.length === 1 ? ' is' : 's are'} new to ForgeAI
        </Text>
        <Text style={CAPTION}>
          {asked.length > 0
            ? 'Say “Yes” and its history joins ForgeAI’s exercise. “Keep as new” adds it as your own exercise with this name.'
            : 'Each is added as your own exercise with the same name, so its history stays with it.'}
        </Text>
      </View>
      {asked.length > 0 ? (
        <Card>
          {asked.map((s) => (
            <MatchRow key={s.title} s={s} same={same.has(s.title)} onAnswer={(v) => onAnswer(s.title, v)} />
          ))}
        </Card>
      ) : null}
      {plain.length > 0 ? (
        <FoldSection title={asked.length > 0 ? 'Added as your own' : 'Added as your own exercises'} count={plain.length} noun="exercise">
          <Card style={{ gap: space.xs }}>
            {plain.map((s) => (
              <Text key={s.title} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.ink }}>
                {s.title}
              </Text>
            ))}
          </Card>
        </FoldSection>
      ) : null}
    </View>
  );
}
